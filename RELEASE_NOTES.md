# ScamGuard AI v0.1.12 Release Notes

## 🔒 Security Hardening

- **O5 shared-hosting slice 우회 차단**: v0.1.11 에서 도입한 개인 신뢰 도메인(O5) 룰이 `finalHost.slice(-2)` 폴백으로 `workers.dev`/`pages.dev`/`vercel.app` 등 shared-hosting 의 모든 서브도메인을 통째로 신뢰해버리는 우회 경로가 있었습니다. `FREE_HOSTING_RE` 가드를 추가해 슬라이스 폴백을 차단하고, 정확한 풀 호스트가 북마크/topSites 에 있을 때만 O5 가 발화하도록 수정했습니다. O6(POPULAR_KR_DOMAINS) 에도 같은 가드 미러링.
- **영구 denylist 도입**: phishing 으로 확정된(`score≥7`) 호스트를 `chrome.storage.local` 에 sha256 해시 형태로 영구 기록합니다. `applyOverrides` 가 O5/O6 적용 전에 denylist 를 조회해 hit 이면 D1 danger 룰로 두 오버라이드를 자동 skip 하고, `scanUrl` 캐시 단계에서도 hit 이면 LLM/추출/OCR 전부 생략하고 즉시 phishing 으로 short-circuit 합니다. 확장 자동 업데이트·SW 재시작·브라우저 재시작에 살아남으며, 완전 Remove → Load unpacked 만 소실됩니다.
- **OWA cached-intercept 버그 수정**: OWA 메일 본문에서 anchor 를 클릭해 새 탭에서 피싱 페이지가 열려도 빨간 warning.html 가로채기 화면이 안 뜨던 버그를 수정했습니다. `dispatchResult` 의 `!meta.cached` 가드가 OWA pre-scan 의 캐시 hit 까지 intercept 대상에서 제외하던 게 원인. navigation/action/popup source 는 fresh user intent 로 간주해 캐시 hit 이어도 intercept 가 발화하도록 변경.

---

# ScamGuard AI v0.1.11 Release Notes

## 🚀 What's New in v0.1.11
- **Korean Portal Whitelist (O6)**: Cloudflare Radar 기반 한국 상위 ~120개 도메인 정적 셋(`POPULAR_KR_DOMAINS`)을 추가해, LLM 의 브랜드 인식 없이도 도메인 직접 매칭으로 FP 를 차단합니다.
- **Personal Trust Domains (O5)**: 사용자의 북마크 + 방문 히스토리(90일 내 10회 이상) + topSites 를 합쳐 "개인 신뢰 도메인" 셋을 만들고, 위험 신호가 없을 때 자동으로 양성 처리합니다. `bookmarks`/`history`/`topSites` 권한 추가.
- **확장 OFFICIAL_DOMAINS**: 네이버/카카오/네이트/쿠팡/은행 등 ~60개 한국 브랜드를 정식 도메인 매핑에 추가.

---

# ScamGuard AI v0.1.10 Release Notes

## 🚀 What's New in v0.1.10
- **Automatic Gemini Nano Preparation**: Opening the popup now triggers `LanguageModel.create()` when the model is `downloadable` or `downloading`, so the on-device model download actually starts instead of waiting for a forced scan.
- **Fullscreen Warning Fix from Popup Scans**: Popup-triggered scans now pass the active tab ID to the service worker, so dangerous pages are redirected to the red warning screen instead of falling back to a desktop notification.

---

# ScamGuard AI v0.1.9 Release Notes

## 🚀 What's New in v0.1.9
- **Sensitive Action Link Safeguard**: Implemented a critical safety feature to prevent the automatic background scanner from blindly fetching 1-time action links. Links containing keywords like "unsubscribe", "opt-out", "verify", "approve", or "password reset" are now explicitly skipped during automated OWA scanning to prevent accidentally triggering these actions on behalf of the user. These links will display a `[스캔 보류 (민감 링크)]` badge and can still be manually scanned via right-click if deemed suspicious.

---

# ScamGuard AI v0.1.8 Release Notes

## 🚀 What's New in v0.1.8
- **Strict Silent Mode**: Fixed an edge case where OWA background scans or navigation scans would incorrectly fall back to opening a visible popup tab if the network request or code injection failed. Now, all automated background scans are strictly enforced to remain completely silent under all circumstances.

---

# ScamGuard AI v0.1.7 Release Notes

## 🚀 What's New in v0.1.7
- **OWA SPA Bug Fix**: Fixed an issue in OWA where the "Click to navigate" summary bar would incorrectly accumulate counts from previously viewed emails and fail to scroll. It now correctly identifies dangerous links only within the currently visible email panel.

---

# ScamGuard AI v0.1.6 Release Notes

## 🚀 What's New in v0.1.6 (Stealth Mode Update)
- **Invisible Background Scanning**: Eliminates the annoying flickering of hidden tabs! Navigation and manual scans now seamlessly inject analysis scripts into active tabs, while background automated scans (e.g., OWA emails) operate completely silently via static HTML fetching.
- **Improved Active Tab Safety**: Fixed an issue where the extension inadvertently cleared scripts and styles from the user's active page during scanning. The extension now safely analyzes live pages without modifying or breaking the user's view.

---

# ScamGuard AI v0.1.5 Release Notes

## 🚀 Welcome to ScamGuard AI!
ScamGuard AI (formerly PhishingGPT) is a 100% On-Device, Zero-Data phishing and scam detection Chrome Extension powered by Chrome's built-in Gemini Nano.

### ✨ Key Features
- **Zero-Data Privacy**: All URL and link scanning happens locally on your device. Your browsing data is NEVER sent to an external server.
- **Gemini Nano Integration**: Utilizes Google's on-device Prompt API for fast, reliable, and private phishing detection.
- **Real-Time Link Scanning**: Proactively checks clicked links and warns you before you navigate to a malicious site.
- **Smart Download Blocking**: Intercepts downloads hosted on known phishing domains.
- **On-the-fly OCR & DOM Analysis**: Uses local Tesseract OCR and advanced DOM parsing to inspect visual and structural threats in real-time.
- **OWA Enterprise Support**: Automatically scans and places warning badges on suspicious external links within enterprise webmails (e.g., owa.skplanet.com).

### 🛠 Installation (Developer Mode)
1. Download `scamguard-ai-v0.1.5.zip` and extract it.
2. Ensure you have **Chrome v138+** and the Gemini Nano On-Device Model downloaded (`chrome://on-device-internals`).
3. Place necessary Tesseract language data files in the `lib/` folder (refer to `lib/README.md`).
4. Go to `chrome://extensions`, enable **Developer mode**, and select **Load unpacked** pointing to the extracted folder.

### 📦 Chrome Web Store Deployment
This release package is optimized and ready for Chrome Web Store submission. It excludes all development, testing, and legacy backend code, keeping the package clean and secure.
