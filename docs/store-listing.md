# Chrome Web Store Listing — Windshock Lens

This document holds the copy and asset references used when filling in the Chrome Web Store developer dashboard for Windshock Lens. Keep it under version control so changes to the public listing are reviewable.

---

## Item details

### Name (max 45 chars)

`Windshock Lens`

(14 chars)

### Short description (a.k.a. Summary, max 132 chars)

**English:**

> Private, on-device scam and phishing analysis. Catches gray-zone phishing before you click. No external LLM.

(110 chars)

**Korean:**

> 온디바이스 AI 와 결정론적 룰로 그레이존 피싱을 클릭 전에 잡아내는 Chrome 확장. 외부 LLM 사용 안 함.

(73 chars)

### Category

**Primary:** Productivity
**Reasoning:** "Safety" / "Tools" subcategories are crowded with VPNs and password managers. "Productivity" is broader and matches the "decide before you click" workflow framing. Could also fit "Communication" but that implies messaging.

### Language

Primary: English. Add Korean as additional language.

---

## Detailed description (English)

Copy-paste into the long-description field. ~480 words.

```
Windshock Lens triages suspicious links and pages directly inside Chrome — before you click, before the page steals credentials, before a malicious download lands on disk. It is built for the gray zone that Chrome Safe Browsing and standard endpoint security tools miss: zero-hour brand-impersonation pages on free hosting platforms (workers.dev, pages.dev, firebaseapp.com, vercel.app, …), AI-client lookalikes, fake software download pages, and ClickFix shell-payload tricks.

How it works

Windshock Lens combines four independent signal layers:

1. Browser-side page extraction — the DOM, forms, links, clipboard writes, and downloads triggered by the target page are collected without sending the page anywhere.
2. On-device Gemini Nano LLM — Chrome's built-in language model evaluates the extracted signals locally. Page content, URLs, and OCR text never reach an external LLM API.
3. Deterministic security rules — hard evidence (shell payload on clipboard, dangerous URI schemes, auto-downloads, phishing-kit fingerprints) yields a verdict without the LLM. Brand-to-domain mismatch overrides catch impersonation patterns the LLM misses.
4. Ownership corroboration — RDAP + Certificate Transparency lookups for the target domain confirm or contradict the LLM's brand identification.

What it actually catches

- Brand-mimic pages on workers.dev / pages.dev / firebaseapp.com / appspot.com hosting
- ClickFix attacks that paste curl ... | sh into your clipboard via fake "verify you are human" buttons
- AppleScript / ms-msdt / vbscript URI scheme abuse
- Phishing kits using clearbit logos, screenshotmachine, atob() URL hiding, Telegram/Discord webhook exfiltration
- Auto-downloads of executable installers from phishing-hosted pages — the download is paused, the host is scanned, then cancelled and erased if phishing

What stays on your device

- Page content, URLs, OCR text — processed only by the local Gemini Nano model
- Bookmarks, history, top sites — read only, never transmitted (used to mark sites you already trust)
- Verdicts and denylist hashes — stored in chrome.storage local to your profile

What leaves your device

- The bare domain name of each scanned host goes to public WHOIS / RDAP / Certificate Transparency services (yesnic / rdap.org / crt.sh) to verify domain ownership. No page content, no path, no query string, no user identity.

Requirements

- Chrome 138 or later
- Gemini Nano on-device model (~2 GB, one-time download). Enable at chrome://on-device-internals.

Full privacy policy: https://github.com/windshock/lens/blob/main/docs/privacy.md
Source code and issue tracker: https://github.com/windshock/lens
```

---

## Detailed description (Korean)

