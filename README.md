# Windshock Lens 🛡️

> Formerly *ScamGuard AI*. Renamed to Windshock Lens in v0.2.0 (2026-05-28). Historical releases up to v0.1.32 remain published under the previous name.

![Chrome Version](https://img.shields.io/badge/Chrome-138+-blue.svg)
![Gemini Nano](https://img.shields.io/badge/AI-Gemini%20Nano-purple.svg)
![Privacy](https://img.shields.io/badge/Privacy-On--Device%20LLM-success.svg)

**Private, on-device scam and phishing analysis for your browser.**

Windshock Lens is a Chrome MV3 extension that triages suspicious links and pages directly inside the browser using Chrome's built-in **Gemini Nano (Prompt API)** combined with deterministic security rules. Page content, URLs, and OCR text are processed entirely on-device — no external LLM API receives your browsing data.

> **Privacy boundary**: Phishing classification (LLM inference + OCR) runs locally. The extension may still load the target page in an inactive scan tab, fetch page images for OCR, and query public domain-ownership metadata (yesnic WHOIS / rdap.org / crt.sh). No browsing data is sent to a remote inference server.

---

## 🌐 Public Introduction

Read the bilingual public introduction page:

- GitHub Pages: https://windshock.github.io/lens/
- Source: [docs/index.html](docs/index.html)

## 🔒 Privacy Policy

See [docs/privacy.md](docs/privacy.md) for the full privacy policy — what data is processed, where it stays, what is transmitted, and detailed permission justifications.

---

## ✨ Features

- **On-device LLM**: Page content, URLs, and OCR text are processed only by the local Gemini Nano model. No external LLM API receives your browsing data. Domain-ownership metadata (WHOIS/RDAP/CT) is queried from public services to corroborate brand legitimacy.
- **Gemini Nano Integration**: Utilizes Google's on-device Prompt API for fast, reliable, and private phishing detection.
- **Real-Time Link Scanning**: Proactively checks clicked links and warns you before you navigate to a malicious site.
- **Smart Download Blocking**: Intercepts downloads hosted on known phishing domains.
- **On-the-fly OCR & DOM Analysis**: Uses local Tesseract OCR and advanced DOM parsing to inspect visual and structural threats in real-time.

---

## 📂 Project Structure

```text
lens/                             # repo renamed from scamguard-ai in v0.2.1
├── manifest.json              # Chrome MV3 Extension Manifest (Requires Chrome 138+)
├── background.js              # Service Worker: LLM session, triggers, download interception
├── content_extract.js         # Content Script: Extracts DOM/Forms/Links from hidden tabs
├── offscreen.html / .js       # Offscreen Docs: Runs Tesseract OCR & WHOIS parsing locally
├── popup.html / .js           # Extension Popup: Manual trigger & status monitoring
├── warning.html / .js         # Warning Page: Intercepts dangerous navigation
├── verdict.html / .js         # Detailed Verdict UI: Shows phishing score and AI signals
├── lib/                       # OCR Dependencies (User must place Tesseract files here)
├── eval/                      # Evaluation Suite: Automated tools to test detection rates
├── tools/                     # Helper Scripts: Extractor and Domain checking scripts
└── legacy/                    # Old Python-based (Selenium + Ollama) pipeline reference
```

---

## 🛠️ Installation & Setup (Developer Mode)

### Prerequisites
1. **Google Chrome Version 138** or higher.
2. Enable the **Gemini Nano On-Device Model**:
   - Navigate to `chrome://on-device-internals` in your browser.
   - Wait until the *Optimization Guide On Device Model* status shows as `Available` (It may download ~2GB of model data on first run).
3. **Tesseract OCR Files**: You need to place the local Tesseract binaries in the `lib/` folder. Please refer to `lib/README.md` for exact instructions.

### Load the Extension
1. Open Chrome and go to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the project directory.
4. Open the extension popup to verify the AI model is ready!

---

## ⚖️ Disclaimer

Windshock Lens is an open-source security tool that complements — not replaces — your existing browser safety measures (Chrome Safe Browsing, enterprise EDR, etc.). Phishing detection is a probabilistic problem; verdicts are estimates, false positives and false negatives both occur. Evaluate fit for your specific threat model before relying on it. Use at your own risk.
