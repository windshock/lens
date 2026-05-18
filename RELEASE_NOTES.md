# ScamGuard AI v0.1.28 Release Notes

## 🌐 Full i18n — override / scan-shortcut reasons now translated too

v0.1.27 split the localisation work into "UI chrome now" and "override reasons later." That left every Korean-mode user reading a Korean prefix mixed with an English LLM sentence, and every English-mode user reading a Korean prefix in their otherwise English UI. This release closes that gap — every reason string emitted by the service worker now flows through `t()`.

### Added i18n keys
- **Override prefix**: `bg.override.prefix` — `"[Auto override: {0}] {1}. "` / `"[자동 오버라이드: {0}] {1}. "`
- **Override rules**: separate keys per rule, with placeholders for brand / official domain / offending host / kit markers etc. — `bg.override.O0.baitRedirect`, `O1whois.match`, `O1.freeHostStrong`, `O1.docPagesMention`, `O1.freeHostWarn`, `O1.brandMismatchWithEvidence`, `O1.brandMismatchOnly`, `O1.brandSafe`, `O2.clipboardShell`, `O3.autoDownload`, `O4.dangerousUri`, `O7.kitMarker`, `D1.denylistHit`, `O5.personalTrust`, `O6.popularKr`.
- **Scan-time short-circuit reasons**: `bg.scan.allowlistShortCircuit`, `bg.scan.sessionTrusted`, `bg.scan.denylistShortCircuit`, `bg.scan.internalSkip`.
- **Download cancellation notification**: `notif.downloadCancelTitle`, `notif.downloadCancelBody`.

### Behaviour
- The same `chrome.storage.local.lang` toggle decides which strings are rendered. Switching language in the popup live-updates the SW's `_lang` via `chrome.storage.onChanged`, so a Korean → English switch immediately turns the next override prefix into `[Auto override: …]`.
- The translated reason ends up in `verdict.reason`, which is then displayed in the warning page, verdict detail page, and notification — all three surfaces now match the user's chosen language end-to-end (LLM sentence still English; everything we control is localised).

### Still not translated
- The LLM-generated sentence inside `verdict.reason` — Gemini Nano outputs English by design.
- `CLAUDE.md` (developer documentation, intentionally Korean).
- The SYS prompt sent to the model (English-only by design).

---

# ScamGuard AI v0.1.27 Release Notes

## 🌐 Bilingual UI — English by default, Korean as a runtime toggle

The extension was previously Korean-only in its user-facing chrome (popup, warning page, verdict detail page, notification titles). Non-Korean users couldn't make sense of the buttons. This release switches the default to English and adds a one-click Korean toggle without re-loading the extension.

### What's translated
- **Popup** — heading, status messages (model ready / preparing / unavailable / error), the scan stage ticker, verdict severity labels, the two reset buttons and their tooltips, all confirm and result strings.
- **Warning page** (`warning.html`) — heading, subtitle, field labels (URL / Risk / Brand / Reason), all three action buttons, the rescan-tip tooltip, the footnote, and both proceed/rescan confirm dialogs.
- **Verdict detail page** (`verdict.html`) — heading, severity badge label, brand / suspicious-domain / phishing rows, Yes / No, action buttons, scanned-at line, the allow-this-site confirm and alert messages.
- **Notification titles** — the `[Phishing]` / `[Caution]` / `[Safe]` prefix and head text, plus the trailing `(cached)` / `(internal domain)` / `(user allowed)` qualifier.

### What's deliberately *not* translated
- **LLM verdict reason text** — the `reason` field is generated in English by Gemini Nano (the SYS prompt requires English output).
- **Service-worker override prefixes** (`[자동 오버라이드: O1] 브랜드 도메인 불일치 …`) — these stay in Korean for now. They're rendered inside `reason` so a Korean-mode user reads a Korean prefix + English LLM sentence; an English-mode user reads the same Korean prefix mixed with English. Future release will key these by language too.
- **Service-worker SYS prompt** — always English; only the LLM sees it.
- **CLAUDE.md** — developer documentation, stays Korean.

