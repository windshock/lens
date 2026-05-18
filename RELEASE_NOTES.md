# ScamGuard AI v0.1.21 Release Notes

## 🎯 O7 — Deterministic phishing-kit fingerprints

v0.1.20's O1 escalation only fires when Gemini Nano successfully identifies the impersonated brand. The `rsig.org` Microsoft sign-in spoof exposed the gap: even with `name="office_passwd"`, `name="ms_link"`, a pre-filled `<input type="hidden" name="email" value="jeff.kim@sk.com">`, and Microsoft's actual `aadcdn.msauth.net` stylesheet, the model returned `brand: null, phishing: false, phishing_score: 6` — under the danger threshold and not eligible for O1 elevation. The page never triggered the red warning.

Looking at the kit's inline JavaScript gave us three Tier-1 fingerprints — patterns essentially never used by legitimate sites:

```js
// 1) victim-domain logo fetch — only phishing kits brand themselves dynamically per target
`https://logo.clearbit.com/${domain}`

// 2) victim company homepage screenshot as blurred background
`https://api.screenshotmachine.com?key=...&url=https://${domain}&...`

// 3) base64-obfuscated credential exfil endpoint
const actionUrl = atob('Li4vb2Z4LnBocA=='); // → "../ofx.php"
```

### What changed
- `content_extract.js` scans every inline `<script>` (the same loop that already pulls `clipboard.writeText` literals) and records up to 8 phishing-kit markers into `behaviors.phishingKitMarkers`:
  - `clearbit-logo` — substring match on `logo.clearbit.com/`
  - `screenshotmachine` — substring match on `api.screenshotmachine.com`
  - `atob-url:<decoded>` — every `atob('<base64>')` literal is decoded; markers fire when the result starts with `../`, `./`, `http(s)://`, or ends in `.php` / `.aspx` / `.asp` / `.jsp` / `.do` / `.action` / `.cgi`
- `background.js` adds rule **O7**: when `phishingKitMarkers` is non-empty **and** the same page has a password/email-input form (`hasCredentialLikeForms`), elevate to `danger` (score ≥ 9, `phishing = true`). Runs between O4 and D1, so D1 / O5 / O6 still apply on top.
- The SYS prompt's "Critical signals" section now mentions `phishingKitMarkers` so Gemini Nano raises its score even when the deterministic O7 doesn't reach it.

### Why this is safe against false positives
Each marker individually has plausible legitimate uses (CRM dashboards embed Clearbit logos; monitoring tools call screenshotmachine; frameworks use `atob` for source maps and tokens). The override only fires when at least one marker co-exists with `hasCredentialLikeForms` — i.e. the page is asking for a password. That combination is the discriminator: legitimate password pages don't dynamically pull the logo of whatever email domain the user just typed.

---

# ScamGuard AI v0.1.20 Release Notes

## 🔒 Elevate brand-mismatch + credential-form to danger

Reported case: `https://rsig.org/rqq/flb/jHl5zffjk7Tkd6FmW8yBr90Uskjk7Tx4QsP13vW8yB#` — a Microsoft sign-in spoof hosted on a random `.org` domain, with `<input type="password" name="office_passwd">` and a pre-filled `<input type="hidden" name="email" value="jeff.kim@sk.com">` (clear spear-phishing kit signature). The page was flagged only at severity `warn` (score 6) and never triggered the full-screen red warning — only a yellow toast.

### Why it slipped through
The O1 override has two branches once a brand-vs-domain mismatch is detected:
- If the offending host is on a free-hosting platform (`workers.dev`, `vercel.app`, `github.io`, …): elevate to danger when high-confidence phishing evidence is present.
- Otherwise (any other domain, including `rsig.org`): cap at `score = 6`, severity `warn`, regardless of evidence.

That asymmetry made sense for "stray brand mention on a normal site is rarely phishing", but it lost a real attack vector — short-lived random domains hosting a polished credential page.

### Fix
In the non-free-hosting branch, when `hasCredentialLikeForms` / auto-download / dangerous URI / shell clipboard payload is already on the page **and** the LLM identified a brand whose official domain does not match, escalate to `danger` (score ≥ 9, `phishing = true`). The plain mismatch-without-evidence case still stays at `warn(6)` — news articles, docs, and referrals quoting a brand on an unrelated domain are not phishing on their own.

---

# ScamGuard AI v0.1.14 Release Notes

## 🔧 Skip private IPs · Sync stale OWA summary bars

Two bug fixes triggered by real reports.

### Private IPs are no longer scanned
Before this release, `isInternalDomain` only matched the hostname against the static `INTERNAL_DOMAINS` list, so something like `http://172.29.247.33:8080/` (RFC1918 space) bypassed the internal short-circuit, went all the way through Gemini Nano, was flagged 9/10 phishing for "IP on non-standard port + WHOIS failed + login form", and got persisted into the denylist. Subsequent visits to the same intranet host kept hitting the warning page.

- New helper `isPrivateIp(host)` covers IPv4 RFC1918 (10/8, 172.16/12, 192.168/16) plus loopback (127/8) and link-local (169.254/16), and IPv6 loopback (`::1`), ULA (`fc00::/7`), and link-local (`fe80::/10`).
- `isInternalDomain` now returns true for any private-IP host, so the existing internal-short-circuit handles intranet pages: extract DOM → check `hasInternalBypassRisk` → skip the LLM if nothing dangerous.
- Defense-in-depth: `addToDenylist` refuses to record private IPs, and `isDenylisted` returns false for them — so any private-IP hash that was already stored from earlier versions becomes inert without needing a migration step.