```
Windshock Lens 는 의심스러운 링크와 페이지를 Chrome 안에서 직접 분석합니다. 클릭하기 전에, 페이지가 자격증명을 훔치기 전에, 악성 다운로드가 디스크에 떨어지기 전에 위험을 감지합니다. Chrome Safe Browsing 과 일반적인 엔드포인트 보안 도구가 놓치는 그레이존 — 무료 호스팅 플랫폼(workers.dev, pages.dev, firebaseapp.com, vercel.app 등) 의 영시간 브랜드 사칭 페이지, AI 클라이언트 모사, 가짜 소프트웨어 다운로드 페이지, ClickFix 셸 페이로드 트릭 — 을 표적으로 합니다.

작동 방식

Windshock Lens 는 네 개의 독립적 신호 계층을 결합합니다:

1. 브라우저 내 페이지 추출 — 대상 페이지의 DOM, 폼, 링크, 클립보드 쓰기, 다운로드 트리거를 어디에도 전송하지 않고 수집
2. 온디바이스 Gemini Nano LLM — Chrome 내장 언어모델이 추출된 신호를 로컬에서 평가. 페이지 콘텐츠 / URL / OCR 텍스트는 외부 LLM API 에 도달하지 않음
3. 결정론적 보안 룰 — 클립보드 셸 페이로드, 위험 URI 스킴, 자동 다운로드, 피싱 킷 지문 같은 명확한 증거는 LLM 호출 없이 판정. 브랜드↔도메인 불일치 오버라이드가 LLM 이 놓치는 사칭 패턴을 잡음
4. 소유권 교차 검증 — 대상 도메인의 RDAP + Certificate Transparency 조회로 LLM 의 브랜드 식별을 확인 또는 반박

실제로 잡는 것

- workers.dev / pages.dev / firebaseapp.com / appspot.com 호스팅의 브랜드 사칭 페이지
- "사람인지 확인" 버튼으로 curl ... | sh 를 클립보드에 붙여넣는 ClickFix 공격
- AppleScript / ms-msdt / vbscript URI 스킴 악용
- clearbit 로고, screenshotmachine, atob() URL 숨김, Telegram / Discord webhook exfiltration 을 쓰는 피싱 킷
- 피싱 호스팅 페이지의 실행파일 자동 다운로드 — 다운로드를 일시정지, 호스트 스캔, 피싱 확정 시 취소 및 삭제

기기에 머무는 것

- 페이지 콘텐츠 / URL / OCR 텍스트 — 로컬 Gemini Nano 모델만 처리
- 북마크 / 방문 기록 / 자주 가는 사이트 — 읽기 전용, 전송 안 함 (이미 신뢰하는 사이트 표시 용도)
- Verdict 와 denylist 해시 — 프로필 로컬 chrome.storage 에 저장

기기 밖으로 나가는 것

- 스캔하는 호스트의 도메인 이름만 공개 WHOIS / RDAP / Certificate Transparency 서비스(yesnic / rdap.org / crt.sh) 로 전송 — 도메인 소유권 검증용. 페이지 콘텐츠 / 경로 / 쿼리 / 사용자 신원 일체 전송 안 함

요구사항

- Chrome 138 이상
- Gemini Nano 온디바이스 모델 (약 2GB, 1회 다운로드). chrome://on-device-internals 에서 활성화

전체 개인정보 처리방침: https://github.com/windshock/lens/blob/main/docs/privacy.md
소스 코드 및 이슈 트래커: https://github.com/windshock/lens
```

---

## Single purpose statement

> Windshock Lens evaluates whether the URL the user is about to navigate to (or has just navigated to) is a phishing or scam page, using on-device AI and deterministic security signals. Every permission and feature in the extension exists to support this single classification task.

---

## Per-permission justifications

Reused verbatim from `docs/privacy.md §5`. Each will be entered into the developer dashboard "Permission justification" field.

