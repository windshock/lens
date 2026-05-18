// i18n.js — UI 문자열 영문/한글 토글. 기본 영문, chrome.storage.local.lang 에 "ko" 저장 시 한글.
// HTML 페이지(popup/warning/verdict) 에서는 <script src="i18n.js"> 로 로드, 그 다음 await initI18n().
// background.js (ESM SW) 에서는 import "./i18n.js" 후 await initI18n().
// SW 콘텍스트에서도 globalThis.* 접근 가능.

(function () {
  const STRINGS = {
    en: {
      // popup
      "popup.title":            "Phishing Scanner",
      "popup.heading":          "Phishing Link Scanner",
      "popup.checking":         "Checking status…",
      "popup.statusOk":         "On-device model ready",
      "popup.statusDlPrep":     "Preparing model download",
      "popup.statusDl":         "Downloading / preparing model",
      "popup.statusUnavailable":"On-device model unavailable — extension inactive",
      "popup.statusError":      "Model setup failed — {0}",
      "popup.btnScan":          "Scan current page",
      "popup.btnRetry":         "Retry model setup",
      "popup.btnPreparing":     "Preparing model…",
      "popup.btnResetThis":     "Reset history for this page",
      "popup.btnResetAll":      "Reset all scan history",
      "popup.btnResetThisTip":  "Clears the denylist entry and verdict / RDAP / CT cache for the current tab's host only. Allowlist and other sites are preserved.",
      "popup.btnResetAllTip":   "Clears every scan record (denylist, allowlist, session caches).",
      "popup.langLabel":        "Lang",
      "popup.notScannable":     "Not a scannable page (current tab: {0})",
      "popup.confirmResetThis": "Reset scan history for {0}?\n- Remove this host from denylist\n- Drop verdict / RDAP / CT cache for this URL/host\n- Allowlist and other sites are preserved",
      "popup.confirmResetAll":  "Reset all scan history?\n- Persistent denylist (confirmed phishing hosts)\n- Persistent allowlist (user-approved hosts)\n- Session verdict / RDAP / CT caches",
      "popup.resetDone":        "Reset done — host {0}, removed {1} denylist + {2} session-cache entries.",
      "popup.resetDoneAll":     "Reset done — removed {0} denylist + {1} allowlist entries + cleared session cache.",
      "popup.resetFailed":      "Reset failed: {0}",
      "popup.resetting":        "Resetting…",
      "popup.error":            "Error: {0}",
      "popup.stage0":           "Loading page…",
      "popup.stage1":           "Extracting DOM/images…",
      "popup.stage2":           "OCR + WHOIS lookup…",
      "popup.stage3":           "Model inference…",
      "popup.stageElapsed":     "{0} ({1}s)",
      "popup.verdictDanger":    "Phishing suspected",
      "popup.verdictWarn":      "Caution",
      "popup.verdictOk":        "Safe",
      "popup.detail":           "Show details",

      // warning page
      "warning.title":          "Suspected phishing page",
      "warning.heading":        "This page is suspected of phishing",
      "warning.subtitle":       "Account theft and financial harm are possible. Avoid this page if possible.",
      "warning.label.url":      "URL",
      "warning.label.score":    "Risk",
      "warning.label.brand":    "Brand",
      "warning.label.reason":   "Reason",
      "warning.btnBack":        "Go back safely",
      "warning.btnRescan":      "Clear this page's history & re-scan",
      "warning.btnProceed":     "Allow this site and continue",
      "warning.tipRescan":      "Clears the denylist + cache only for this host and re-scans. If it really is phishing it will be blocked again.",
      "warning.footnote":       "This warning is an estimate from Chrome's built-in Gemini Nano on-device analysis.\nFalse positives are possible — ask your IT security team if unsure.",
      "warning.urlMissing":     "(no URL)",
      "warning.brandUnknown":   "(unknown)",
      "warning.reasonMissing":  "(no reason info)",
      "warning.loadFailed":     "Could not load scan-result info.",
      "warning.tabTitleHead":   "Phishing suspected: {0}",
      "warning.confirmProceed": "Have you verified this page is safe?\nAllowing it stops checks on every page of {0} until the extension is reinstalled.",
      "warning.confirmProceedHost": "site {0}",
      "warning.confirmProceedFallback": "this site",
      "warning.confirmRescan":  "Clear denylist + cache only for {0} and re-scan.\nIf the site really is phishing it will be blocked again.\n(Allowlist and other-site records are unaffected)\nProceed?",
      "warning.alertFailed":    "Reset failed: {0}",
      "warning.alertError":     "Reset error: {0}",

      // verdict page
      "verdict.heading":        "Latest scan result",
      "verdict.label.brand":    "Brand",
      "verdict.label.suspicious":"Suspicious domain",
      "verdict.label.phishing": "Phishing",
      "verdict.yes":            "Yes",
      "verdict.no":             "No",
      "verdict.btnAllow":       "Allow this site",
      "verdict.btnClose":       "Close",
      "verdict.scannedAt":      "Scanned at:",
      "verdict.empty":          "No recent scan record.",
      "verdict.brandUnknown":   "(unknown)",
      "verdict.confirmAllow":   "{0} will no longer be checked on any page until the extension is reinstalled. Proceed?",
      "verdict.confirmAllowHost":"Site {0}",
      "verdict.confirmAllowFallback":"This site",
      "verdict.allowDone":      "{0} added to allowlist.",
      "verdict.allowDoneFallback":"Added to allowlist.",
      "verdict.sevDanger":      "Phishing suspected",
      "verdict.sevWarn":        "Caution",
      "verdict.sevOk":          "Safe",

      // notifications
      "notif.headDanger":       "Phishing suspected",
      "notif.headWarn":         "Caution",
      "notif.headOk":           "Safe",
      "notif.prefixDanger":     "[Phishing]",
      "notif.prefixWarn":       "[Caution]",
      "notif.prefixOk":         "[Safe]",
      "notif.tailCached":       " (cached)",
      "notif.tailSkipped":      " (internal domain)",
      "notif.tailAllowed":      " (user allowed)",
      "notif.downloadCancelTitle": "Download cancelled",
      "notif.downloadCancelBody": "Blocked a file started from a suspected phishing page ({0}).",

      // service-worker verdict / override reasons
      "bg.scan.allowlistShortCircuit": "User has allowed this host ({0}).",
      "bg.scan.sessionTrusted":       "Session-trusted domain — already judged safe in this session ({0}).",
      "bg.scan.denylistShortCircuit": "Previously confirmed phishing host (persistent record) — re-scan with LLM skipped.",
      "bg.scan.internalSkip":         "Trusted internal domain — no risky behaviour, model call skipped.",

      "bg.override.prefix":           "[Auto override: {0}] {1}. ",

      "bg.override.O0.baitRedirect":  "Evasive redirect: origin ({0}) is on free hosting but the page redirected to a legitimate domain ({1}) — likely sandbox evasion.",
      "bg.override.O1whois.match":    "WHOIS / RDAP / CT match the brand '{0}' — domain appears to be legitimately owned.",
      "bg.override.O1.freeHostStrong":"Brand impersonation on free hosting: '{0}' official domain is {1} but the page is on {2}.",
      "bg.override.O1.docPagesMention":"Doc-style GitHub Pages: mentions '{0}' but no clipboard payload / dangerous URI / auto-download / login form.",
      "bg.override.O1.freeHostWarn": "Brand mention + free hosting: '{0}' official domain is {1} but the page is on {2} (do not flag as phishing on this signal alone).",
      "bg.override.O1.brandMismatchWithEvidence": "Brand impersonation + credential / danger signal: '{0}' official domain is {1} but the page is on {2}.",
      "bg.override.O1.brandMismatchOnly": "Brand-domain mismatch: '{0}' is not on its official domain ({1}); page is on {2}.",
      "bg.override.O1.brandSafe":     "Official brand domain: '{0}' is hosted on its official domain ({1}).",
      "bg.override.O2.clipboardShell":"Shell payload written to clipboard: {0}",
      "bg.override.O3.autoDownload":  "Auto-download attempt ({0} file(s)): {1}",
      "bg.override.O4.dangerousUri":  "Dangerous URI scheme links: {0}",
      "bg.override.O7.kitMarker":     "Phishing-kit signature ({0}) + credential form.",
      "bg.override.D1.denylistHit":   "Persistent denylist match — previously confirmed phishing host: {0}.",
      "bg.override.O5.personalTrust": "User-trusted domain (bookmarks / history / top sites): {0}",
      "bg.override.O6.popularKr":     "Popular ranked domain: {0}"
    },
    ko: {
      // popup
      "popup.title":            "피싱 검사기",
      "popup.heading":          "피싱 링크 검사기",
      "popup.checking":         "상태 확인 중…",
      "popup.statusOk":         "온디바이스 모델 사용 가능",
      "popup.statusDlPrep":     "모델 다운로드 준비 중",
      "popup.statusDl":         "모델 다운로드/준비 중",
      "popup.statusUnavailable":"온디바이스 모델 사용 불가 — 확장 비활성",
      "popup.statusError":      "모델 준비 실패 — {0}",
      "popup.btnScan":          "현재 페이지 검사",
      "popup.btnRetry":         "모델 준비 재시도",
      "popup.btnPreparing":     "모델 준비 중…",
      "popup.btnResetThis":     "이 페이지 기록만 초기화",
      "popup.btnResetAll":      "전체 검사 기록 초기화",
      "popup.btnResetThisTip":  "현재 탭 호스트의 denylist + verdict 캐시만 비웁니다. allowlist 와 다른 사이트 기록은 보존.",
      "popup.btnResetAllTip":   "이 확장의 모든 검사 기록(denylist, allowlist, 세션 캐시)을 초기화합니다.",
      "popup.langLabel":        "언어",
      "popup.notScannable":     "검사 가능한 페이지가 아닙니다 (현재 탭: {0})",
      "popup.confirmResetThis": "{0} 의 검사 기록만 초기화합니다.\n- denylist 에서 이 host 제거\n- 이 URL/host 의 verdict / RDAP / CT 캐시 제거\n- allowlist 와 다른 사이트 기록은 보존\n진행할까요?",
      "popup.confirmResetAll":  "이 확장의 모든 검사 기록을 초기화합니다.\n- 영구 denylist (피싱 확정 호스트)\n- 영구 allowlist (사용자 허용 호스트)\n- 세션 verdict / RDAP / CT 캐시\n진행할까요?",
      "popup.resetDone":        "초기화 완료 — host {0}, denylist {1}개 + 세션 캐시 {2}개 삭제.",
      "popup.resetDoneAll":     "초기화 완료 — denylist {0}개, allowlist {1}개 삭제 + 세션 캐시 비움.",
      "popup.resetFailed":      "초기화 실패: {0}",
      "popup.resetting":        "초기화 중…",
      "popup.error":            "오류: {0}",
      "popup.stage0":           "페이지 로드 중…",
      "popup.stage1":           "DOM/이미지 추출 중…",
      "popup.stage2":           "OCR + WHOIS 조회 중…",
      "popup.stage3":           "모델 추론 중…",
      "popup.stageElapsed":     "{0} ({1}s)",
      "popup.verdictDanger":    "피싱 의심",
      "popup.verdictWarn":      "주의",
      "popup.verdictOk":        "안전",
      "popup.detail":           "자세히 보기",

      // warning page
      "warning.title":          "피싱 의심 페이지",
      "warning.heading":        "이 페이지는 피싱으로 의심됩니다",
      "warning.subtitle":       "계정 탈취·금전 피해 위험이 있습니다. 가능한 한 접근하지 마세요.",
      "warning.label.url":      "URL",
      "warning.label.score":    "위험도",
      "warning.label.brand":    "브랜드",
      "warning.label.reason":   "사유",
      "warning.btnBack":        "안전하게 돌아가기",
      "warning.btnRescan":      "이 페이지 기록 지우고 재검사",
      "warning.btnProceed":     "이 사이트 허용 후 계속",
      "warning.tipRescan":      "이 호스트의 denylist/캐시만 비우고 다시 검사합니다. 정말 피싱이면 다시 차단됩니다.",
      "warning.footnote":       "이 경고는 Chrome 내장 Gemini Nano 온디바이스 분석에 따른 추정치입니다.\n오탐일 수 있으며, 의심스럽다면 IT 보안 담당자에게 문의하세요.",
      "warning.urlMissing":     "(URL 없음)",
      "warning.brandUnknown":   "(미확인)",
      "warning.reasonMissing":  "(사유 정보 없음)",
      "warning.loadFailed":     "검사 결과 정보를 불러올 수 없습니다.",
      "warning.tabTitleHead":   "피싱 의심: {0}",
      "warning.confirmProceed": "이 페이지가 안전하다고 직접 확인했습니까?\n허용 시 {0} 의 모든 페이지는 앞으로 검사하지 않습니다. 이 설정은 확장을 재설치하기 전까지 유지됩니다.",
      "warning.confirmProceedHost": "사이트 {0}",
      "warning.confirmProceedFallback": "이 사이트",
      "warning.confirmRescan":  "{0} 의 denylist 와 캐시만 비우고 페이지를 다시 검사합니다.\n이 사이트가 정말 피싱이면 다시 차단되어 이 화면이 다시 뜹니다.\n(allowlist 와 다른 사이트의 기록은 영향 없음)\n진행할까요?",
      "warning.alertFailed":    "초기화 실패: {0}",
      "warning.alertError":     "초기화 오류: {0}",

      // verdict page
      "verdict.heading":        "최근 검사 결과",
      "verdict.label.brand":    "브랜드",
      "verdict.label.suspicious":"의심 도메인",
      "verdict.label.phishing": "피싱 판정",
      "verdict.yes":            "예",
      "verdict.no":             "아니오",
      "verdict.btnAllow":       "이 사이트 허용",
      "verdict.btnClose":       "닫기",
      "verdict.scannedAt":      "검사 시각:",
      "verdict.empty":          "최근 검사 기록이 없습니다.",
      "verdict.brandUnknown":   "(미확인)",
      "verdict.confirmAllow":   "{0} 의 모든 페이지를 앞으로 검사하지 않습니다. 이 설정은 확장을 재설치하기 전까지 유지됩니다. 진행할까요?",
      "verdict.confirmAllowHost":"사이트 {0}",
      "verdict.confirmAllowFallback":"이 사이트",
      "verdict.allowDone":      "{0} 허용 등록되었습니다.",
      "verdict.allowDoneFallback":"허용 등록되었습니다.",
      "verdict.sevDanger":      "피싱 의심",
      "verdict.sevWarn":        "주의",
      "verdict.sevOk":          "안전",

      // notifications
      "notif.headDanger":       "피싱 의심",
      "notif.headWarn":         "주의",
      "notif.headOk":           "안전",
      "notif.prefixDanger":     "[피싱]",
      "notif.prefixWarn":       "[주의]",
      "notif.prefixOk":         "[안전]",
      "notif.tailCached":       " (캐시)",
      "notif.tailSkipped":      " (사내 도메인)",
      "notif.tailAllowed":      " (사용자 허용)",
      "notif.downloadCancelTitle": "다운로드 취소",
      "notif.downloadCancelBody": "피싱 의심 페이지({0})에서 시작된 파일을 차단했습니다.",

      // service-worker verdict / override reasons
      "bg.scan.allowlistShortCircuit": "사용자가 이 호스트({0})를 허용함",
      "bg.scan.sessionTrusted":       "세션 신뢰 도메인 — 이 세션의 이전 검사에서 안전 판정 ({0})",
      "bg.scan.denylistShortCircuit": "이전 검사에서 피싱으로 판정된 호스트 (영구 기록) — LLM 재검사 생략",
      "bg.scan.internalSkip":         "사내 신뢰 도메인 — 위험 행위 없음, 모델 호출 생략",

      "bg.override.prefix":           "[자동 오버라이드: {0}] {1}. ",

      "bg.override.O0.baitRedirect":  "회피형 redirect: 원본({0})이 무료 호스팅인데 정식 도메인({1})로 우회 redirect — 분석 회피 의심",
      "bg.override.O1whois.match":    "WHOIS/RDAP/CT 가 브랜드 '{0}' 와 일치 — 정식 도메인 추정",
      "bg.override.O1.freeHostStrong":"브랜드 사칭 + 무료 호스팅: '{0}' 정식 도메인은 {1} 인데 페이지는 {2}",
      "bg.override.O1.docPagesMention":"문서형 GitHub Pages: '{0}' 브랜드를 언급하지만 클립보드 페이로드/위험 URI/자동 다운로드/로그인 폼 없음",
      "bg.override.O1.freeHostWarn": "브랜드 언급 + 무료 호스팅: '{0}' 정식 도메인은 {1} 이지만 페이지는 {2} (단독 증거로 피싱 확정 금지)",
      "bg.override.O1.brandMismatchWithEvidence": "브랜드 사칭 + credential/위험 신호: '{0}' 정식 도메인은 {1} 인데 페이지는 {2}",
      "bg.override.O1.brandMismatchOnly": "브랜드 도메인 불일치: '{0}' 정식 도메인({1})이 아닌 {2}",
      "bg.override.O1.brandSafe":     "정식 브랜드 도메인: '{0}' 공식 도메인({1})에서 호스팅됨",
      "bg.override.O2.clipboardShell":"클립보드에 쉘 페이로드 복사: {0}",
      "bg.override.O3.autoDownload":  "자동 다운로드 시도({0}개): {1}",
      "bg.override.O4.dangerousUri":  "위험 URI 스킴 링크: {0}",
      "bg.override.O7.kitMarker":     "Phishing kit 시그너처 ({0}) + credential 폼",
      "bg.override.D1.denylistHit":   "영구 denylist 일치 — 이전 검사에서 피싱으로 판정된 호스트: {0}",
      "bg.override.O5.personalTrust": "사용자 신뢰 도메인 (즐겨찾기/방문기록/TopSites): {0}",
      "bg.override.O6.popularKr":     "공개 랭킹 인기 도메인: {0}"
    }
  };

  let _lang = "en";

  // SW 콘텍스트는 storage.onChanged 로 즉시 반영. HTML 페이지는 popup 새로 열릴 때 init 호출.
  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.lang) {
        const nv = changes.lang.newValue;
        _lang = nv === "ko" ? "ko" : "en";
      }
    });
  }

  globalThis.initI18n = async function () {
    try {
      const { lang } = await chrome.storage.local.get("lang");
      _lang = lang === "ko" ? "ko" : "en";
    } catch { /* default en */ }
  };

  globalThis.t = function (key, ...args) {
    const dict = STRINGS[_lang] || STRINGS.en;
    let s = (dict[key] != null) ? dict[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
    for (let i = 0; i < args.length; i++) {
      s = s.split("{" + i + "}").join(String(args[i]));
    }
    return s;
  };

  globalThis.setLang = async function (lang) {
    _lang = lang === "ko" ? "ko" : "en";
    await chrome.storage.local.set({ lang: _lang });
  };

  globalThis.getLang = function () { return _lang; };

  // HTML 페이지에서 <span data-i18n="key"> 형태로 마크업한 노드들을 일괄 채움.
  globalThis.applyI18nDom = function (root = document) {
    if (!root.querySelectorAll) return;
    for (const el of root.querySelectorAll("[data-i18n]")) {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = globalThis.t(key);
    }
    for (const el of root.querySelectorAll("[data-i18n-title]")) {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", globalThis.t(key));
    }
    if (root.documentElement) {
      const tk = root.documentElement.getAttribute("data-i18n-doctitle");
      if (tk) root.title = globalThis.t(tk);
    }
  };

  // SW 콘텍스트(또는 popup) 가 import 후 즉시 _lang 을 storage 에 맞추도록 한 번 호출.
  // HTML 의 await initI18n() 보다 빠른 fire-and-forget 백업.
  try {
    if (chrome?.storage?.local) {
      chrome.storage.local.get("lang").then(({ lang }) => {
        _lang = lang === "ko" ? "ko" : "en";
      }).catch(() => {});
    }
  } catch {}
})();
