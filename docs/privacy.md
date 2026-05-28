# Windshock Lens — Privacy Policy

**Effective date:** 2026-05-28
**Extension version covered:** v0.2.0 and later
**Maintainer contact:** open a GitHub issue at https://github.com/windshock/scamguard-ai/issues

This document describes what data Windshock Lens processes, where that processing happens, what leaves your device, and what is stored. It is written to satisfy the Chrome Web Store Developer Program Policies and to give users a precise picture of the extension's privacy posture.

---

## 1. What Windshock Lens does

Windshock Lens is a Chrome MV3 extension that triages suspicious links and pages for phishing or scam patterns. It runs entirely inside your browser, using Chrome's built-in Gemini Nano language model (Prompt API) and deterministic security rules. It does not sell or share your data.

---

## 2. Data the extension processes

### 2.1 Processed locally only, never transmitted

The following are read, analyzed, and discarded inside your browser. They are not sent to any remote server.

| Data | Source | Why |
|---|---|---|
| URL of the page being scanned | Active tab, clicked link, popup action, context menu, download event | Input to Gemini Nano and deterministic rules |
| Page DOM content (text, form fields, anchors, images) | The target page, via `chrome.scripting.executeScript` content injection | Input to the LLM prompt and the hard-evidence precheck (credential-form detection, dangerous URI detection, shell-payload detection) |
| Page image bytes | Fetched by the extension for OCR | Tesseract OCR (local WASM) extracts text from screenshots/images |
| Clipboard write payloads observed on the page | Page-injected hook (`clipboard_hook.js`) records what the page writes to the clipboard | Detect ClickFix-style shell-command attacks (e.g., `curl ... | sh`) |
| Recent download URLs | `chrome.downloads.onCreated` event | Pause-and-scan the hosting page; cancel if phishing |
| Browser bookmarks, history, top sites (read-only) | `chrome.bookmarks` / `chrome.history` / `chrome.topSites` APIs | The O5 SAFE override treats hosts you already visit/bookmark as more trustworthy. Read-only, never written back, never transmitted |

### 2.2 Sent to public third-party domain-metadata services

For each scanned host, the extension queries public WHOIS / RDAP / Certificate Transparency lookup services to corroborate domain ownership. **Only the domain name is sent — never page content, URLs with path/query, user identity, or browsing context.**

| Endpoint | Sent | Purpose |
|---|---|---|
| `yesnic.com` (WHOIS web form) | Registered domain name | Domain registrar / registration date / name server (informs LLM context) |
| `rdap.org` (RDAP bootstrap) | Registered domain name | Standard JSON registrant lookup (informs O1-whois ownership override) |
| `crt.sh` (Certificate Transparency log) | Hostname | Look up the certificate issuer organisation (informs O1-whois ownership override) |

These three lookups are cached in `chrome.storage.session` (cleared when the browser closes) to avoid repeated requests for the same domain in a session.

### 2.3 Sent to no one

The extension does **not** transmit any of the following to any server:

- Page content (DOM, text, OCR results, clipboard payloads)
- Page URLs with path or query string
- Browser history, bookmarks, or top sites lists
- User identity or any account information
- Verdict results (stored only locally)
- Diagnostics / telemetry / crash reports

---

## 3. Data the extension stores

All extension storage is local to your browser profile (`chrome.storage.local` and `chrome.storage.session`). Nothing is synced across devices unless you explicitly enable Chrome profile sync, which is independent of this extension.

| Storage key | Scope | Content | Why |
|---|---|---|---|
| `phishingDenylist` | `chrome.storage.local` (persistent) | Array of SHA-256 hashes of hosts that scored ≥7 phishing in past scans | Subsequent visits to a confirmed phishing host short-circuit to a warning without re-running the LLM. Hashed so the raw host list is not directly readable |
| `allowlistHosts` | `chrome.storage.local` (persistent) | Plaintext hostnames the user explicitly allowed via the warning page | Lets the user bypass future warnings for hosts they trust |
| `lang` | `chrome.storage.local` (persistent) | `"en"` or `"ko"` | UI language preference |
| `notifIcons` | `chrome.storage.local` (persistent) | Data URLs of generated notification icons | Avoid re-rendering on every notification |
| `v:<sha256(url)>` | `chrome.storage.session` (session-only) | Last verdict for that URL | Avoid re-scanning the same URL within a session |
| `lastVerdict` | `chrome.storage.session` (session-only) | The most recent verdict | Powers the popup detail view |
| `rdap:<domain>`, `cert:<host>` | `chrome.storage.session` (session-only) | Cached RDAP / CT responses | Avoid re-querying within a session |
| `safeHosts` | `chrome.storage.session` (session-only, 6-hour TTL per entry) | Hosts the extension has temporarily trusted in this session | Avoid LLM call for hosts already proven safe in this session |