| Permission | Justification |
|---|---|
| `<all_urls>` (host) | Phishing pages appear on arbitrary HTTPS hosts. The click-guard content script must run on all pages to block dangerous URI clicks (e.g., `applescript://` ClickFix attacks) before they execute. |
| `tabs` | Open an inactive hidden tab to extract DOM content during a scan; intercept the active tab with a warning page on a confirmed phishing verdict. |
| `scripting` | Inject only the extension's own bundled scripts (`content_extract.js`, `clipboard_hook.js`) into pages for extraction — no remote code, no eval. |
| `storage` | Persist denylist hashes, allowlist hosts, language preference, and session caches. |
| `notifications` | Show a verdict notification when a scan completes (suppressed when the popup is open). |
| `offscreen` | Run Tesseract OCR (local WASM) and parse WHOIS HTML in an offscreen document. |
| `downloads` | Pause a download when it starts, scan the hosting page, then cancel + erase the partial file if the host is phishing. |
| `activeTab` | The popup's "Scan this page" button needs read access to the current tab. |
| `bookmarks`, `history`, `topSites` | The O5 SAFE override treats hosts you already bookmark / visit / have in top sites as more trustworthy (read-only, never written, never transmitted). |
| `contextMenus` | The "Scan this link" right-click menu entry. |

---

## Data usage disclosures (Chrome Web Store form)

The dashboard requires explicit answers to "what user data does your extension collect and what do you do with it?" Answers:

- **Personally identifiable information** — Not collected.
- **Health information** — Not collected.
- **Financial and payment information** — Not collected.
- **Authentication information** — Not collected.
- **Personal communications** — Not collected. (OWA mail-content code was removed in v0.2.x.)
- **Location** — Not collected.
- **Web history** — **Used locally only.** `chrome.history` read access powers the O5 SAFE override (treats hosts in your history as more trustworthy). Never transmitted.
- **User activity** — **Used locally only.** Each scan reads the URL and page content of the target page. Used as input to the local LLM and deterministic rules. Never transmitted.
- **Website content** — **Used locally only.** DOM, forms, links, clipboard writes from the scanned page are read as scan input. Never transmitted.

For each above we'll check the corresponding "I do not sell or transfer user data to third parties" and "I do not use or transfer user data for purposes unrelated to my item's single purpose" boxes (both true).

---

## Promotional assets

| Asset | Status |
|---|---|
| 128×128 store icon | Use `icons/action-128.png` |
| Small promotional tile (440×280) | Generated by `tools/generate_promo.py` → `icons/promo-440x280.png` |
| Marquee promotional tile (1400×560) | Optional — generate only if Google requests it |
| Screenshots (1-5, 1280×800) | **Manual capture required** — open the extension in Chrome and screenshot: (1) popup with "model ready" status, (2) popup mid-scan, (3) popup with a danger verdict, (4) warning.html intercept page, (5) verdict.html detail page |

---

## Chrome Web Store dashboard — Privacy form (Korean copy)

개발자 대시보드 "개인정보 보호" 탭의 각 입력 필드에 그대로 붙여넣을 한국어 사본. 각 필드는 1,000자 제한이며 모두 그 이내.

### 전용 목적 설명

```
Windshock Lens 는 사용자가 방문하려는(또는 방금 방문한) URL 이 피싱 또는 스캠 페이지인지를 Chrome 안에서 평가합니다. 평가는 전적으로 온디바이스 Gemini Nano LLM 과 결정론적 보안 룰(브랜드↔도메인 불일치, 위험 URI 스킴, 클립보드 셸 페이로드, 자동 다운로드, 피싱 킷 마커) 로 이루어지며, 페이지 콘텐츠는 외부 LLM API 로 전송되지 않습니다. 확장의 모든 권한과 기능은 이 단일한 피싱 판정 작업을 지원하기 위해 존재합니다.
```

### contextMenus 사용 근거

```
링크 우클릭 시 "이 링크 피싱 검사" 컨텍스트 메뉴 항목 하나만 등록합니다. 사용자가 클릭하면 해당 URL 에 대해 피싱 검사를 실행합니다. 다른 컨텍스트 메뉴 항목은 등록하지 않습니다.
```

### tabs 사용 근거