### How the toggle works
- New `i18n.js` is loaded by every UI page (`popup.html`, `warning.html`, `verdict.html`) via a classic `<script src>` tag, and by the service worker via ESM `import "./i18n.js"`. The file exposes `initI18n() / t(key, …args) / setLang(lang) / getLang() / applyI18nDom(root)` on `globalThis`.
- The language is persisted in `chrome.storage.local.lang` (`"en"` by default, `"ko"` to switch). The service worker listens on `chrome.storage.onChanged` for live updates so notifications fired right after a switch use the new language.
- The popup heading hosts a tiny `EN | 한국어` toggle; clicking it calls `setLang(...)` and re-applies the DOM translations and the dynamic status text without closing the popup.
- HTML elements opt in to translation with `data-i18n="key"` (text) or `data-i18n-title="key"` (tooltips); `<html data-i18n-doctitle="key">` retitles the tab.

### Storage / behaviour
- No new permissions.
- `chrome.storage.local.lang` is added (`"en"` or `"ko"`). It survives both reset buttons — the "Reset all scan history" handler only touches `phishingDenylist` and `allowlistHosts`, intentionally leaving the language preference and `notifIcons` alone.

---

# ScamGuard AI v0.1.26 Release Notes

## ↺ Per-page reset is now also in the popup

v0.1.25 added "Clear history & re-scan" on the red warning screen, but the same surgical reset wasn't reachable for pages that *did* pass — e.g. a site that was previously flagged but now you want to re-evaluate from scratch without first triggering the warning page again. The popup now exposes the same per-host reset directly.

### Layout
The popup now has two ghost buttons under the scan result:
- **이 페이지 기록만 초기화** — new. Hits the same `resetHistoryForUrl` SW handler that the warning screen uses (added in v0.1.25), but seeded with the current active tab's URL.
- **전체 검사 기록 초기화** — the existing nuke-all button, label clarified to reflect the contrast.

