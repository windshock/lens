# Windshock Lens v0.2.6 Release Notes

This release focuses on false-positive reduction for legitimate developer install pages and Korean identity-verification flows, plus a click-guard usability fix for repeated warn-level confirmations.

## Developer install pages — `O9-first-party-install`

Official developer download pages can legitimately show commands like `curl -fsSL https://ollama.com/install.sh | sh`. Gemini Nano can score those as warn-level simply because they ask the user to paste a shell command into a terminal.

v0.2.6 adds a narrow deterministic cap instead of adding every developer tool to `OFFICIAL_DOMAINS`:

- the model brand token must match the current registered-domain label;
- the command must come from `pre/code`;
- the command URL must stay on the same registered domain;
- the target path must look like an installer script (`install.sh`, `setup`, `bootstrap`, etc.);
- the page must have install/download plus developer/OS context;
- clipboard shell payloads, obfuscation, captcha/verification lures, credential forms, dangerous URI schemes, auto-downloads, phishing-kit markers, and free/shared hosting all block the cap.

The new `ollama-official-install-safe` fixture uses `https://ollama.com/download` and expects `score <= 3`.

## Korean identity-verification flows — `O11` / `O12`

Normal Korean service flows often POST users from a first-party site to a third-party identity provider such as KCB ok-name / PASS. The old prompt could treat the cross-domain POST or final provider page as brand-domain mismatch evidence.

v0.2.6 separates those flows into provider context:

- `content_extract.js` records cross-domain form metadata only: action origin/path, source/target registered domains, method, field names, hidden field names, and query parameter names. It does not store field values.
- hidden-tab scans also capture main/sub-frame POST field names through `webRequest` so auto-submitted provider flows can still be classified after navigation.
- `CROSS_DOMAIN_FORMS` and `PROVIDER_PAGE_CONTEXT` prompt slices tell the model when the target is a recognized third-party identity provider.
- `O11-third-party-form-provider` caps known provider POST flows when endpoint/path and parameter signatures match and no hard evidence is present.
- `O12-third-party-provider-page` caps direct scans of recognized provider pages and prevents inherited source-brand mismatch.

The fixture set adds Howcare and KCB/PASS cases covering the first-party page, the PASS popup flow, and the provider page itself.

## Model score consistency — `O10-model-consistency`

Some verdicts returned `phishing=false` and `suspicious_domain=false` with a benign reason, but still produced a high score. When there is no hard evidence, v0.2.6 now caps those internally inconsistent safe verdicts to `score <= 3`.

## Click guard warn approval

Warn-level click-guard prompts (`score 4-6`) no longer ask on every social/copy/download click after the user confirms once.

The confirmation is stored only for the exact URL in `chrome.storage.session.clickGuardWarnApprovals` with a six-hour TTL. It is not promoted to host allowlist or `safeHosts`, and danger verdicts still block.

## Regression

The deterministic fixture suite was run by the maintainer and passed after these changes.

---

# Windshock Lens v0.2.5 Release Notes

This release continues the `ogog.kr` false-positive investigation from v0.2.4. Re-running the fixture set in **deterministic regression mode** (`bypassUserTrust: true`, which skips the O5 personal-trust signal) exposed several issues that the user's own bookmarks/history had been masking, plus a class of extraction noise that made normal pages look suspicious.

## 🔤 Korean brand names broke `OFFICIAL_DOMAINS` matching (NFC/NFD)

The biggest finding. With O5 bypassed, `ogog.kr` was still flagged `phishing=true, score 7–8` even though `ogog.kr` is registered directly under `OFFICIAL_DOMAINS["OK캐쉬백"]`.

Root cause: Gemini Nano emits Korean brand strings in **NFD (decomposed Hangul)**, while the source-code keys are **NFC (composed)**. `OFFICIAL_DOMAINS_LC.get("OK캐쉬백")` returns `null` when the lookup string is NFD — `.toLowerCase()` does not normalize Unicode. So `O1-safe` never fired and the LLM's raw score passed straight through. This is the same "direct object-key lookup of free-form LLM output is fragile" class as the v0.1.31 casing bug, now with a Unicode-normalization dimension.

Fix: `lookupOfficialDomains`, the `OFFICIAL_DOMAINS_LC` map keys, and `normalizeBrand` all `.normalize("NFC")` now. `normalizeBrand` makes `verdict.brand` canonical NFC so downstream consumers (O1-whois token comparison, display) stay consistent too. (FR-026 extended.)

## ☁️ Multi-tenant SaaS hosts no longer float to "warn" — `O8-saas`

`https://skpcorp-my.sharepoint.com/?source=waffle` scored 6 (warn). The brand resolved to "Microsoft", but `sharepoint.com` is not in Microsoft's curated official domains, so the host read as a brand-domain mismatch.

The naive fix — adding `sharepoint.com` to `OFFICIAL_DOMAINS["Microsoft"]` — is **explicitly forbidden by FR-029** (no global-safe registration of a multi-tenant platform). Instead, v0.2.5 implements the deterministic rule that FR-029 anticipated:

- `SHARED_SAAS_RE` matches multi-tenant collaboration platforms (`sharepoint.com`, `onedrive.live.com`, `dropbox.com`, `box.com`) at label boundaries (`evil-sharepoint.com.attacker.io` and `mysharepoint.com` do **not** match).
- `O8-saas` caps `score ≤ 3` **only when no hard evidence (O2/O3/O4/O7/D1) and no bait-redirect (O0)** are present.
- Unlike `O1-safe`, it does **not** assert brand ownership and is excluded from `DOMAIN_TRUST_RULES` — no session/persistent trust is cached, so each scan re-evaluates (FR-030: tenant content is mutable). A real credential-harvesting page on a SaaS tenant still elevates via hard evidence on top of the cap.

`GAP-006` is now partially resolved (the score-cap layer); document-internal external-link inspection and admin tenant policy remain follow-ups.

## 🏷 WHOIS Name Server / Contact as *auxiliary* ownership evidence — `O1-infra-corroboration`

`Registrant:` / `IssuerOrg:` are ownership evidence (`O1-whois`). But many WHOIS records expose only `Name Server:` and `Contact:` — e.g. `ogog.kr` shows `ns1.skplanet.com` and `domain_skp@skplanet.com`, both pointing at SK Planet infrastructure — which the old code ignored.

New rule `O1-infra-corroboration` parses NS hosts + contact-email domains (`extractInfraDomains`) and caps `score ≤ 3` **only when all four conditions hold**: (1) host is not free/shared-hosting, (2) no hard evidence, (3) the page text/title/anchors explicitly name an `OFFICIAL_DOMAINS` brand (parent company included, e.g. `SK플래닛`), and (4) that brand's official domain matches the NS/contact domain. It is a weak false-positive cap, not a danger override — hard evidence still wins, and it is kept out of `DOMAIN_TRUST_RULES`. (FR-034.)

## 🧹 Extraction quality: FORMS vs UI_CONTROLS, with accessible labels

The `ogog.kr` LLM input was 166 tokens of `<button type="button">` dummies — `content_extract.js` serialized every button's *attributes* but never its visible text or `aria-label`, so a normal page looked like a "button-heavy login/reward page".

- Controls now carry an accessible `label="…"` resolved in order: `aria-label` → `aria-labelledby` → `<label for>` → wrapping `<label>` → own text (buttons) → `title`/`placeholder`.
- `FORMS` is narrowed to real data-entry/submission surface: `form/input/textarea/select` plus credential/PII/submit buttons (label matches `CREDENTIAL_CTRL_RE`).
- General buttons with a label (nav/follow/category/etc.) move to a new low-signal `UI_CONTROLS` prompt slice (max 10, dropped first under token pressure).
- **Label-less button dummies are dropped entirely** so they no longer pollute the LLM input.

(FR-035.)

## 🧪 Regression infrastructure