```
검사 흐름의 두 단계에 사용합니다: (1) 대상 URL 의 DOM 을 추출하기 위해 비활성(inactive) 숨김 탭을 열어 페이지를 렌더하고 추출이 끝나면 즉시 닫음. (2) 피싱이 확정된 verdict 인 경우 사용자의 활성 탭을 경고 페이지(warning.html) 로 전환해 진입을 차단. 다른 탭의 콘텐츠를 임의로 읽거나 사용자 모르게 조작하지 않으며, 단일 목적인 피싱 판정 외 용도로 사용하지 않습니다.
```

### scripting 사용 근거

```
확장 패키지에 정적으로 번들된 자체 스크립트(content_extract.js, clipboard_hook.js) 만 페이지에 주입합니다. 원격 코드 다운로드, eval(), 외부 fetch 후 실행, 동적 import 등은 일체 사용하지 않습니다. 주입 대상은 검사가 진행 중인 페이지로만 한정되며, 단일 목적인 피싱 판정에 필요한 DOM / form / clipboard 신호 수집 외의 용도로는 사용하지 않습니다.
```

### storage 사용 근거

```
다음 데이터를 사용자 프로필 로컬의 chrome.storage 에 저장합니다: (a) 확정된 피싱 호스트의 sha256 해시 목록(denylist), (b) 사용자가 경고 페이지에서 명시적으로 허용한 호스트 목록(allowlist), (c) 사용자가 선택한 UI 언어(en/ko), (d) 세션 동안 유지되는 verdict / RDAP / CT 캐시. 어떤 항목도 외부 서버로 전송하지 않으며, 사용자는 popup 의 "검사 기록 초기화" 버튼으로 언제든 전부 또는 호스트별로 삭제 가능합니다.
```

### notifications 사용 근거

```
검사가 완료되었을 때 안전 / 주의 / 위험 verdict 를 OS 알림으로 표시합니다. 위험 등급의 경우 사용자가 즉시 인지하도록 강조하며, popup 이 열려 있는 경우에는 중복 표시를 피하기 위해 알림을 생략합니다. 알림 본문은 단일 목적인 피싱 판정 결과(점수·브랜드·이유) 만 포함합니다.
```

### offscreen 사용 근거

```
다음 두 작업을 service worker 에서 직접 수행할 수 없어 offscreen document 를 사용합니다: (1) Tesseract.js (확장 패키지에 정적 번들된 WASM·언어 모델) 로 페이지 이미지 OCR 수행 — 외부 fetch 없이 100% 로컬. (2) WHOIS HTML 응답을 DOMParser 로 파싱해 도메인 소유권 필드를 추출. offscreen document 는 검사 시점에만 활성화되며 단일 목적인 피싱 판정 외 용도로는 사용하지 않습니다.
```

### downloads 사용 근거

```
피싱 페이지가 자동으로 실행파일(.exe / .dmg / .msi 등) 다운로드를 트리거하는 경우, downloads.onCreated 에서 다운로드를 즉시 일시정지하고 호스팅 페이지(referrer)를 검사한 뒤, 피싱이 확정되면 cancel + erase 로 파일을 삭제합니다. 안전 판정이면 조용히 resume 합니다. 사용자가 명시적으로 시작한 일반 다운로드는 검사 대상이 되지 않으며 다운로드 내역을 외부로 전송하지도 않습니다.
```

### activeTab 사용 근거

```
popup 의 "현재 페이지 검사" 버튼이 사용자의 명시적 클릭으로 현재 활성 탭의 URL 을 읽기 위해 사용합니다. 사용자 동작 없이 자동으로 활성 탭에 접근하지 않으며, 단일 목적인 피싱 판정의 트리거 시점에만 한정합니다.
```

### bookmarks 사용 근거

```
O5-SAFE 결정론적 오버라이드가 사용자가 이미 북마크한 호스트를 "사용자가 신뢰하는 도메인" 으로 분류해 false positive 를 줄이는 데 사용합니다. 읽기 전용 — 북마크의 추가 / 수정 / 삭제 일체 없음. 북마크 내용을 외부로 전송하지 않으며, 단일 목적인 피싱 판정의 신뢰 신호 입력으로만 사용합니다.
```

