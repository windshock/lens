// click_guard.js — 모든 페이지(ISOLATED). 캡처 단계에서 위험한 클릭을 가로채
// 검사 결과 나올 때까지 보류, 위험 판정이면 차단 + 경고, 안전이면 통과.

(function () {
  if (window.__pgClickGuardInstalled) return;
  window.__pgClickGuardInstalled = true;

  // (A) Cascade loop 차단 — SW가 hidden scan tab을 열 때 URL에 `#__pg_scan=1` 마커 박음.
  // 여기서 동기적으로 검사. SW 라운드트립 race 없음.
  if (/(^|[#&])__pg_scan=/.test(location.hash)) {
    console.debug("[pg click_guard] skip — scanning hidden tab");
    return;
  }

  const DANGEROUS_URI_RE = /^(applescript|ms-msdt|ms-msvr|ms-search|search-ms|shell|vbscript|jar|telnet):/i;
  const EXEC_EXT_RE = /\.(exe|dmg|pkg|msi|bat|cmd|ps1|vbs|jar|scr|hta|app|command|scpt|sh|run|deb|rpm|appimage|appx)(\?|$)/i;
  // 클립보드 카피 의심 버튼: 단어 "copy/verify/I'm not a robot" 류가 텍스트의 *전부* 인 경우만.
  // 단어 경계 + 전체-텍스트 매치 — 'Copyright', 'Verify my email', 'copy-icon-container' 등 false match 제거.
  const STRICT_COPY_HINT_RE = /^\s*(copy|copy\s+code|copy\s+to\s+clipboard|복사|복사하기|클립보드(에)?\s*복사|clipboard|verify(\s+you\s+are\s+human)?|i'?m\s+not\s+a\s+robot|확인|인증|보안\s*확인)\s*$/i;

  function closestActionable(node) {
    while (node && node !== document.documentElement) {
      if (node.nodeType === 1 && (node.tagName === "A" || node.tagName === "BUTTON"
          || (node.getAttribute && node.getAttribute("role") === "button"))) {
        return node;
      }
      node = node.parentNode;
    }
    return null;
  }

  function classifyClick(target) {
    const el = closestActionable(target);
    if (!el) return null;
    const href = el.getAttribute?.("href") || "";
    const onclick = el.getAttribute?.("onclick") || "";
    const txt = (el.innerText || el.textContent || "").trim();
    const aria = el.getAttribute?.("aria-label") || "";

    // 1) 위험 URI 스킴 — 최우선
    if (DANGEROUS_URI_RE.test(href)) {
      return { reason: "dangerous-uri-scheme", detail: href.slice(0, 200), severity: "hard" };
    }
    // 2) data: 스킴으로 시작하면서 실행파일 mime
    if (/^data:application\/(x-)?(msdownload|octet-stream|exe|bat|sh)/i.test(href)) {
      return { reason: "data-uri-executable", detail: href.slice(0, 200), severity: "hard" };
    }
    // 3) 다운로드 링크 — <a download> 또는 실행파일 확장자
    if (el.tagName === "A") {
      const abs = el.href || href;
      if (el.hasAttribute("download") || EXEC_EXT_RE.test(abs)) {
        return { reason: "download-link", detail: abs, severity: "scan" };
      }
    }
    // 4) onclick 안에서 clipboard.writeText/execCommand('copy') — 명시적 시그널
    if (/clipboard\.writeText|execCommand\(['"]copy/i.test(onclick)) {
      return { reason: "copy-onclick", detail: onclick.slice(0, 200), severity: "scan" };
    }
    // 5) 텍스트/aria가 "copy"/"verify"/"i'm not a robot"만으로 구성된 경우.
    // 부분 매칭 안 함 — Copyright/Verify your email/...등 제외.
    if (STRICT_COPY_HINT_RE.test(txt) || STRICT_COPY_HINT_RE.test(aria)) {
      return { reason: "social-button-text", detail: (txt || aria).slice(0, 120), severity: "scan" };
    }
    return null;
  }

  // 한 페이지에서 같은 사유 반복 차단 막기 (사용자가 "그래도 진행" 클릭 시)
  const allowedClicks = new WeakSet();
  // 최근 스캔 결과 캐시(같은 페이지면 재요청 안 함)
  let lastVerdictAt = 0;
  let lastVerdict = null;
  // 현재 in-flight 스캔(같은 페이지에서 동시 다중 클릭 막음)
  let inflight = null;

  async function quickScanCurrentPage() {
    if (lastVerdict && Date.now() - lastVerdictAt < 60_000) return lastVerdict;
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const v = await chrome.runtime.sendMessage({
          type: "scan",
          url: location.href,
          source: "click-guard",
          bypassCache: true
        });
        lastVerdict = v; lastVerdictAt = Date.now();
        return v;
      } catch { return null; }
      finally { /* clear after promise resolved below */ }
    })();
    try { return await inflight; }
    finally { inflight = null; }
  }

  function showInlineWarning(message) {
    const id = "__pg_click_warning";
    let div = document.getElementById(id);
    if (!div) {
      div = document.createElement("div");
      div.id = id;
      div.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;"
        + "background:#7f1d1d;color:#fff;padding:12px 18px;border-radius:8px;"
        + "box-shadow:0 4px 14px rgba(0,0,0,.35);font:600 14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;"
        + "max-width:520px;text-align:center;";
      document.documentElement.appendChild(div);
    }
    div.textContent = "⚠ " + message;
    setTimeout(() => { div?.remove(); }, 8000);
  }

  // install() 를 별도 함수로 두는 이유 사라짐 — 동기 install.
  (function install() {
    document.addEventListener("click", async (ev) => {
      if (allowedClicks.has(ev.target)) return;
      const cls = classifyClick(ev.target);
      if (!cls) return;

      // hard severity: 즉시 차단, 사용자 확인 받음
      if (cls.severity === "hard") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const ok = confirm(
          `위험 URI 스킴 차단됨:\n${cls.detail}\n\n` +
          "이 링크는 시스템 명령을 실행할 수 있습니다(예: AppleScript, Windows MSDT). " +
          "정말 진행하시겠습니까?"
        );
        if (ok) {
          allowedClicks.add(ev.target);
          ev.target.click?.();
        }
        return;
      }

      // scan severity: capture 단계에서 일단 막고, 빠른 스캔 후 결정
      ev.preventDefault();
      ev.stopImmediatePropagation();
      showInlineWarning(`이 페이지를 검사 중입니다… (${cls.reason})`);
      const v = await quickScanCurrentPage();
      if (v && (v.phishing || (v.phishing_score ?? 0) >= 7)) {
        showInlineWarning(`피싱 의심 페이지 — 클릭 차단됨. 사유: ${(v.reason || "").slice(0, 160)}`);
        return;
      }
      if (v && (v.phishing_score ?? 0) >= 4) {
        const ok = confirm(
          `이 페이지가 의심스럽습니다 (score ${v.phishing_score}/10).\n` +
          `사유: ${(v.reason || "").slice(0, 300)}\n\n계속 진행하시겠습니까?`
        );
        if (!ok) return;
      }
      allowedClicks.add(ev.target);
      ev.target.click?.();
    }, true /* capture */);
    console.log("[pg click_guard] installed on", location.href);
  })();
})();
