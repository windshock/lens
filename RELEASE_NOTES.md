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