### history 사용 근거

```
O5-SAFE 결정론적 오버라이드가 사용자가 과거 자주 방문한 호스트를 "사용자가 신뢰하는 도메인" 으로 분류해 false positive 를 줄이는 데 사용합니다. 읽기 전용 — 방문 기록의 추가 / 수정 / 삭제 일체 없음. 방문 기록을 외부로 전송하지 않으며, 단일 목적인 피싱 판정의 신뢰 신호 입력으로만 사용합니다.
```

### topSites 사용 근거

```
O5-SAFE 결정론적 오버라이드가 Chrome 의 "자주 방문하는 사이트" 목록을 사용자가 신뢰하는 도메인의 신호로 사용합니다. 읽기 전용, 외부 전송 없음. 단일 목적인 피싱 판정의 신뢰 신호 입력으로만 사용하며 다른 용도 없음.
```

### 호스트 권한 사용 근거 (`<all_urls>`)

```
피싱 페이지는 임의의 HTTPS 호스트(workers.dev, pages.dev, firebaseapp.com, vercel.app 같은 무료 호스팅 + 임의 도메인) 에 출현하기 때문에 단일 호스트로 매치 패턴을 좁힐 수 없습니다. 호스트 권한은 두 경로에 사용됩니다: (1) 클릭 가드 content script(click_guard.js) 가 모든 http(s) 페이지에서 동작해 위험 URI 스킴 클릭(예: applescript:// 의 ClickFix 변종) 을 실행 직전에 차단. (2) scanUrl 흐름이 검사 대상 URL 의 DOM 을 추출하기 위해 임의 호스트에 접근. 추출은 검사 시점에 한정되며, 사용자 행동 없이 백그라운드로 임의 페이지를 fetch 하지 않습니다. content script 와 fetch 모두 단일 목적인 피싱 판정 외 용도로는 절대 사용하지 않습니다.
```

### 원격 코드 사용

`아니요, 원격 코드 권한을 사용하고 있지 않습니다.` 선택.

근거 (참고용, 폼이 근거 입력을 요구할 경우):

```
확장은 외부 JS / Wasm 을 fetch, eval, 동적 import, 외부 <script> 태그 등 어떤 방식으로도 실행하지 않습니다. OCR 에 사용하는 Tesseract.js 라이브러리와 traineddata 언어 모델(eng, kor) 도 모두 확장 패키지에 정적 번들되어 있고 lib/README.md 가 그 정확한 파일 목록을 문서화합니다. background.js 는 manifest.json 의 service_worker 로만 로드되며 외부 코드 의존성 0개.
```

### 사용자 데이터 수집

다음 세 항목만 체크 — 모두 "로컬 처리, 외부 전송 없음":

- ☑ **웹 기록** — chrome.history 읽기. O5-SAFE 오버라이드가 사용자 신뢰 신호로 사용. 전송 안 함.
- ☑ **사용자 활동** — 검사 트리거 시점의 활성 탭 URL 과 페이지 콘텐츠 추출 결과. 온디바이스 Gemini Nano 입력으로만 사용. 전송 안 함.
- ☑ **웹사이트 콘텐츠** — 검사 대상 페이지의 DOM, form, link, image src, clipboard write, visible text. 온디바이스 LLM + 결정론적 룰 입력으로만 사용. 전송 안 함.

체크 안 함 (해당 데이터를 수집·처리하지 않음):

- ☐ 개인 식별 정보 / ☐ 건강 정보 / ☐ 금융·결제 정보 / ☐ 인증 정보 / ☐ 개인적인 커뮤니케이션 / ☐ 위치

### 3가지 공개 확약 (모두 체크)

- ☑ 승인된 사용 사례를 제외하고 사용자 데이터를 제3자에 판매 또는 전송하지 않음 (해당 없음 — 제3자 전송 자체가 없음)
- ☑ 항목의 전용 목적과 관련 없는 목적으로 사용자 데이터를 사용하거나 전송하지 않습니다
- ☑ 신용도 판단 또는 대출을 위해 사용자 데이터를 사용하거나 전송하지 않습니다