You can clear all of this at any time via the popup's **Reset history** button, or per-host via **Clear history for this page**.

---

## 4. Data the extension does not collect

To be explicit, none of the following are read or transmitted:

- Personally identifiable information (name, email, phone, address)
- Login credentials, passwords, authentication tokens
- Financial information (card numbers, bank details)
- Personal communications (mail content, chat messages, social media DMs)
- Location data
- Files on your computer outside of in-flight downloads
- Webcam, microphone, or any device sensor

The previously-existing OWA (Outlook Web Access) auto-scan feature was disabled in v0.1.23 and the code was fully removed in v0.2.x to remove any ambiguity around personal-communications data access.

---

## 5. Permission justifications

Chrome's permissions screen lists the permissions Windshock Lens requests. Here is exactly why each is used.

| Permission | Why |
|---|---|
| `<all_urls>` (host permission) | Phishing pages appear on arbitrary HTTPS hosts. The click-guard content script must run on all pages to block dangerous URI clicks (e.g., `applescript://` ClickFix attacks) before they execute |
| `tabs` | Open an inactive hidden tab to extract DOM content during a scan; intercept the active tab with a warning page on a confirmed phishing verdict |
| `scripting` | Inject only the extension's own bundled scripts (`content_extract.js`, `clipboard_hook.js`) into pages for extraction — no remote code, no eval |
| `storage` | Persist denylist hashes, allowlist hosts, language preference, and session caches (see §3) |
| `notifications` | Show a verdict notification when a scan completes (suppressed when the popup is open) |
| `offscreen` | Run Tesseract OCR (local WASM) and parse WHOIS HTML in an offscreen document, since service workers cannot use the DOM APIs OCR requires |
| `downloads` | Pause a download when it starts, scan the hosting page, then cancel + erase the partial file if the host is phishing — or resume if safe |
| `activeTab` | The popup's "Scan this page" button needs read access to the current tab |
| `bookmarks`, `history`, `topSites` | The O5 SAFE override treats hosts you already bookmark / visit / have in top sites as more trustworthy (read-only, never written, never transmitted) |
| `contextMenus` | The "Scan this link" right-click menu entry |

---

## 6. Third-party services contacted

As described in §2.2, the extension makes outbound requests to three public services:

- **yesnic.com** — WHOIS web form (HTML scrape for registrar / dates / name server)
- **rdap.org** — RDAP bootstrap (JSON registrant lookup)
- **crt.sh** — Certificate Transparency log (JSON certificate issuer lookup)

These services see only the bare domain name being looked up. They do not see your identity, your other browsing, or any page content. The extension does not store credentials with these services.

For OCR, the extension downloads page images by their URL (this request goes to the page's own origin, not to a third-party OCR service). All OCR processing is done locally by Tesseract WASM.

---

## 7. User control

- **Reset history** (popup) — clears `phishingDenylist`, `allowlistHosts`, all session caches
- **Clear history for this page** (popup or warning page) — removes a single host from denylist and clears its cached verdict
- **Allow this site for the session** (warning page) — adds host to `safeHosts` for 6 hours
- **Allow this site permanently** (warning page) — adds host to `allowlistHosts`
- **Language toggle** (popup) — switches UI between English and Korean

To remove all data: uninstall the extension. Chrome removes all `chrome.storage` entries owned by the extension when uninstalled.

---

## 8. Changes to this policy

This policy is versioned in the repository alongside the extension. Material changes will be noted in `RELEASE_NOTES.md` under the corresponding release. Check https://github.com/windshock/scamguard-ai/blob/main/docs/privacy.md for the current version.

---

## 9. Contact

Open a GitHub issue: https://github.com/windshock/scamguard-ai/issues