### OWA summary bar stays in sync across email switches
The red "⚠ 이 메일에 피싱 의심 링크 N개" bar was prepended to OWA's reading-pane element when a dangerous link was detected, but the bar was only recomputed inside the verdict-banner handler. When the user switched to a different email (an OWA SPA navigation that replaces the inner item content), the badges vanished but the parent pane survived — and so did the stale red bar, with no new verdict to clear it.

- New `syncAllSummaryBars()` walks every live `.pg-summary.pg-danger`, re-counts its parent pane's danger badges, and removes the bar (or updates the count) accordingly.
- Hooked into both the MutationObserver (catches email switches) and the verdict-banner handler (catches verdicts arriving after a panel changes).

---

# ScamGuard AI v0.1.13 Release Notes

## ✨ Allowlist UX Overhaul

Until v0.1.12 the allowlist was **keyed by sha256 of the full URL and scoped to the browser session**. Two symptoms followed:

- Allowing `https://app.any.run/?_gl=…&register` once did not cover the next visit if even a single tracking-parameter character changed — the red warning came back on the same site.
- Closing the browser wiped every entry, forcing users to re-approve the same sites every session.

### What changed
- **Host-scoped allowlist**: approving any page on `app.any.run` now allows every path and every query-string variant on that exact host. Sibling subdomains (e.g. `report.any.run`) stay separate — a deliberate balance between convenience and protection against shared-hosting tricks.
- **Persistent storage (`chrome.storage.local`)**: aligned with the denylist storage layer added in v0.1.12. Entries survive auto-updates, service-worker restarts, and browser restarts. **Only a full Remove → Load unpacked clears them.**
- **UI copy refreshed**: button labels, confirm prompts, and post-action messages on `warning.html` / `verdict.html` now say "allow this site" + "kept until the extension is reinstalled" instead of the old per-URL/per-session wording.

### Why it shipped now
Triggered by a real false positive: `https://app.any.run/?_gl=…#register` (a legitimate malware analysis platform) was flagged 9/10 phishing because Gemini Nano saw login forms plus copy about analyzing malicious URLs. The user pressed "Allow", went back, and was immediately blocked again on a slightly different URL. A single "Allow" should be enough for that host.

---

# ScamGuard AI v0.1.12 Release Notes

## 🔒 Security Hardening

- **O5 shared-hosting slice bypass closed**: the personal-trust-domain rule (O5, added in v0.1.11) fell back to `finalHost.split('.').slice(-2).join('.')` when the full host was not in the trusted Set. That meant a user who routinely visited legitimate workers across `*.workers.dev` would silently whitelist `workers.dev` itself — and every phishing site hosted on the same platform inherited the trust. We now reject the slice fallback whenever it resolves to a shared-hosting eTLD (`workers.dev`, `pages.dev`, `vercel.app`, `github.io`, etc. — anything `FREE_HOSTING_RE` matches). Only an exact full-host match in bookmarks / topSites still triggers O5. The same guard is mirrored in O6 (`POPULAR_KR_DOMAINS`) as a defensive layer.
- **Persistent denylist (`chrome.storage.local`)**: when a verdict resolves to `phishing === true && phishing_score >= 7`, we record the host as a sha256 hash. `applyOverrides` consults the denylist before O5/O6 and pushes a `D1` danger rule on hit, which makes both overrides skip via their existing `!danger` guard (security). `scanUrl` checks the denylist immediately after the session cache lookup and short-circuits with a denied verdict — no LLM, no DOM extraction, no OCR (efficiency). The denylist survives auto-updates, service-worker restarts, and browser restarts; **only a full Remove → Load unpacked clears it.**
- **OWA cached-intercept bug fixed**: clicking an anchor in an Outlook Web Access mail body would open the phishing page in a new tab but the red `warning.html` screen never appeared. Root cause: `dispatchResult` guarded the intercept with `!meta?.cached`, and the OWA pre-scan had already cached the verdict — so the click-time navigation hit the cache and skipped the intercept. We now treat `navigation`, `action`, and `popup` as fresh user intent: cache hits no longer suppress the warning. The allowlist guard (`!meta?.allowed`) stays in place so deliberate user approvals continue to pass through.

---

# ScamGuard AI v0.1.11 Release Notes

## 🚀 What's New in v0.1.11
- **Korean Portal Whitelist (O6)**: added a static set of ~120 top Korean domains (Cloudflare Radar-based, `POPULAR_KR_DOMAINS`). Cuts false positives on popular Korean sites by domain-match alone — works even when Gemini Nano fails to recognize the brand.
- **Personal Trust Domains (O5)**: new override that merges the user's bookmarks, history (≥10 visits in the last 90 days), and top sites into a personal trusted-domain Set. Visits to sites the user already engages with regularly are automatically treated as benign when no other danger signal fires. Requires the new `bookmarks` / `history` / `topSites` permissions.
- **Expanded OFFICIAL_DOMAINS**: ~60 additional Korean brands (Naver, Kakao, Nate, Coupang, major banks, etc.) added to the brand → official-domain mapping used by O1.

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
