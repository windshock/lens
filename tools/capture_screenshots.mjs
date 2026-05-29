#!/usr/bin/env node
/**
 * Chrome Web Store screenshot 자동 캡처.
 *
 * 출력: screenshots/<name>.png — 1280×800.
 *
 * 5장:
 *   1. warning.html intercept — danger verdict 가로채기
 *   2. popup.html (danger verdict)
 *   3. popup.html (model ready)
 *   4. popup.html (mid-scan ticker)
 *   5. verdict.html detail
 *
 * 사용법:
 *   cd /Users/1004276/Downloads/scamguard-ai
 *   (cd tools && npm install)        # 첫 1회만
 *   node tools/capture_screenshots.mjs
 *
 * 옵션 환경변수:
 *   LANG_OVERRIDE=ko   한국어 토글로 캡처
 *   VISIBLE=1          headless 대신 visible 모드
 *
 * 구현 메모:
 *   - puppeteer 의 --load-extension 은 새 headless 모드에서 안정적으로 작동하지
 *     않음 (Chromium 145 기준). 그래서 확장 로드는 하지 않고, HTML 파일들을 file://
 *     로 직접 열어 chrome.* API shim 을 evaluateOnNewDocument 로 주입한다.
 *     screenshot 용도라 실제 확장 동작은 필요 없고 (실제 SW/LM 호출도 안 함),
 *     popup/warning/verdict 페이지가 자기 렌더에 필요한 API 만 mock 되면 충분.
 *   - mock state (storage 내용, tab.url, 등) 은 SHIM_TEMPLATE 에 변수로 박혀 페이지
 *     로드 전 window 에 미리 세팅됨.
 */

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LANG = process.env.LANG_OVERRIDE || "en";
// 같은 파일명을 EN/KO 가 덮어쓰지 않도록 언어별 서브폴더로 분리.
const OUT = path.join(ROOT, "screenshots", LANG);
const HEADLESS = process.env.VISIBLE === "1" ? false : "new";

const VIEWPORT = { width: 1280, height: 800 };

const MOCK_DANGER_URL = "https://microsft-365-signin.workers.dev/login";
const MOCK_SAFE_URL   = "https://www.example.com/";

const DANGER_VERDICT = {
  phishing_score: 9,
  brand: "Microsoft",
  phishing: true,
  suspicious_domain: true,
  reason: "[Auto override: O1] Brand-domain mismatch — 'Microsoft' official domain is microsoft.com but page is microsft-365-signin.workers.dev. Credential form detected.",
  url: MOCK_DANGER_URL,
  ts: Date.now()
};

// 페이지 로드 전 window 에 박히는 chrome.* shim.
// session/local storage 는 메모리 dict. runtime.sendMessage 는 type 별 mock 응답.
function buildShim({ lang, localStore, sessionStore, tabUrl, verdictForGetVerdict }) {
  return `
(function() {
  const _local = ${JSON.stringify({ lang, ...localStore })};
  const _session = ${JSON.stringify(sessionStore)};
  const tabUrl = ${JSON.stringify(tabUrl)};
  const _verdictForGetVerdict = ${JSON.stringify(verdictForGetVerdict || null)};

  function makeStorageArea(store) {
    return {
      get: async (key) => {
        if (key == null) return { ...store };
        if (typeof key === "string") return { [key]: store[key] };
        if (Array.isArray(key)) {
          const o = {}; for (const k of key) o[k] = store[k]; return o;
        }
        // object with defaults
        const o = {};
        for (const k of Object.keys(key)) o[k] = (store[k] !== undefined) ? store[k] : key[k];
        return o;
      },
      set: async (entries) => { Object.assign(store, entries); },
      remove: async (keys) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete store[k];
      },
      clear: async () => { for (const k of Object.keys(store)) delete store[k]; }
    };
  }

  window.chrome = {
    storage: {
      local: makeStorageArea(_local),
      session: makeStorageArea(_session),
      onChanged: { addListener: () => {} }
    },
    runtime: {
      id: "mock-extension-id",
      sendMessage: async (msg) => {
        if (!msg || typeof msg !== "object") return { ok: true };
        if (msg.type === "availability" || msg.type === "model-status" || msg.type === "prepare-model") {
          return { availability: "available" };
        }
        if (msg.type === "diagnostics") {
          return {
            modelAvailability: "available",
            ocrAvailable: true,
            ocrLanguages: ["eng", "kor"],
            tesseractFilesPresent: ["lib/eng.traineddata", "lib/kor.traineddata"]
          };
        }
        if (msg.type === "getVerdict") {
          return _verdictForGetVerdict;
        }
        // scan / closeTab / allowlist / reset 등 — mock OK
        return { ok: true };
      },
      getURL: (p) => p,
      onMessage: { addListener: () => {} }
    },
    tabs: {
      query: async () => [{ id: 1, url: tabUrl, active: true }],
      create: () => {},
      update: () => {},
      sendMessage: async () => ({ ok: true })
    },
    action: {
      setBadgeText: () => {},
      setBadgeBackgroundColor: () => {},
      setIcon: () => {}
    },
    notifications: {
      create: () => {},
      onClicked: { addListener: () => {} }
    }
  };
})();
`;
}