### 개인정보처리방침 URL

```
https://github.com/windshock/lens/blob/main/docs/privacy.md
```

(GitHub Pages 의 호스팅 HTML 버전이 필요할 경우: `https://windshock.github.io/lens/privacy.md` 도 같은 콘텐츠를 raw markdown 으로 서빙. 정식 HTML 렌더링은 GitHub 의 blob 뷰가 더 친화적이라 위 URL 권장.)

---

## Chrome Web Store dashboard — Privacy form (English copy)

Same fields, English copy. Use whichever language matches your developer-dashboard locale. All fields within the 1,000-char limit.

### Single purpose description

```
Windshock Lens evaluates whether the URL the user is about to navigate to (or has just navigated to) is a phishing or scam page, entirely inside Chrome. The evaluation runs through the on-device Gemini Nano LLM and a set of deterministic security rules (brand-to-domain mismatch, dangerous URI schemes, clipboard shell payloads, auto-downloads, phishing-kit fingerprints). Page content is never sent to an external LLM API. Every permission and feature in the extension exists to support this single phishing-classification task.
```

### contextMenus justification

```
Registers a single right-click context menu entry, "Scan this link for phishing", on link targets. When the user clicks it, the extension runs a phishing scan on that specific URL. No other context menu items are added.
```

### tabs justification

```
Used in two parts of the scan flow: (1) opens an inactive hidden tab to extract the target URL's DOM, then closes it as soon as extraction completes; (2) on a confirmed phishing verdict, switches the user's active tab to the warning page (warning.html) so the user does not interact with the malicious page. The extension does not read content from unrelated tabs or modify other tabs without user intent, and uses this permission only for its single phishing-classification purpose.
```

### scripting justification

```
Injects only the extension's own statically-bundled scripts (content_extract.js, clipboard_hook.js) into pages. No remote-code download, no eval(), no dynamic import, no fetch-then-execute. Injection is scoped to the page being scanned. Used solely to collect DOM, form, and clipboard signals that feed the phishing classifier — nothing else.
```

### storage justification

```
Persists the following in chrome.storage local to the user's profile: (a) SHA-256 hashes of hosts confirmed as phishing (denylist); (b) hostnames the user has explicitly allowed via the warning page (allowlist); (c) the user's UI language choice (en/ko); (d) session-scoped verdict / RDAP / CT caches. None of this is transmitted to any external server. The user can clear all of it, or just a specific host, from the popup's reset buttons at any time.
```

### notifications justification

```
Shows a system notification with the safe / warn / danger verdict when a scan completes. The danger level uses requireInteraction so the user notices it. If the toolbar popup is already open, the notification is suppressed to avoid duplicate UI. Notification text contains only the phishing-classification result (score, brand, reason).
```

### offscreen justification

```
Two scan-time tasks cannot run inside the service worker because they need DOM APIs: (1) Tesseract.js OCR (the WASM and language data are statically bundled with the extension — no network fetch) of images on the scanned page; (2) DOMParser parsing of WHOIS HTML responses to extract domain-ownership fields. The offscreen document is created on demand for these tasks and is not used for any purpose outside the single phishing-classification flow.
```

### downloads justification

```
When a phishing-hosted page auto-triggers an executable download (.exe / .dmg / .msi / etc.), downloads.onCreated pauses the download immediately, scans the hosting page (referrer), and on a confirmed phishing verdict cancels the download and erases the partial file. On a safe verdict the download silently resumes. Downloads the user initiates from legitimate pages are not interfered with, and download metadata is never transmitted externally.
```

### activeTab justification

```
The popup's "Scan this page" button reads the current active tab's URL on the user's explicit click. The extension does not access the active tab without user action, and uses this permission only as the trigger entry point of the single phishing-classification purpose.
```

### bookmarks justification

