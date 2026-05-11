// owa_scan.js — owa.skplanet.com 본문 영역에서 외부 링크를 발견할 때마다 SW에 검사 요청.
// 결과는 verdict-banner 메시지로 회신받아 각 anchor 옆에 배지 형태로 주입.

(function () {
  if (window.__phisingGptOwaInstalled) return;
  window.__phisingGptOwaInstalled = true;

  const seen = new Set();         // href별 1회 송신
  const anchorMap = new Map();    // anchorId → HTMLAnchorElement
  let anchorSeq = 0;

  const PANEL_SELECTORS = [
    '[role="document"]',
    '[class*="ReadingPane"]',
    '[class*="ItemContent"]',
    '[data-app-section="ItemReadingPane"]',
    '[aria-label*="메시지 본문"]',
    '[aria-label*="message body"]'
  ].join(",");

  function isExternal(href) {
    if (!/^https?:/i.test(href)) return false;
    try {
      const h = new URL(href).hostname;
      return !/(^|\.)skplanet\.com$/.test(h)
          && !/(^|\.)sktelecom\.com$/.test(h)
          && !/(^|\.)sk\.com$/.test(h);
    } catch { return false; }
  }

  function scanRoot(root) {
    const panes = root.querySelectorAll ? root.querySelectorAll(PANEL_SELECTORS) : [];
    const containers = panes.length > 0 ? panes : [root];
    for (const pane of containers) {
      const anchors = pane.querySelectorAll('a[href]');
      for (const a of anchors) {
        const href = a.href;
        if (!isExternal(href)) continue;
        if (seen.has(href + "|" + a.dataset.pgScanId)) continue;
        const id = ++anchorSeq;
        a.dataset.pgScanId = String(id);
        anchorMap.set(id, a);
        const key = href + "|" + id;
        seen.add(key);
        chrome.runtime.sendMessage({ type: "scan", url: href, source: "owa", anchorId: id });
      }
    }
  }

  const observer = new MutationObserver(() => {
    scanRoot(document.body);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // 초기 1회
  scanRoot(document.body);

  // 30초 이상 panel 매칭이 0이면 셀렉터 디버그 로그
  // 단, 페이지가 실제 OWA reading pane 컨텍스트일 때만 경고 (불필요한 noise 방지)
  setTimeout(() => {
    const hasOwaContext = location.hostname === "owa.skplanet.com"
      || document.querySelector('[role="application"]')
      || document.querySelector('[class*="owa"]');
    if (hasOwaContext && document.body.querySelectorAll(PANEL_SELECTORS).length === 0) {
      console.warn("[phisinggpt] OWA reading-pane selector matched 0 nodes. UI may have changed.");
    }
  }, 30000);

  // 위험 anchor 카운터 (anchorId 별로 1회만 카운트)
  const dangerAnchors = new Set();

  function findPanelFor(anchor) {
    let n = anchor;
    while (n && n !== document.body) {
      if (n.matches && n.matches(PANEL_SELECTORS)) return n;
      n = n.parentElement;
    }
    return document.querySelector(PANEL_SELECTORS) || document.body;
  }

  function ensureSummaryBar(panel, count) {
    let bar = panel.querySelector(":scope > .pg-summary");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "pg-summary pg-danger";
      bar.setAttribute("role", "alert");
      bar.addEventListener("click", () => {
        const id = [...dangerAnchors][0];
        const a = id != null ? anchorMap.get(id) : null;
        if (a) a.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      panel.prepend(bar);
    }
    bar.textContent = `⚠ 이 메일에 피싱 의심 링크 ${count}개 — 클릭하여 위치로 이동`;
  }

  // verdict 회신 → 배너 + 요약 바
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "verdict-banner" || msg.anchorId == null) return;
    const a = anchorMap.get(msg.anchorId);
    if (!a) return;
    // 이미 배너 붙어있으면 갱신
    let badge = a.nextElementSibling;
    if (!badge || !badge.classList || !badge.classList.contains("pg-badge")) {
      badge = document.createElement("span");
      badge.className = "pg-badge";
      a.insertAdjacentElement("afterend", badge);
    }
    const cls = msg.severity === "danger" ? "pg-danger"
              : msg.severity === "warn"   ? "pg-warn"
              : "pg-ok";
    const label = msg.severity === "danger" ? "피싱 의심"
                : msg.severity === "warn"   ? "주의"
                : "안전";
    badge.classList.remove("pg-ok", "pg-warn", "pg-danger");
    badge.classList.add(cls);
    const score = msg.verdict?.phishing_score;
    badge.textContent = ` [${label}${score != null ? " " + score : ""}]`;
    badge.title = msg.verdict?.reason || "";

    // 위험 anchor 누적 → 호스트 panel 상단에 요약 바
    if (msg.severity === "danger" && !dangerAnchors.has(msg.anchorId)) {
      dangerAnchors.add(msg.anchorId);
      const panel = findPanelFor(a);
      ensureSummaryBar(panel, dangerAnchors.size);
    }
  });
})();
