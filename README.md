# ScamGuard AI 🛡️

![Chrome Version](https://img.shields.io/badge/Chrome-138+-blue.svg)
![Gemini Nano](https://img.shields.io/badge/AI-Gemini%20Nano-purple.svg)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20On--Device-success.svg)

ScamGuard AI is a highly private, **100% on-device** phishing and scam detection Chrome Extension. It leverages Chrome's built-in **Gemini Nano (Prompt API)** to analyze links, page context, and structure in real time—without ever sending your browsing data to an external server.

---

## 🌐 Public Introduction

Read the bilingual public introduction page:

- GitHub Pages: https://windshock.github.io/scamguard-ai/
- Source: [docs/index.html](docs/index.html)

---

## ✨ Features

- **Zero-Data Privacy**: All URL and link scanning happens locally on your device. Your browsing data is NEVER sent to an external server.
- **Gemini Nano Integration**: Utilizes Google's on-device Prompt API for fast, reliable, and private phishing detection.
- **Real-Time Link Scanning**: Proactively checks clicked links and warns you before you navigate to a malicious site.
- **Smart Download Blocking**: Intercepts downloads hosted on known phishing domains.
- **On-the-fly OCR & DOM Analysis**: Uses local Tesseract OCR and advanced DOM parsing to inspect visual and structural threats in real-time.
- **OWA Enterprise Support**: Automatically scans and places warning badges on suspicious external links within enterprise webmails.

---

## 📂 Project Structure

```text
scamguard-ai/
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
3. Click **Load unpacked** and select the `scamguard-ai` project directory.
4. Open the extension popup to verify the AI model is ready!

---

## ⚖️ License
This project is for experimental and proof-of-concept purposes. Use at your own risk.