- **Deterministic mode no longer poisons itself.** A scan ending `phishing=true, score ≥ 7` writes the host to the persistent denylist (`D1`). In regression that made the suite non-idempotent — a failing fixture stayed failed via `D1` regardless of code fixes. `finalizeVerdict` now skips denylist writes when `meta.bypassUserTrust` is set, and `eval/run_regression.js` calls `resetHistory` once at startup to clear prior poisoning. (FR-020/FR-033 extended.)
- `eval/run_regression.js` now sends `bypassUserTrust: true` alongside `bypassCache: true`.
- `popup.html?debug=true` exposes a "회귀테스트 실행" button that injects the runner and reports PASS/FAIL in the console.
- Fixtures: `skpcorp-my.sharepoint.com` `maxScore` tightened 5 → 3 (now that `O8-saas` caps deterministically); new `netflix-login-safe` fixture (a legitimate credential-form login page — `Netflix` added to `OFFICIAL_DOMAINS` so `O1-safe` caps it and the long `serverState` auth token isn't treated as a risk signal).

## Spec sync (SDD)

`docs/development-spec.md`: FR-016 priority list updated; FR-020/026/029/031/033 amended; new FR-034 (NS/Contact corroboration) and FR-035 (extraction quality); override table gains `O1-whois-transitive`, `O1-infra-corroboration`, `O8-saas` rows; §8.1 SaaS trust model documents the `O8-saas` implementation; GAP-006 marked partially resolved.

---

# Windshock Lens v0.2.4 Release Notes

## 🌐 Sibling-domain trust: transitive rule + OK Cashbag curation fix

A user reported a false positive on `https://ogog.kr/login?type=nosession` — the
extension flagged it as "Phishing suspected · 7/10 · OK캐쉬백" with self-contradictory
reasoning. The page is in fact the official OK Cashbag community service (오글오글) run
by SK Planet, with WHOIS registrant "에스케이플래닛(주)".

Root cause analysis surfaced two layered problems:

1. **Curation gap.** `OFFICIAL_DOMAINS["OKCashbag"]` only listed `okcashbag.com`.
   The brand had no Korean aliases and no related domains, so the LLM-proposed brand
   "OK캐쉬백" did not resolve to any anchor; `O1` then fired as brand-domain mismatch.
2. **Scaling problem behind it.** Even if a maintainer adds `ogog.kr` today, the same
   class of false positive will return for the next sibling domain. Hand-curating
   every "brand × related domain × locale alias" cell does not scale.

### Two fixes, in order of impact

**(a) Immediate curation fix (manual but bounded).** Aliases and the sibling
domain for OK Cashbag are added to `OFFICIAL_DOMAINS` in `background.js`:

```
"OKCashbag"      / "OK Cashbag"  → okcashbag.com, ogog.kr
"OK캐쉬백" / "오케이캐쉬백" / "오글오글"  → same
```

The brand aliases cover both English and Hangul variants of the LLM's likely brand
output. With these entries, `ogog.kr` matches `OFFICIAL_DOMAINS[brand]` directly and
goes through the existing `O1-safe` cap.

**(b) New deterministic override: `O1-whois-transitive`.** For future cases that we
have not yet seen and curated, the extension now performs a runtime cross-check:

1. If `OFFICIAL_DOMAINS[brand]` resolves to one or more anchor domains,
2. Fetch RDAP for each anchor (via the existing `fetchRdap` and its session cache),
3. Normalize both the visited host's WHOIS registrant and the anchor's RDAP registrant
   (lowercase + strip corporate suffixes like `Co./Ltd./Inc./LLC/GmbH/(주)/주식회사`,
   keep Hangul and alphanumerics),
4. If the normalized registrants match, treat the visited host as a sibling and cap
   `phishing_score` at 3, mark `phishing=false`, suppress the model's reasoning.

Hard evidence (`O2` clipboard shell, `O3` auto-download, `O4` dangerous URI scheme,
`O7` phishing-kit markers, `D1` denylist) still runs *after* this rule and can
re-flag the page on real malicious behavior. Free-hosting hosts (`workers.dev`,
`pages.dev`, `vercel.app`, etc.) are excluded — the platform vendor's registrant
would otherwise transitively trust arbitrary tenant content. Same guard as `O1-whois`
since v0.1.31.

### Honest scope: when (b) actually helps

The transitive rule is not a silver bullet. It works only when *both* sides expose a
usable registrant string:

| Side | Common case | Result |
|---|---|---|
| Visited `.kr` host | yesnic WHOIS exposes 등록인 + Registrant | usable |
| Visited `.com` host | RDAP via rdap.org / Verisign | **redacted under GDPR** for most retail .com domains |
| Anchor `.com` (most major brands) | RDAP | redacted |
| Anchor with corporate RDAP (Microsoft, Apple, MarkMonitor-managed) | RDAP | usable |

For the specific `ogog.kr` ↔ `okcashbag.com` pair the anchor's RDAP returns only
`Registrar: Gabia, Inc.` — `okcashbag.com` is Verisign-redacted and gives no
Registrant field. The transitive rule therefore *cannot* solve this particular case
on its own, which is why the manual curation in (a) is still required.

Cases where (b) will help without further curation:
- Sibling pairs where both sides are `.kr` / `.co.kr` (yesnic exposes 등록인 + Registrant).
- Pairs where the anchor's RDAP is served by an enterprise registrar like MarkMonitor
  (Microsoft, Apple, large financial institutions). These commonly retain Registrant
  org.
- Pairs where Certificate Transparency `IssuerOrg` is a corporate CA (rare but
  decisive when present).

For Verisign-redacted .com anchors with regional sibling domains the rule will
silently no-op, and a maintainer must still add the sibling to `OFFICIAL_DOMAINS`.

### Spec

`docs/development-spec.md` adds **FR-032**: anchor-only curation policy with runtime
WHOIS-registrant transitivity. The acceptance criterion explicitly notes the
GDPR-redaction limitation.

### Fixture

`eval/fixture_manifest.json` adds `ogog-kr-okcashbag-sibling`. It validates the
end-to-end behavior: the brand aliases let `O1-safe` cap the score, the model's
"login page is common in phishing" reasoning gets suppressed, and the final verdict
is `score ≤ 3`, `phishing=false`. Hard evidence overrides remain wired up; the same
URL with an injected clipboard shell payload should still flag danger.

### Lesson the rule bakes in

The original instinct ("add ogog.kr because web search says SK Planet operates it")
is exactly the failure mode that produced this false positive — making identity
decisions from secondary signals. The new rule encodes the safer pattern
mechanically when the evidence is available: cross-check two independent ownership
signals (visited host's WHOIS, anchor's RDAP) before granting identity trust.
Manual curation still happens for cases the transitive rule cannot reach, but the
curation now sits behind a falsifiable evidence requirement.

---

# Windshock Lens v0.2.3 Release Notes

## 🌐 Compatibility check page is now bilingual (EN / KO)

The v0.2.2 `compat-check.html` shipped Korean-only by mistake — every other UI surface (`popup.html`, `warning.html`, `verdict.html`) follows the project's "English default + Korean toggle" rule from FR-022, and the new page didn't. v0.2.3 brings it in line.

- All static text moved into `data-i18n` attributes that `applyI18nDom()` populates from `i18n.js`.
- All dynamic strings emitted by the probes (`addCheck`, `setVerdict`, `nextSteps`, the download progress messages) now store i18n keys + args and translate at render time. Switching language re-renders without restarting probes.
- A new `compat.*` key namespace in `i18n.js` covers every visible string in both English and Korean.
- A standard `EN | 한국어` toggle is added at the top of the page, matching the popup pattern. The current selection persists via `chrome.storage.local.lang` like the rest of the extension.
- The page now defaults to English (matching the rest of the project).

`docs/` mirrors `i18n.js` and the updated `compat-check.html` / `compat-check.js` so the GitHub Pages copy at `https://windshock.github.io/lens/compat-check.html` behaves the same.

## 🖼 Icon generation no longer throws on startup

The service worker logged this on every install and cold start:

```
icon generation failed: Error: The imageData property must contain an ImageData object
  or dictionary of ImageData objects.
    at regenerateIcons (background.js:1693:27)
```

### What broke
`regenerateIcons` asked `offscreen.js` to render `ImageData` for the action icon via `OffscreenCanvas` and shipped it back through `chrome.runtime.sendMessage`. Structured cloning across that message boundary downgrades the `ImageData` instance to a plain `{data, width, height}` object; `chrome.action.setIcon({imageData})` then refuses it. The catch block swallowed the throw, but the same throw also short-circuited the second half of the function that was supposed to write `notifIcons` data URLs into `chrome.storage.local`. So notification icons silently fell back to the 1×1 transparent PNG `FALLBACK_NOTIF_ICON`.

### Why it doesn't need to be fixed in place
v0.2.1 added static PNG icons under `icons/` and wired them into `manifest.json` (`action.default_icon` + top-level `icons`). The action toolbar icon has been served from those statics since v0.2.1 — the runtime regeneration was redundant for that surface. Notification icons were the only consumer of the dynamic path, and `icons/notif-{ok,warn,danger}-128.png` are likewise bundled.

### Fix
- `notify()` now reads notification icons directly via `chrome.runtime.getURL("icons/notif-{severity}-128.png")` instead of looking them up in `chrome.storage.local.notifIcons`.
- `regenerateIcons()` is removed entirely; the `chrome.runtime.onInstalled` and `chrome.runtime.onStartup` listeners no longer call it.
- `offscreen.js#GENERATE_ICONS` handler is left in place for backward compatibility but is no longer invoked by the service worker.
- `chrome.storage.local.notifIcons` is no longer written or read. Existing installations keep whatever stale value they have; it costs no read or write going forward.

### Spec sync (SDD)
- `docs/development-spec.md` Section 5.2 marks `GENERATE_ICONS` as legacy/unused with a note on what replaced it.
- Section 9 marks `notifIcons` as legacy/unused with the same rationale.
- `docs/privacy.md` storage table drops the `notifIcons` row since it is no longer written.

---

# Windshock Lens v0.2.2 Release Notes

## 🩺 Built-in AI compatibility check page

Some team members reported the extension showing "On-device model unavailable" without any further hint about what hardware/software requirement was missing. `chrome://on-device-internals` gives the truth but isn't friendly for a non-technical teammate.

### New diagnostic page
A self-contained HTML page at `compat-check.html` (also published at `https://windshock.github.io/lens/compat-check.html`) runs a battery of probes the moment it loads and explains the result in plain language. It checks:

- `LanguageModel.availability()` — the authoritative status from Chrome.
- Chrome major version (≥ 138) via `navigator.userAgentData.getHighEntropyValues()`.
- OS family + version (Windows / macOS 13+ / Linux / ChromeOS), and mobile detection.
- `navigator.hardwareConcurrency` (≥ 4) and `navigator.deviceMemory` (≥ 8 GB, with a note about Chrome's privacy clamp at 8 for any 16 GB+ machine).
- `navigator.connection.saveData` (must be off; Data Saver blocks the model download).
- Heuristics that **cannot** be measured directly from a web page: GPU VRAM (WebGPU adapter info exposes vendor/architecture but not VRAM, so an integrated GPU is flagged as a *probable* failure) and disk space (only the origin's storage quota is visible, not real disk free space).

If the result is `"downloadable"`, the page exposes a button that calls `LanguageModel.create()` with a `downloadprogress` monitor, so a teammate can kick off the download from the same page rather than having to find a separate trigger.

If the result is `"unavailable"` and *no* deterministic check failed, the page lists the things a web page genuinely cannot probe — enterprise policies (`GenAILocalFoundationalModelSettings`, `OptimizationGuideOnDeviceModelEnabled`), actual disk free space, real VRAM — with the exact `chrome://` URLs to check.

The page emits no network traffic. A "Raw data (for support)" block at the bottom dumps the collected signals so a teammate can copy-paste them when reporting an issue.

### Popup integration
The popup now shows a "Why is the model unavailable? (run diagnostic)" link directly beneath the status row whenever availability is `unavailable`, or when `downloadable`/`downloading` reports an error. The link opens the diagnostic page in a new tab via `chrome.runtime.getURL("compat-check.html")`, so it works offline once the extension is installed.

`compat-check.html` is added to `web_accessible_resources` in `manifest.json`. The same file is also mirrored to `docs/compat-check.html` so the GitHub Pages site can serve it without requiring users to install the extension first. The page's logic lives in `compat-check.js` (loaded via external `<script src>`) — extension pages enforce a strict Content Security Policy that disallows inline scripts, and using an external file is the supported path. The diagnostic page makes no network requests and stays self-contained.

---

# Windshock Lens v0.2.1 Release Notes

Store-readiness release. No detection logic changes from v0.2.0. Everything in this release prepares the extension for Chrome Web Store submission and renames the GitHub repository to match the product brand.

## 📦 Repository renamed: `scamguard-ai` → `lens`

The GitHub repository is now `windshock/lens`. GitHub Pages URL is now `https://windshock.github.io/lens/`. Old URLs auto-redirect for the foreseeable future, but contributors should update their git remote:

```
git remote set-url origin https://github.com/windshock/lens.git
```

Documentation files (README, docs/index.html, docs/main.js, docs/privacy.md, docs/store-listing.md, CLAUDE.md, lib/README.md) had their hardcoded `github.com/windshock/scamguard-ai` and `windshock.github.io/scamguard-ai/` URLs flipped. Historical sections of `RELEASE_NOTES.md` and `INTERNAL_REPORT.md` were left intact because they document the project as it existed at the time of writing. The `scamguard-intro-lang` localStorage key in `docs/main.js` is preserved so visitor language preference survives.

The local working-tree directory name (`scamguard-ai/` on the maintainer's machine) is independent of the repo name and is the maintainer's choice to rename.

## 🗂 OWA dead code removed

`owa_scan.js` and `owa_banner.css` — dead since v0.1.23 — were deleted from the working tree. Git history (pre-v0.2.1) preserves them. Rationale: Chrome Web Store reviewers may pattern-match the OWA mail-content scanning code and classify the extension as touching the Personal Communications data category, triggering heavier review. Removing the files eliminates this ambiguity.

## 🔒 Privacy Policy

`docs/privacy.md` is a new full privacy policy enumerating exactly what data is processed locally, what is transmitted, what is stored, and per-permission justifications. Linked from the README; will be referenced from the Chrome Web Store listing.

## 🖼 Static icon assets + visual identity

- `tools/generate_icons.py` — PIL-based one-shot renderer for action and notification icons. Glyphs are drawn geometrically (polylines / ellipses) instead of using Unicode characters, so they render consistently regardless of the host font's coverage. Previous Unicode-based version produced empty shields on systems whose default font lacked U+2713/U+2715.
- `tools/generate_promo.py` — generates the Chrome Web Store promotional tiles (`icons/promo-440x280.png` always, `icons/promo-1400x560.png` marquee with `--marquee`).
- `manifest.json#action.default_icon` and `manifest.json#icons` now reference the static PNGs. The runtime `offscreen.js#generateIcons` stays as a defensive fallback.

## 📝 Store listing and submission prep

- `docs/store-listing.md` — full Chrome Web Store dashboard copy (English + Korean): item name, short description, detailed description, single-purpose statement, per-permission justifications, data usage disclosures, submission checklist.
- `docs/screenshots-guide.md` — describes the five recommended screenshots, where to capture each from inside the extension UI, and a recommended upload order. Maintainer captures these manually since they must show real running UI.
- `tools/build_dist.sh` — produces a clean upload zip at `dist/windshock-lens-v<VERSION>.zip` containing only the files the extension runtime actually needs. Excludes docs, tools, eval, legacy, and git metadata.

## 🎯 Tone shift

The README disclaimer moved away from "experimental / proof-of-concept" language toward production-ready framing while keeping an honest FP/FN acknowledgement and "use at your own risk" line.

---

# Windshock Lens v0.2.0 Release Notes

This release renames the extension from **ScamGuard AI** to **Windshock Lens**. No detection logic, runtime behavior, or storage format changes — only product naming and surrounding documentation.

## 🪧 Why the rename

Preliminary trademark and brand collision screening flagged two issues with the original name:

- "ScamGuard / Scam Guard" is heavily collided in the market — Malwarebytes ships a feature called *Scam Guard*, plus `scamguard.com`, `scamguardai.org`, and a now-cancelled USPTO mark (`SCAMGUARD`) leave market traces that make Chrome Web Store reviewers likely to question the name.
- An earlier candidate ("Heka") would have required a fresh trademark and brand build with no existing reputation backing.

**Windshock Lens** ties the extension to the maintainer's existing security-researcher identity (`windshock.github.io` / GitHub / HackerOne), which gives Chrome Web Store publisher↔product naming consistency and reduces review friction. The `Lens` suffix keeps the function ("inspect a page before clicking") readable.

- Product: **Windshock Lens**
- Tagline: **Private, on-device scam and phishing analysis for your browser.**
- Store title: **Windshock Lens — Scam & Phishing Triage**

## ✂️ What changed

User-facing:

- `manifest.json#name` → `"Windshock Lens"`, English store-listing description
- `README.md` — full brand refresh, historical-rename note at top, repo URLs left intact
- `docs/index.html`, `docs/main.js` (GitHub Pages bilingual intro) — 26 display-name occurrences flipped, localStorage key preserved so visitor language preference survives

Developer-facing:

- `CLAUDE.md`, `docs/development-spec.md`, `security-architecture-review.md`, `security-product-requirements.md` — titles and body references updated
- `eval/spof_sw_helpers.js` — comment referencing the `chrome://extensions` card
- `INTERNAL_REPORT.md` — prepended a historical-snapshot box. Body content (dated 2026-05-18, v0.1.28 era) preserved verbatim.

## 🧱 What was deliberately not changed

- **Repository directory name `scamguard-ai`** — repo rename is a separate decision and would invalidate every existing GitHub URL. Internal references like `cd /path/to/scamguard-ai` in `lib/README.md` stay correct.
- **Historical `RELEASE_NOTES.md` sections (v0.1.32 and earlier)** — past releases shipped under "ScamGuard AI" and the release notes are an accurate historical record.
- **localStorage key `scamguard-intro-lang`** in `docs/main.js` — preserved to keep visitor language preference across the rename.
- **Detection logic, override rules, schema, storage format, manifest permissions** — zero behavioral change. Same code as v0.1.32 with a different name.

## ⏭ What comes next

Tracked in #6 (Chrome Web Store submission readiness):

- Static PNG icons + visual identity work (the runtime-generated shield needs to become uploaded image assets for store listing)
- Privacy policy document
- Removal of `owa_scan.js` / `owa_banner.css` (currently dead code that may concern store reviewers)
- README tone shift away from "experimental / proof-of-concept" framing
- Final trademark clearance for `WINDSHOCK` (classes 9 + 42)

---

# ScamGuard AI v0.1.32 Release Notes

This release closes three regressions discovered while validating v0.1.31 against the known phishing corpus, and adds a structural guard against a silent false-negative class in the `O1-whois` ownership override.

## 🛡 O1-whois no longer false-safes shared-hosting brand impersonation

The v0.1.31 fix restricted `O1-whois` matching to `Registrant:` and `IssuerOrg:` segments — independent ownership evidence. That was correct as far as it went. But on shared cloud platforms (`*.azurewebsites.net`, `*.appspot.com`, `*.amazonaws.com`, `*.firebaseapp.com`, etc.), the registered domain belongs to the platform operator, not to the tenant serving the page. RDAP for `azurewebsites.net` returns `Registrant: Microsoft Corporation` — true for the platform, but every Azure tenant inherits this. A phishing page impersonating Microsoft on Azure-hosted infrastructure would trip `O1-whois` and be marked safe.

### Fix

`O1-whois` now bails out when either the original URL or the final URL matches `FREE_HOSTING_RE`. The existing `O1` brand-mismatch branch then runs as designed, producing a danger verdict for the same shared-hosting plus brand-mismatch pattern.

### What this does and does not change

For domains we observed in regression (workers.dev, pages.dev, firebaseapp.com), platform RDAP is currently either redacted (Google's MarkMonitor privacy) or the impersonated brand doesn't substring-match the platform owner (Cloudflare is rarely the impersonation target). The guard does not alter verdicts for those cases. It does close the silent-FN class for `azurewebsites.net` / `appspot.com` / `amazonaws.com` impersonation when the platform's own RDAP is public and the impersonated brand shares a token with the platform owner.

Legitimate Microsoft/Google/Amazon content that happens to live on their own shared-hosting subdomain loses the `O1-whois` short-circuit. In practice those organisations serve user-facing content from their own registered domains, so this loss case is rare.

## 🔁 Single-flight awaiter now re-dispatches when source differs from leader

`scanUrl`'s single-flight map collapses concurrent calls for the same URL onto a single LM run. v0.1.31 only invoked `dispatchResult` once per scan, using the **leader's** source. Side effects that live inside `dispatchResult` — `warning.html` tab interception for `navigation`, OWA per-anchor badge injection, deterministic notifications for `contextMenu` / `action` — were silently dropped for any later awaiter whose source differed from the leader's.

Concrete race: popup is leader (it suppresses notification by design), navigation arrives second as awaiter and never triggers its tab intercept — the user remains on the phishing page.

### Fix

A new `AWAITER_DISPATCH_SOURCES = {"navigation", "owa", "contextMenu", "action"}` set restricts awaiter re-dispatch to sources whose effect lives inside `dispatchResult`. `popup` / `click-guard` / `download-silent-ok` / `eval` / `fixture` are explicitly excluded — those sources consume the return value directly, and re-dispatch would only duplicate notifications. Awaiter dispatch passes `meta.dedupAwaiter: true` for traceability.

## 🔡 `OFFICIAL_DOMAINS` lookup is now case-insensitive

The LM does not return brand strings with consistent casing — `"Claude"` one call, `"deepseek ai"` another, `"Microsoft Corporation"` a third. `OFFICIAL_DOMAINS` keys are CamelCase, so `OFFICIAL_DOMAINS[verdict.brand]` silently missed for lowercase outputs, which made `O1`'s entire brand-mismatch branch skip and the LM's `phishing=false` verdict pass through. A known DeepSeek phishing URL on `pages.dev` was a confirmed false-negative.

### Fix

New `lookupOfficialDomains(brand)` helper normalises to lowercase, strips a trailing `" AI"` suffix, and tries first-word fallback. Module-scope `OFFICIAL_DOMAINS_LC` is built once from `OFFICIAL_DOMAINS` so each lookup is O(1).

## 🛟 `notify()` failure no longer destroys the verdict

SPOF testing with all SW `fetch` calls stubbed revealed that `chrome.notifications.create` internally fetches the `iconUrl` (a data URL stored in `chrome.storage.local`), and that fetch failing surfaces as an exception out of `notify()`. Previously the exception propagated through `dispatchResult` → `finalizeVerdict` and turned a successful scan into `{ error: "Unable to download all specified images." }` returned to the caller.

### Fix

`dispatchResult` wraps the final `notify()` call in `try/catch` and logs a warning instead. The verdict object continues to flow back through the promise chain.

## 🧪 Reusable test runners

Three paste-runnable files now live under `eval/`:

- `eval/run_regression.js` — loads `eval/fixture_manifest.json` (now 13 cases including `nate.com` / `naver.com` / `github.com` / `microsoft.com` safe baselines plus three known phishing URLs) and reports PASS/FAIL per fixture from the popup console.
- `eval/run_spof.js` — defines `__spof_TNX` / `__spof_TIP` / `__spof_TALLDOWN` / `__spof_TSLOW` to exercise DNS-failure, IP-only, all-fetch-blocked, and slow-loading failure modes.
- `eval/spof_sw_helpers.js` — Service Worker console helper exposing `__spof.blockAllFetch()` / `__spof.restore()` for the T-ALL-DOWN scenario.

All three are loaded via `<script>` injection rather than `fetch().then(eval)` so they work under the extension page's `script-src 'self'` CSP. The Service Worker helper is paste-only since the SW context has no `document`.

## 📐 Internal-domain policy made explicit

The v0.1.29 "skip extract/OCR/LLM entirely for internal domains" change made `127.0.0.1` short-circuit before `hardEvidencePrecheck` could see any content. The two legacy `localhost-danger-fixture` / `localhost-hard-evidence-fixture` entries in `eval/fixture_manifest.json` were expecting the pre-v0.1.29 behaviour and were silently failing the fixture pass. They have been updated to `expectedPhishing: false, maxScore: 0` with a note documenting the policy decision (internal domains are unconditionally trusted; if this policy is ever revised the fixtures must move first).

## 📜 Spec-driven development docs landed

This repository now carries three living spec documents — `docs/development-spec.md`, `security-architecture-review.md`, `security-product-requirements.md` — that capture functional requirements, the DFD/trust-boundary model, and a priority-tagged security backlog (SPR-001 through SPR-010). The README's "Zero-Data" wording was refined to distinguish "no external LLM receives browsing data" from "outbound WHOIS/RDAP/CT lookups and OCR image fetches do happen". OWA Enterprise Support is marked as disabled-in-current-manifest to match `manifest.json`'s actual `content_scripts` list.

---

# ScamGuard AI v0.1.31 Release Notes

## ⏱ Popup no longer hangs for 30–50 seconds on the same URL

A user reported clicking the toolbar popup's "Scan this page" on `fmkorea.com` and seeing the "Scanning…" ticker spin for 50+ seconds before any verdict appeared. The popup stayed open the whole time — it wasn't blur-closing — so a 30-second sendMessage timeout alone wouldn't have helped.

### Root cause
Up to three independent triggers fire for the same URL on a typical content page:

1. `chrome.tabs.onUpdated` (status=complete) — the navigation scan.
2. `click_guard.js`'s `schedulePrefetch()` — when the page has `pagePotentiallyNeedsScan()` indicators (Copy buttons, download links, etc.).
3. The user clicking "Scan this page" in the popup.

Each one calls `scanUrl(url, ...)`. None of them shared work with the others, and all three missed the session cache because none had written the verdict yet. The single Gemini Nano session serializes `prompt()` calls, so three parallel scans queued behind a single LM session became three sequential ~10–15s LM runs — totalling 30–50+ seconds before the popup's `await sendMessage` resolved.

### Fix
A module-scope `Map` (`inflightScans`) now dedupes by cache key. The first caller starts the scan; subsequent callers for the same URL await the same promise and get the same verdict. The entry is removed in `.finally()`. Each source's `dispatchResult` branch still runs (per the first call's `source`), and the popup awaits the shared promise, so a popup click that races a background prefetch now returns in roughly one LM call's worth of time instead of three.

The `bypassCache` path (used by `eval/eval_harness.py`) opts out of dedup so evaluation cycles still measure full scans.

## 🛡 O1-whois override no longer triggers on hallucinated short brand tokens

In the same incident the user pasted a verdict reason that read `WHOIS/RDAP/CT matched brand 'Aagag' — official domain assumed`. "Aagag" was an LLM hallucination, but its 5-character token happened to substring-match somewhere in the assembled WHOIS string (likely inside `Name Server:` or `Domain Name:`), and `applyOverrides`'s `O1-whois` rule promoted the verdict to "safe" on the strength of that match.

### Why the original matching was too loose
The yesnic+RDAP+CT result is joined as a single ` | `-separated string. The previous check did `whois.toLowerCase().includes(token)` against the whole string, so any 4+ char brand token that incidentally appeared inside `Domain Name:`, `Name Server:`, or `Contact:` — fields that trivially echo the domain itself — would satisfy the rule. This made the safe override circular: an LLM-claimed brand was "verified" against the very domain the LLM was inspecting.

### Fix
Brand-token matching is now restricted to RDAP `Registrant:` and CT log `IssuerOrg:` segments — the two labels that actually represent independent ownership evidence. yesnic's `Domain Name:` / `Name Server:` / `Contact:` no longer count. The override still fires for legitimate cases like `microsoftonline.com` (RDAP via MarkMonitor exposes `Registrant: Microsoft Corporation`) but no longer fires when only yesnic data is present and the brand is short and coincidentally substring-matches.

## 🔕 Popup source no longer emits a duplicate OS notification

When `dispatchResult` was reached with `source === "popup"`, `notify()` would fire a Chrome OS notification in addition to the popup rendering its own verdict UI. Two issues:

- The information was duplicated — the popup already displays the verdict.
- On macOS, a notification appearing in the corner can briefly steal focus and blur-close the popup, which kills the awaited `sendMessage` and can leave the UI in an inconsistent state.

`dispatchResult` now returns early for `source === "popup"`. Notifications still fire for `contextMenu`, `download`, `owa`, and (for danger only) `navigation`.

## 🩹 Popup safety timeout

As a defensive net independent of the single-flight fix, the popup's `await chrome.runtime.sendMessage(...)` is now wrapped in `Promise.race` against a 60-second timeout. If the SW ever fails to respond — LM session hang, offscreen worker death, unforeseen edge cases — the popup will display the error rather than spinning indefinitely. Error messages are HTML-escaped before rendering.

## 🧹 Minor cleanups

- Removed unused module-scope regex constants (`DANGEROUS_URI_RE`, `EXEC_EXT_RE`) and the now-unreachable `hasInternalBypassRisk()` function. These were leftovers from the v0.1.29 hard-evidence precheck and v0.1.30 internal-domain short-circuit refactors. The same regexes still live and work inside `click_guard.js` for in-page click classification.
- Added a JSDoc `@returns {Promise<any>}` to `sendToOffscreen()` so TypeScript no longer infers a single response shape across messages that genuinely return different shapes (OCR → string, OCR_DIAGNOSTICS → object, GENERATE_ICONS → icons map).
- Corrected the diagnostics handler's `ocrInfo` fallback shape (`{available, languages}`) to match what `offscreen.js#checkOcrAvailability()` actually returns.

---

# ScamGuard AI v0.1.30 Release Notes

## 🔕 Internal domains and private IPs now fully skip the scan

Two user reports surfaced the same root cause:

1. Private-IP hosts (e.g. `http://172.29.247.33:8080/`) and intranet hostnames whose registered domain is in `INTERNAL_DOMAINS` (e.g. `wiki.skplanet.com`) were still going through `extractFromUrl`, which opens a `chrome.tabs.create({ active: false })` hidden tab. The tab is *not active*, but it flashes in the tab bar for the duration of the extraction — users perceive that as "the extension is scanning my intranet page."
2. The `isInternalDomain` short-circuit lived *after* the extraction, so the safe verdict was only emitted once DOM extraction (and possibly OCR / WHOIS) had already started.

### Fix
The `internalDomain` short-circuit is now evaluated **immediately after the allowlist / cache / safeDomains / denylist checks, before any extraction is attempted**. When `isInternalDomain(url)` returns true (RFC1918 / 127/8 / 169.254/16 / IPv6 ULA / link-local / loopback / hostname in `INTERNAL_DOMAINS`):

- No hidden tab is created — the tab bar no longer flashes.
- No OCR, no WHOIS, no RDAP, no CT lookup, no Gemini Nano call.
- An immediate "trusted internal domain — model call skipped" verdict is cached and dispatched.

### Trade-off
The previous `hasInternalBypassRisk` check (clipboard shell payload / auto-download / dangerous URI on an internal page) is no longer executed for internal hosts. The function definition is kept in source for future re-enablement, but on the current default policy internal hosts are simply trusted. If an intranet page itself ever becomes a credential-harvesting risk that decision will need to be revisited.

---

# ScamGuard AI v0.1.29 Release Notes

## Hard-evidence precheck before Gemini Nano

This release moves direct behavioral evidence ahead of the LLM path. After page extraction, `hardEvidencePrecheck()` can now return a deterministic phishing verdict without creating a Gemini Nano session when the page contains strong evidence:

- shell execution payloads written to the clipboard
- auto-download attempts observed during hidden-tab scanning
- high-risk URI schemes such as `ms-msdt:`, `applescript:`, `shell:`, or `vbscript:`
- phishing-kit markers combined with credential-like forms

### Expanded kit markers

`content_extract.js` now records Telegram, Discord, and webhook.site exfiltration markers in `behaviors.phishingKitMarkers`. These markers are only elevated as hard evidence when combined with credential-like form evidence.

### Safer trust and exposure defaults

- `safeDomains` session trust has been replaced by exact-host `safeHosts` entries with a six-hour TTL and a shared-hosting guard.
- `web_accessible_resources` is reduced to the tab-facing warning/verdict UI files only; OCR assets, offscreen documents, and injected scripts are no longer exposed to arbitrary web origins.
- The prompt now includes `phishingKitMarkers` in the BEHAVIORS section when the LLM path is still needed.
- `docs/network-observation.md` defines the privacy boundary for any future endpoint-only network hook.

### Regression fixture

Added `eval/hard_evidence_fixture.html` and included it in both fixture manifests to cover the hard-evidence path without relying on external phishing URLs.

---

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