const POPUP_BACKDROP_CSS = `
  html { background: linear-gradient(180deg, #f3f4f6 0%, #e5e7eb 100%) !important; min-height: 100vh !important; }
  body {
    background: #ffffff !important;
    width: 360px !important;
    margin: 100px auto !important;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.08) !important;
    border-radius: 16px !important;
    padding: 16px !important;
  }
`;

function fileUrl(rel) {
  return "file://" + path.join(ROOT, rel);
}

async function newPage(browser, shimOpts) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.evaluateOnNewDocument(buildShim(shimOpts));
  return page;
}

async function captureWarning(browser) {
  // warning.js 는 ?vid= 의 verdict id 로 session storage 에서 verdict 를 조회한다.
  // shim 의 session store 에 같은 키로 미리 박아둔다.
  const vid = "mock-vid-danger";
  const page = await newPage(browser, {
    lang: LANG,
    localStore: {},
    sessionStore: { ["verdict:" + vid]: DANGER_VERDICT, lastVerdict: DANGER_VERDICT },
    tabUrl: MOCK_DANGER_URL,
    verdictForGetVerdict: DANGER_VERDICT
  });
  await page.goto(fileUrl(`warning.html?u=${encodeURIComponent(MOCK_DANGER_URL)}&vid=${vid}`), { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: path.join(OUT, "01-warning-intercept.png"), fullPage: false });
  await page.close();
}

async function capturePopup(browser, scenario) {
  const tabUrl = scenario === "ready" ? MOCK_SAFE_URL : MOCK_DANGER_URL;
  const page = await newPage(browser, {
    lang: LANG, localStore: {}, sessionStore: {}, tabUrl
  });
  await page.goto(fileUrl("popup.html"), { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 600));
  await page.addStyleTag({ content: POPUP_BACKDROP_CSS });

  if (scenario === "danger") {
    await page.evaluate((url, verdict) => {
      if (typeof showStatus === "function") showStatus({ availability: "available" });
      document.getElementById("url").textContent = url;
      document.getElementById("scan").disabled = false;
      if (typeof renderVerdict === "function") renderVerdict(verdict);
    }, MOCK_DANGER_URL, DANGER_VERDICT);
  } else if (scenario === "ready") {
    await page.evaluate((url) => {
      if (typeof showStatus === "function") showStatus({ availability: "available" });
      document.getElementById("url").textContent = url;
      document.getElementById("scan").disabled = false;
      const result = document.getElementById("result");
      while (result.firstChild) result.removeChild(result.firstChild);
    }, MOCK_SAFE_URL);
  } else if (scenario === "scanning") {
    await page.evaluate((url) => {
      if (typeof showStatus === "function") showStatus({ availability: "available" });
      document.getElementById("url").textContent = url;
      document.getElementById("scan").disabled = true;
      const stages = (typeof getStages === "function") ? getStages() : [];
      const label = stages[2]?.label || "OCR + WHOIS lookup…";
      const tElapsed = (typeof t === "function") ? t("popup.stageElapsed", label, 6) : label + " (6s)";
      const result = document.getElementById("result");
      while (result.firstChild) result.removeChild(result.firstChild);
      const stage = document.createElement("div");
      stage.className = "verdict v-warn";
      stage.id = "stage";
      stage.textContent = tElapsed;
      result.appendChild(stage);
    }, MOCK_DANGER_URL);
  }
  await new Promise(r => setTimeout(r, 400));
  const name = {
    danger:   "02-popup-danger.png",
    ready:    "03-popup-ready.png",
    scanning: "04-popup-scanning.png"
  }[scenario];
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  await page.close();
}

async function captureVerdictDetail(browser) {
  const page = await newPage(browser, {
    lang: LANG,
    localStore: {},
    sessionStore: { lastVerdict: DANGER_VERDICT },
    tabUrl: MOCK_DANGER_URL
  });
  await page.goto(fileUrl("verdict.html"), { waitUntil: "domcontentloaded" });
  await new Promise(r => setTimeout(r, 700));
  // 스토어 listing 용으로 raw JSON pre 는 숨김. 실제 verdict 페이지엔 의도된 투명성 요소.
  await page.addStyleTag({ content: "pre { display: none !important; }" });
  await page.screenshot({ path: path.join(OUT, "05-verdict-detail.png"), fullPage: false });
  await page.close();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  console.log(`Output dir: ${OUT}`);
  console.log(`Lang: ${LANG}, headless: ${HEADLESS}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
    defaultViewport: VIEWPORT
  });

  try {
    await captureWarning(browser);
    console.log("✓ 01-warning-intercept.png");
    await capturePopup(browser, "danger");
    console.log("✓ 02-popup-danger.png");
    await capturePopup(browser, "ready");
    console.log("✓ 03-popup-ready.png");
    await capturePopup(browser, "scanning");
    console.log("✓ 04-popup-scanning.png");
    await captureVerdictDetail(browser);
    console.log("✓ 05-verdict-detail.png");
  } finally {
    await browser.close();
  }
  console.log(`Done. PNGs in: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
