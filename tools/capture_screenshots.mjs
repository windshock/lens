#!/usr/bin/env node
/**
 * Chrome Web Store screenshot 자동 캡처.
 *
 * 출력: screenshots/<name>.png — 1280×800. Chrome Web Store 가 받는 형식.
 *
 * 5장 스토어 가이드:
 *   1. warning.html intercept — danger verdict 가 만든 위험 페이지 가로채기
 *   2. popup.html (danger verdict) — popup 안에서 danger 결과
 *   3. popup.html (model ready) — 초기 idle 상태, 모델 준비 완료
 *   4. popup.html (mid-scan) — 단계 ticker 가 표시되는 진행 중 상태
 *   5. verdict.html detail — 게이지/시그널 카드 / "이 세션 동안 허용" 버튼
 *
 * 사용법:
 *   cd /Users/1004276/Downloads/scamguard-ai
 *   npm install puppeteer    # 첫 1회만
 *   node tools/capture_screenshots.mjs
 *
 * 주의:
 *   - puppeteer 는 확장 로드를 위해 headless: false 권장 (Chrome new-headless 도
 *     동작하지만 환경마다 다름). 화면 하나가 열렸다 닫힙니다.
 *   - 실제 Gemini Nano 호출은 안 함 — 모든 verdict 는 mock. popup 의 model
 *     status 도 page.evaluate 로 강제 'available' 로 그림.
 *   - 한국어 토글이 필요하면 LANG 환경변수: LANG=ko node tools/capture_screenshots.mjs
 */

import puppeteer from "puppeteer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { createHash } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "screenshots");
const LANG = process.env.LANG_OVERRIDE || "en"; // "en" or "ko"

const VIEWPORT = { width: 1280, height: 800 };

const MOCK_DANGER_URL = "https://microsft-365-signin.workers.dev/login";
const MOCK_SAFE_URL   = "https://example.com/";

const DANGER_VERDICT = {
  phishing_score: 9,
  brand: "Microsoft",
  phishing: true,
  suspicious_domain: true,
  reason: "[Auto override: O1] Brand-domain mismatch — 'Microsoft' official domain is microsoft.com but page is microsft-365-signin.workers.dev. Credential form detected.",
  url: MOCK_DANGER_URL,
  ts: Date.now()
};
function sha256Hex(s) {
  return createHash("sha256").update(s).digest("hex");
}

// popup.html / verdict.html 의 320px 너비 body 를 1280×800 viewport 의 중앙에 카드처럼
// 배치하기 위해 inject 하는 CSS. 원본 body 의 padding/배경은 그대로 유지.
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

async function getExtensionId(browser) {
  // 확장 SW 가 등록되면 chrome-extension://<id>/ 형식의 target 이 잡힌다.
  const swTarget = await browser.waitForTarget(
    t => t.type() === "service_worker" || t.url().startsWith("chrome-extension://"),
    { timeout: 10000 }
  );
  const url = swTarget.url();
  const m = url.match(/^chrome-extension:\/\/([a-z]+)\//);
  if (!m) throw new Error("Could not parse extension ID from: " + url);
  return m[1];
}

async function seedSessionStorage(page, kv) {
  await page.evaluate(async (entries) => {
    await chrome.storage.session.set(entries);
  }, kv);
}

async function setLang(page, lang) {
  await page.evaluate(async (l) => {
    await chrome.storage.local.set({ lang: l });
  }, lang);
}

async function captureWarning(browser, extensionId) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  // verdict-id 가 일치하도록 sha256 으로 vid 생성, session storage 에 verdict 주입.
  const vid = sha256Hex(MOCK_DANGER_URL);
  // warning.html 은 lang/verdict 조회 후 렌더하므로, 먼저 helper extension page 에서 storage 주입.
  await page.goto(`chrome-extension://${extensionId}/verdict.html`, { waitUntil: "domcontentloaded" });
  await setLang(page, LANG);
  await seedSessionStorage(page, {
    ["verdict:" + vid]: DANGER_VERDICT,
    lastVerdict: DANGER_VERDICT
  });
  const target = `chrome-extension://${extensionId}/warning.html?u=${encodeURIComponent(MOCK_DANGER_URL)}&vid=${vid}`;
  await page.goto(target, { waitUntil: "networkidle0" });
  await page.waitForSelector("body");
  await new Promise(r => setTimeout(r, 500)); // 폰트/transition 안정화
  await page.screenshot({ path: path.join(OUT, "01-warning-intercept.png"), fullPage: false });
  await page.close();
}

async function capturePopup(browser, extensionId, scenario) {
  // scenario: "danger" | "ready" | "scanning"
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  // popup.html 의 init() 가 chrome.runtime.sendMessage 로 availability/tab url 조회.
  // 실 SW 가 응답하긴 하지만 시점이 비결정적이라, 우리는 페이지 로드 후 강제 렌더한다.
  await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
  await setLang(page, LANG);
  // popup.js 의 init() 이 비동기로 끝나길 잠깐 대기.
  await new Promise(r => setTimeout(r, 800));

  await page.addStyleTag({ content: POPUP_BACKDROP_CSS });

  if (scenario === "danger") {
    await page.evaluate((url, verdict) => {
      // showStatus(available) → renderVerdict(danger) 강제
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
      document.getElementById("result").innerHTML = "";
    }, MOCK_SAFE_URL);
  } else if (scenario === "scanning") {
    await page.evaluate((url) => {
      if (typeof showStatus === "function") showStatus({ availability: "available" });
      document.getElementById("url").textContent = url;
      document.getElementById("scan").disabled = true;
      // stage ticker 의 mid-state 모사: 2번째 단계 표시. innerHTML 회피.
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

async function captureVerdictDetail(browser, extensionId) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(`chrome-extension://${extensionId}/verdict.html`, { waitUntil: "domcontentloaded" });
  await setLang(page, LANG);
  await seedSessionStorage(page, { lastVerdict: DANGER_VERDICT });
  // verdict.js 가 storage 에서 다시 읽어 렌더하도록 reload.
  await page.reload({ waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(OUT, "05-verdict-detail.png"), fullPage: false });
  await page.close();
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  console.log(`Output dir: ${OUT}`);
  console.log(`Lang: ${LANG}`);

  const browser = await puppeteer.launch({
    headless: false, // 확장 로드 안정성 위해 visible. 새 headless 도 가능하나 환경 차이 큼.
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
      "--no-sandbox",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height + 80}`
    ],
    defaultViewport: VIEWPORT
  });

  // 확장 SW 가 일어날 시간 약간 부여.
  await new Promise(r => setTimeout(r, 1500));
  const extensionId = await getExtensionId(browser);
  console.log("Extension ID:", extensionId);

  try {
    await captureWarning(browser, extensionId);
    console.log("✓ 01-warning-intercept.png");
    await capturePopup(browser, extensionId, "danger");
    console.log("✓ 02-popup-danger.png");
    await capturePopup(browser, extensionId, "ready");
    console.log("✓ 03-popup-ready.png");
    await capturePopup(browser, extensionId, "scanning");
    console.log("✓ 04-popup-scanning.png");
    await captureVerdictDetail(browser, extensionId);
    console.log("✓ 05-verdict-detail.png");
  } finally {
    await browser.close();
  }
  console.log(`Done. PNGs in: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
