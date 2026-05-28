# Chrome Web Store Screenshot Capture Guide

Chrome Web Store accepts 1–5 screenshots in the listing detail page. Each must be **1280×800** (or 640×400 for legacy listings — 1280×800 is preferred).

This document describes the five recommended shots, what state to put the extension in for each, and where to find the matching UI in the codebase. Capture from the actual extension running in your Chrome (the runtime UI is the source of truth; mockups would be misleading).

---

## Tooling tip

macOS screenshot to a specific size:

```bash
# Capture an area (Cmd-Shift-4) then crop/resize:
sips -z 800 1280 ~/Desktop/shot.png    # height x width
# or use Preview's Tools → Adjust Size for an exact 1280×800 export
```

For Chrome's popup (which is small), capture the popup window plus surrounding context (the page behind, or a clean background). Chrome popups cannot be programmatically resized — capture as a focused window screenshot then composite onto a 1280×800 backdrop with the brand color (`#0b0f1a`) so it doesn't look cramped.

---

## Shot 1 — Popup: model ready, idle state

**What it shows:** The extension is installed and the on-device model is loaded. This is the first impression for users browsing the store.

**Setup:**
1. Open `popup.html` from the extension toolbar icon
2. The status row should read "On-device model ready" (English) or "온디바이스 모델 사용 가능" (Korean)
3. The "Scan this page" button should be enabled

**Files:** `popup.html`, `popup.js`

**Annotation suggestion (optional overlay text):** "Local Gemini Nano ready — no external server contacted"

---

## Shot 2 — Popup: scan in progress

**What it shows:** A scan is running. Demonstrates the staged progress indicator.

**Setup:**
1. Click "Scan this page" while on a real page (e.g., `https://github.com`)
2. Capture during the "Extracting…" or "OCR / WHOIS…" or "Model inference…" step
3. The progress text rotates through stages — pick any one

**Files:** `popup.js#startStageTicker`

**Annotation suggestion:** "Step-by-step progress — extraction → OCR → WHOIS → on-device LLM"

---

## Shot 3 — Popup: danger verdict

**What it shows:** A confirmed phishing verdict in the popup detail. Visceral demonstration of what the user sees when something bad is caught.

**Setup:**
1. Scan one of the known phishing URLs in `eval/fixture_manifest.json`, for example:
   `https://project-deepsk530291kx.pages.dev`
2. After the scan completes, the popup shows the verdict card: phishing=true, score, brand, reason
3. The "Details" link / verdict card should be visible

**Files:** `popup.js#renderVerdict`

**Annotation suggestion:** "Brand impersonation on free hosting — automatically blocked"

---

## Shot 4 — warning.html intercept

**What it shows:** The full-tab warning page that intercepts navigation to a phishing URL. This is the extension's strongest user-protection moment.

**Setup:**
1. Navigate directly (paste in address bar) to a known phishing URL — for example:
   `https://autumn-mud-2219.davis-drew1992.workers.dev`
2. The extension's navigation scanner fires, and on a danger verdict it swaps the tab to `warning.html`
3. The full red warning panel with verdict reason + "Back to safety" / "Continue anyway" buttons should be visible

**Files:** `warning.html`, `warning.js`, `warning.css`

**Annotation suggestion:** "Full-tab warning before you reach the page. One click to bail out."

---

## Shot 5 — verdict.html detail

**What it shows:** The verdict-detail page reached from a notification or the popup's "Details" link. Shows the gauge, signals, and reason in depth.

**Setup:**
1. From Shot 3, click the "Details" link in the popup
2. Or click the OS notification from a previous danger scan
3. The verdict.html page renders: conic-gradient gauge for phishing_score, signal cards (brand / suspicious_domain / phishing), reason text, "Allow for this session" button

**Files:** `verdict.html`, `verdict.js`

**Annotation suggestion:** "Why the page was flagged — signal-by-signal breakdown."

---

## Composition checklist

Before uploading, verify each shot:

- [ ] 1280×800 pixels exactly
- [ ] No personally identifying information (your real email, names in history sidebar, etc.) visible
- [ ] No internal company hostnames visible
- [ ] Phishing URLs are OK to show (they're in the open-source fixture manifest) but consider blurring the random-looking subdomain segment if you'd rather not publish it
- [ ] Chrome's UI chrome (address bar, tabs) is visible enough to make it obvious this is a Chrome extension
- [ ] Background contrast is good — the Windshock blue should pop

---

## Upload order

The store displays screenshots in the order uploaded. Recommended order:

1. **Shot 4 (warning.html intercept)** — strongest hook, leads with the "this saved me from a phish" story
2. **Shot 3 (popup danger verdict)** — concrete evidence of detection
3. **Shot 1 (popup ready)** — clean install state
4. **Shot 2 (scan progress)** — show the process
5. **Shot 5 (verdict detail)** — for the curious reader

The first 1–2 screenshots are the most impactful — store browsers may not scroll past them.

---

## Where to save

Convention: store the final screenshots in `docs/screenshots/` (gitignored by default). They are uploaded directly to the Chrome Web Store dashboard, not bundled with the extension package.

```bash
mkdir -p docs/screenshots
# 1280×800 final exports go here:
#   docs/screenshots/01-warning.png
#   docs/screenshots/02-popup-danger.png
#   docs/screenshots/03-popup-ready.png
#   docs/screenshots/04-popup-scanning.png
#   docs/screenshots/05-verdict-detail.png
```

Add to `.gitignore` if you want to keep them out of the repo (they may contain test phishing UI that's fine but bulky):

```
docs/screenshots/
```