### Behavior
- For `http(s)://` URLs the popup confirms with the host name, calls the SW, and shows how many denylist entries and session-cache keys were removed.
- For non-scannable URLs (chrome://, file://, extension pages, etc.) the popup shows an inline warning instead of calling the SW.
- `allowlistHosts` and every other host's accumulated state stay untouched, identical to the warning-page button.

No service-worker changes — same `resetHistoryForUrl` handler from v0.1.25.

---

# ScamGuard AI v0.1.25 Release Notes

## ↺ Per-page "Clear history & re-scan" on the warning screen

The red `warning.html` page now offers a middle-ground option between *back away* and *trust this site forever*: clear the denylist + cache entries **only for this host**, then re-trigger a scan. If the site really is phishing, the next scan will catch it and the warning comes back; if it was a false positive, the user gets a fresh LLM verdict without nuking every other site's accumulated history.

### Button layout
- **안전하게 돌아가기** — closes the tab. Unchanged.
- **이 페이지 기록 지우고 재검사** — new. See below.
- **이 사이트 허용 후 계속** — adds the host to the persistent allowlist. Unchanged.

### What "Clear history & re-scan" does
The handler sends `{type: "resetHistoryForUrl", url}` to the service worker, which:
1. Removes any `v:<sha256(url)>` and `verdict:<sha256(url)>` entries from `chrome.storage.session`, plus any other session verdict entries whose `url` resolves to the same host.
2. Removes the host's hash from `chrome.storage.local.phishingDenylist`.
3. Removes `rdap:<host>` and `cert:<host>` session caches so ownership re-checks fresh.
4. Resets the in-memory `_denylistCache` so the next lookup reloads from storage.
5. **Does not** touch `allowlistHosts` — a previously approved "trust this site" decision is preserved.
6. **Does not** touch other sites' state.

After completion, `warning.js` calls `location.replace(url)` so the tab navigates to the original URL. The service worker's `chrome.tabs.onUpdated` listener triggers `maybeScanNavigation`, which runs a fresh scan with all caches cold. If the deterministic overrides (O0–O7, D1) and the LLM all return safe this time, the user lands on the page; if any rule still fires `danger`, the red intercept comes back — only this time the user knows the kit signatures weren't a one-off cache artefact.

---

# ScamGuard AI v0.1.24 Release Notes

## 🧹 Built-in "Reset history" button in the popup

Until now the only way to clear accumulated state was to paste a snippet into the service-worker console. That was fine when iterating on a fix, but cumbersome whenever a user just wanted a clean slate. The popup now exposes a single "검사 기록 초기화" (Reset history) button.

### What gets cleared
- `chrome.storage.session` — every key (verdict cache `v:…`, warning verdicts `verdict:…`, `lastVerdict`, RDAP cache `rdap:…`, CT cache `cert:…`, `safeDomains`, any legacy `allowlist` array).
- `chrome.storage.local.phishingDenylist` — emptied.
- `chrome.storage.local.allowlistHosts` — emptied.
- Module-scope memory caches in the service worker (`_denylistCache`, `_allowlistCache`, `_userTrustedDomains`) are reset to `null` so the next lookup reloads from storage.

### What is preserved
- `chrome.storage.local.notifIcons` — keeps the runtime-generated action/notification icons so notifications don't briefly fall back to the placeholder icon.
- Service-worker model session, availability state, download progress.

The button is a low-weight ghost-styled link beneath the scan result, with a confirm dialog explaining the three categories that will be removed. After completion the popup result panel shows how many denylist / allowlist entries were dropped.

---

# ScamGuard AI v0.1.23 Release Notes

## 🔕 OWA auto-scan disabled

The `owa.skplanet.com` content-script trigger (T3 in CLAUDE.md) is now disabled. The `owa_scan.js` and `owa_banner.css` files remain in the repository but are no longer injected; only `click_guard.js` keeps running on regular web pages.

To re-enable later, restore the `https://owa.skplanet.com/*` block in the `content_scripts` array of `manifest.json`. No other code changes are needed — the SW's `verdict-banner` / `pg-summary` plumbing is still in place.

---

# ScamGuard AI v0.1.22 Release Notes

## 🔍 Multi-source ownership verification (RDAP + CT) and Microsoft auth domain expansion

`login.microsoftonline.com` — Microsoft's actual Entra ID sign-in endpoint — was flagged at `warn(6)` for "brand mismatch" because `OFFICIAL_DOMAINS["Microsoft"]` only listed five surface domains (microsoft.com, office.com, live.com, outlook.com, azure.com) and skipped the entire authentication/portal family. The LLM correctly identified the brand and even claimed the WHOIS matched — but the WHOIS string the model saw never carried any registrant identity at all (yesnic returns just 7 redacted basic fields on .com domains).

Two parallel improvements:

### 1) OFFICIAL_DOMAINS — Microsoft expansion (manual fast path)
- Added `microsoftonline.com` (Entra ID), `microsoft365.com` (M365 portal), `office365.com` (legacy), `msauth.net` and `msftauth.net` (auth CDN).
- Deliberately *not* added: `windows.net` and `sharepoint.com` — both expose customer-controlled subdomains (`*.cloudapp.windows.net`, `*.sharepoint.com` tenants) and a blanket wildcard would re-open shared-hosting bypass.

### 2) Automated ownership verification (no curation required)

When the model identifies a brand whose hostname is not in `OFFICIAL_DOMAINS`, two independent sources are now consulted in parallel with the yesnic lookup:

- **RDAP** (`https://rdap.org/domain/{registered_domain}`): the modern JSON replacement for WHOIS. We walk `entities[].roles == "registrant"` and pull the `vcardArray` `org` / `fn` value. .com Verisign records are usually GDPR-redacted, but MarkMonitor and several other corporate registrars expose `Registrant: Microsoft Corporation` style entries for big brands.
- **Certificate Transparency** (`crt.sh/?q={host}&output=json&exclude=expired`): pulls the recent issued-cert list and reads `issuer_name` for `O=<org>`. Public CAs (Let's Encrypt, DigiCert, Sectigo, GlobalSign, Amazon Trust, Cloudflare, Google Trust Services, GoDaddy, Entrust) are filtered out — what remains is brand-operated issuing CAs like `Microsoft Corporation`'s internal Azure RSA CAs or `Apple Inc.`'s public CA chain.

Both sources are cached per-host in `chrome.storage.session` to avoid re-querying within a session, and both feed into a single `whois` string that's passed to (a) the LLM prompt and (b) `applyOverrides`.

### 3) New rule `O1-whois`

Before the existing O1 mismatch comparison, `applyOverrides` now checks whether the brand the LLM identified appears as a token (≥4 chars) inside the combined `whois` string. If it does, the override pushes a `safe` outcome (`phishing = false`, score capped at 3) and the O1 mismatch path is skipped entirely. O2 / O3 / O4 / O7 / D1 still run after — so a domain that passes ownership verification but later triggers a credential-form kit signature still gets flagged.

Together this means:
- `login.microsoftonline.com` immediately resolves via OFFICIAL_DOMAINS expansion.
- A future Microsoft auth subdomain that we forget to add manually still passes via RDAP/CT, no extension update needed.
- Real attackers can't trivially set `Registrant: Microsoft Corporation` because registrars verify corporate identity, and they can't get an EV cert with `O = Microsoft Corporation` issued by Microsoft's internal CA without breaching Microsoft.

---

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
