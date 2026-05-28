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

Full privacy policy: https://github.com/windshock/scamguard-ai/blob/main/docs/privacy.md
Source code and issue tracker: https://github.com/windshock/scamguard-ai
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

전체 개인정보 처리방침: https://github.com/windshock/scamguard-ai/blob/main/docs/privacy.md
소스 코드 및 이슈 트래커: https://github.com/windshock/scamguard-ai
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

## Submission checklist (Chrome Web Store dashboard)

- [ ] Developer account created (\$5 + identity verification)
- [ ] Item name: Windshock Lens
- [ ] Summary (en/ko) — pasted above
- [ ] Detailed description (en/ko) — pasted above
- [ ] Category: Productivity
- [ ] Language: English (primary), Korean (added)
- [ ] Privacy policy URL: https://github.com/windshock/scamguard-ai/blob/main/docs/privacy.md
- [ ] Single purpose statement — pasted above
- [ ] Per-permission justifications — pasted above
- [ ] Data usage disclosures — answered above
- [ ] Item icon (128×128) — `icons/action-128.png`
- [ ] Small promo tile (440×280) — `icons/promo-440x280.png`
- [ ] Screenshots (1-5, 1280×800) — captured separately
- [ ] Upload zipped package
- [ ] Submit
