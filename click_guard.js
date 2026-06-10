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
  // 클립보드 카피 의심 버튼: 단어 "copy/verify human/I'm not a robot/보안 확인" 류가 텍스트의 *전부* 인 경우만.
  // 단어 경계 + 전체-텍스트 매치 — 'Copyright', 'Verify my email', 'copy-icon-container' 등 false match 제거.
  // 단독 "확인"(OK)·"인증"(본인인증) 은 정상 한국 UI 의 가장 흔한 버튼 라벨이라 제외 — 정상 가입/모달
  // 페이지(예: howcare.co.kr 의 모달 "확인")까지 click_guard 가 발동하던 FP. ClickFix 의도는
  // "보안 확인"/"verify you are human" 같은 구절에 있고, 실제 클립보드 셸 payload 는 O2 가 잡는다.
  const STRICT_COPY_HINT_RE = /^\s*(copy|copy\s+code|copy\s+to\s+clipboard|복사|복사하기|클립보드(에)?\s*복사|clipboard|verify\s+you\s+are\s+human|i'?m\s+not\s+a\s+robot|보안\s*확인)\s*$/i;

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
  // 최근 스캔 결과 캐시 — URL이 바뀌지 않는 한 영구. SPA 라우팅 등 URL 변경 시 무효화.
  let lastVerdict = null;
  let lastVerdictUrl = null;
  // warn(4~6) 승인은 host 단위로 기억 — 멀티스텝 플로우(가입/동의 등)가 URL 을 바꿔도
  // 세션 동안 같은 사이트는 다시 묻지 않는다. (SW 도 host 단위로 저장/조회)
  let warnApprovedHost = null;
  function currentHost() {
    try { return new URL(location.href).hostname.toLowerCase(); } catch { return ""; }
  }
  // 현재 in-flight 스캔(같은 페이지에서 동시 다중 클릭 막음)
  let inflight = null;

  async function quickScanCurrentPage() {
    if (lastVerdict && lastVerdictUrl === location.href) return lastVerdict;
    if (inflight) return inflight;
    const scanUrl = location.href;
    inflight = (async () => {
      try {
        // bypassCache 안 보냄 → SW의 chrome.storage.session 캐시 활용 (세션 동안 동일 URL 재호출 0회).
        const v = await chrome.runtime.sendMessage({
          type: "scan",
          url: scanUrl,
          source: "click-guard"
        });
        if (location.href === scanUrl) {
          lastVerdict = v; lastVerdictUrl = scanUrl;
        }
        return v;
      } catch { return null; }
    })();
    try { return await inflight; }
    finally { inflight = null; }
  }

  // 한 페이지에 동시에 하나의 스캔만 진행하도록 막는 가드 — 검사 중 같은/다른 링크를 여러 번
  // 눌러도 중복 스캔·중복 다운로드(재디스패치 N회)가 안 일어나게 한다.
  let scanClickPending = false;
  let __pgBannerInterval = null;   // 경과 초 실시간 갱신
  let __pgBannerHideTimer = null;  // 결과 배너 자동 숨김

  function __pgBannerEl() {
    const id = "__pg_click_warning";
    let div = document.getElementById(id);
    if (!div) {
      div = document.createElement("div");
      div.id = id;
      div.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;"
        + "color:#fff;padding:12px 18px;border-radius:8px;"
        + "box-shadow:0 4px 14px rgba(0,0,0,.35);font:600 14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;"
        + "max-width:560px;text-align:center;";
      document.documentElement.appendChild(div);
    }
    return div;
  }
  function __pgClearTimers() {
    if (__pgBannerInterval) { clearInterval(__pgBannerInterval); __pgBannerInterval = null; }
    if (__pgBannerHideTimer) { clearTimeout(__pgBannerHideTimer); __pgBannerHideTimer = null; }
  }

  // 진행 배너: 경과 초를 실시간 표시하고 스캔이 끝날 때까지 사라지지 않는다(과거 8초 자동숨김이
  // 실제 스캔 시간(15~60s)보다 짧아 배너가 먼저 사라지던 문제 해결). 이미 떠 있으면 카운터 유지.
  function showScanningBanner() {
    if (__pgBannerInterval) return; // 이미 진행 중 — 카운터 리셋하지 않음
    __pgClearTimers();
    const div = __pgBannerEl();
    div.style.background = "#1f2937";
    const start = Date.now();
    const render = () => {
      const s = Math.round((Date.now() - start) / 1000);
      div.textContent = `⏳ 이 링크를 검사 중입니다… ${s}초 · 안전 확인되면 자동으로 진행돼요 (최대 1분). 다시 누르지 않아도 됩니다.`;
    };
    render();
    __pgBannerInterval = setInterval(render, 500);
  }

  // 결과 배너: 지정 시간 후 자동 숨김.
  function showResultBanner(message, bg, ms) {
    __pgClearTimers();
    const div = __pgBannerEl();
    div.style.background = bg || "#7f1d1d";
    div.textContent = message;
    __pgBannerHideTimer = setTimeout(() => { div?.remove(); }, ms || 8000);
  }

  function hideBanner() {
    __pgClearTimers();
    document.getElementById("__pg_click_warning")?.remove();
  }

  async function isWarnApprovedForCurrentHost() {
    const host = currentHost();
    if (host && warnApprovedHost === host) return true;
    try {
      // SW 가 url 에서 host 를 파생해 host 단위로 조회한다.
      const res = await chrome.runtime.sendMessage({
        type: "clickGuardWarnApprovalStatus",
        url: location.href
      });
      if (res?.approved) {
        warnApprovedHost = host;
        return true;
      }
    } catch {}
    return false;
  }

  async function rememberWarnApprovalForCurrentHost(verdict) {
    warnApprovedHost = currentHost();
    try {
      await chrome.runtime.sendMessage({
        type: "rememberClickGuardWarnApproval",
        url: location.href,
        score: verdict?.phishing_score
      });
    } catch {}
  }

  // ── prefetch: 페이지에 실제로 검사 트리거가 될 만한 요소(Copy 버튼/다운로드 링크/위험 URI)가
  // 있을 때만 백그라운드 사전 스캔을 1회 시작. 사용자가 실제 클릭할 때 첫 스캔 대기(수십초)를 제거.
  // 무관한 페이지에선 LLM 호출 0회를 유지한다.
  function pagePotentiallyNeedsScan() {
    let n = 0;
    for (const el of document.querySelectorAll('a[href], button, [role="button"], a[onclick]')) {
      if (++n > 300) break;
      const txt = ((el.innerText || el.textContent || "") + " " + (el.getAttribute?.("aria-label") || "")).trim();
      if (STRICT_COPY_HINT_RE.test(txt)) return true;
      const onclick = el.getAttribute?.("onclick") || "";
      if (/clipboard\.writeText|execCommand\(['"]copy/i.test(onclick)) return true;
      if (el.tagName === "A") {
        const href = el.href || el.getAttribute?.("href") || "";
        if (DANGEROUS_URI_RE.test(href) || EXEC_EXT_RE.test(href) || el.hasAttribute("download")) return true;
      }
    }
    return false;
  }

  function schedulePrefetch() {
    if (lastVerdict && lastVerdictUrl === location.href) return;
    if (inflight) return;
    if (!pagePotentiallyNeedsScan()) return;
    quickScanCurrentPage().catch(() => {});
  }

  function scheduleWhenIdle() {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => schedulePrefetch(), { timeout: 2500 });
    } else {
      setTimeout(schedulePrefetch, 800);
    }
  }

  // SPA 라우팅(pushState/replaceState/popstate/hashchange)으로 URL 변경 시
  // 캐시 무효화 + 재프리페치. ISOLATED world라서 history 함수 오버라이드는 페이지 코드에 안 박혀,
  // popstate/hashchange + 폴링 보조로 처리.
  let __pgLastHref = location.href;
  function onPossibleNavigation() {
    if (location.href === __pgLastHref) return;
    __pgLastHref = location.href;
    lastVerdict = null;
    lastVerdictUrl = null;
    scheduleWhenIdle();
  }
  window.addEventListener("popstate", onPossibleNavigation);
  window.addEventListener("hashchange", onPossibleNavigation);
  // pushState/replaceState 는 isolated world에서 직접 hook 못 함 — 2.5s 폴링으로 보완.
  setInterval(onPossibleNavigation, 2500);

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

      // 이미 검사 중이면 — 중복 스캔/중복 다운로드를 막고 진행 배너만 유지한다.
      // (예전엔 검사 중 반복 클릭마다 핸들러가 재진입해, 완료 후 다운로드가 여러 번 트리거되거나
      //  사용자가 "멈춘 줄 알고" 계속 누르던 문제.)
      if (scanClickPending) {
        showScanningBanner();
        return;
      }
      scanClickPending = true;
      const target = ev.target;
      // 800ms 안에 끝나면(캐시 hit) 배너 안 뜸. 콜드 패스에서만 진행 배너 노출.
      let bannerTimer = setTimeout(() => { showScanningBanner(); bannerTimer = null; }, 800);
      try {
        const v = await quickScanCurrentPage();
        if (bannerTimer) { clearTimeout(bannerTimer); bannerTimer = null; }
        if (v && (v.phishing || (v.phishing_score ?? 0) >= 7)) {
          showResultBanner(`⛔ 피싱 의심 — 클릭 차단됨. 사유: ${(v.reason || "").slice(0, 160)}`, "#7f1d1d", 9000);
          return;
        }
        if (v && (v.phishing_score ?? 0) >= 4) {
          hideBanner(); // confirm 띄우기 전 진행 배너 제거(겹침 방지)
          if (!await isWarnApprovedForCurrentHost()) {
            const ok = confirm(
              `이 페이지가 의심스럽습니다 (score ${v.phishing_score}/10).\n` +
              `사유: ${(v.reason || "").slice(0, 300)}\n\n` +
              "확인을 누르면 이번 브라우저 세션 동안 이 사이트의 클릭 경고는 다시 묻지 않습니다.\n" +
              "계속 진행하시겠습니까?"
            );
            if (!ok) return;
            await rememberWarnApprovalForCurrentHost(v);
          }
        }
        // safe(또는 warn 승인) → 완료 피드백 후 원래 클릭을 1회만 재실행.
        showResultBanner("✓ 안전 확인 — 계속 진행합니다.", "#065f46", 2500);
        allowedClicks.add(target);
        target.click?.();
      } finally {
        scanClickPending = false;
      }
    }, true /* capture */);
    console.log("[pg click_guard] installed on", location.href);
    // 첫 프리페치: 페이지 로드가 안정된 뒤(idle) 실행.
    scheduleWhenIdle();
  })();
})();