```
The O5-SAFE deterministic override treats hosts the user has bookmarked as "user-trusted" to reduce false positives on sites the user already considers legitimate. Read-only — bookmarks are never added, modified, or deleted. Bookmark contents are never transmitted, and this signal is used only as a trust input to the single phishing-classification purpose.
```

### history justification

```
The O5-SAFE deterministic override treats hosts the user has frequently visited as "user-trusted" to reduce false positives. Read-only — history is never modified or transmitted. Used only as a trust signal for the single phishing-classification purpose.
```

### topSites justification

```
The O5-SAFE deterministic override uses Chrome's top-sites list as an additional trust signal. Read-only, never transmitted. Used solely as input to the phishing-classification trust evaluation.
```

### Host permission justification (`<all_urls>`)

```
Phishing pages appear on arbitrary HTTPS hosts — free-hosting platforms (workers.dev, pages.dev, firebaseapp.com, vercel.app) plus any other domain — so host permissions cannot be narrowed to a fixed match pattern. Host permission is used in two places: (1) the click-guard content script (click_guard.js) runs on every http(s) page so it can intercept dangerous-URI-scheme clicks (for example applescript:// ClickFix variants) before execution; (2) the scanUrl flow fetches and extracts the DOM of the URL being scanned. Extraction is scoped to active scans and does not silently fetch arbitrary pages in the background. Content scripts and fetches are never used for anything outside the single phishing-classification purpose.
```

### Remote code use

Select `No, I am not using remote code.`

Justification (for reference, if the form asks):

```
The extension does not fetch, eval, dynamically import, or load external <script> tags for any JS or Wasm at runtime. The Tesseract.js OCR library and its eng / kor traineddata language models are statically bundled inside the extension package (lib/README.md documents the exact file list). background.js runs only as the manifest's service_worker. Zero external code dependencies at runtime.
```

### User data collected

Check these three categories — all marked "processed locally only, never transmitted":

- ☑ **Web history** — `chrome.history` read access powers the O5-SAFE override (treats hosts in your history as more trustworthy). Never transmitted.
- ☑ **User activity** — At scan time, the URL and page-content extraction of the target page are used as input to the local LLM and deterministic rules. Never transmitted.
- ☑ **Website content** — DOM, forms, links, image sources, clipboard writes, and visible text from the scanned page are used as scan input. Never transmitted.

Leave unchecked (not collected or processed):

- ☐ Personally identifiable information / ☐ Health information / ☐ Financial and payment information / ☐ Authentication information / ☐ Personal communications / ☐ Location

### Three disclosures (all checked, all true)

- ☑ I do not sell or transfer user data to third parties, except in the approved use cases (N/A — no third-party transfer happens at all).
- ☑ I do not use or transfer user data for purposes unrelated to my item's single purpose.
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

```
https://github.com/windshock/lens/blob/main/docs/privacy.md
```

(If a hosted-HTML version is preferred over a GitHub blob view, `https://windshock.github.io/lens/privacy.md` serves the same content as raw markdown. The GitHub blob view above renders the markdown with anchors and a navigation, so it is the better URL for reviewers.)

---

## Submission checklist (Chrome Web Store dashboard)

- [ ] Developer account created (\$5 + identity verification)
- [ ] Item name: Windshock Lens
- [ ] Summary (en/ko) — pasted above
- [ ] Detailed description (en/ko) — pasted above
- [ ] Category: Productivity
- [ ] Language: English (primary), Korean (added)
- [ ] Privacy policy URL: https://github.com/windshock/lens/blob/main/docs/privacy.md
- [ ] Single purpose statement — pasted above
- [ ] Per-permission justifications — pasted above
- [ ] Data usage disclosures — answered above
- [ ] Item icon (128×128) — `icons/action-128.png`
- [ ] Small promo tile (440×280) — `icons/promo-440x280.png`
- [ ] Screenshots (1-5, 1280×800) — captured separately
- [ ] Upload zipped package
- [ ] Submit
