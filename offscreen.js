// offscreen.js — SW에서 위임받은 OCR과 WHOIS HTML 파싱을 수행.
// Tesseract.js v5 (lib/tesseract.min.js) 사용. lib/README.md 참고.

let _ocrWorker = null;
let _ocrAvailable = null; // null=미확인, true/false
let _ocrLanguages = [];

async function checkOcrAvailability() {
  if (_ocrAvailable !== null) return { available: _ocrAvailable, languages: _ocrLanguages };
  if (typeof Tesseract === "undefined") {
    _ocrAvailable = false;
    _ocrLanguages = [];
    console.warn("[offscreen] Tesseract.js not loaded — OCR unavailable");
    return { available: false, languages: [] };
  }
  // 핵심 런타임 파일 존재 여부 확인
  const requiredFiles = [
    "lib/tesseract.min.js",
    "lib/worker.min.js",
    "lib/tesseract-core.wasm.js"
  ];
  const langFiles = ["lib/eng.traineddata", "lib/kor.traineddata"];
  const presentLangs = [];
  for (const f of langFiles) {
    try {
      const url = chrome.runtime.getURL(f);
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) presentLangs.push(f.includes("kor") ? "kor" : "eng");
    } catch {}
  }
  if (presentLangs.length === 0) {
    _ocrAvailable = false;
    _ocrLanguages = [];
    console.warn("[offscreen] No language data files found — OCR unavailable");
    return { available: false, languages: [] };
  }
  _ocrAvailable = true;
  _ocrLanguages = presentLangs;
  console.log(`[offscreen] OCR available, languages: ${presentLangs.join(",")}`);
  return { available: true, languages: presentLangs };
}

async function ocrWorker() {
  if (_ocrWorker) return _ocrWorker;
  const { available, languages } = await checkOcrAvailability();
  if (!available) {
    throw new Error("OCR unavailable — lib/README.md 참고");
  }
  // eng+kor 지원: eng는 항상 포함, kor는 파일이 있을 때만
  const langs = languages.includes("kor") ? "eng+kor" : "eng";
  _ocrWorker = await Tesseract.createWorker(langs, undefined, {
    workerPath: chrome.runtime.getURL("lib/worker.min.js"),
    corePath:   chrome.runtime.getURL("lib/tesseract-core.wasm.js"),
    langPath:   chrome.runtime.getURL("lib/")
  });
  return _ocrWorker;
}

async function urlToBitmapSource(src, baseUrl) {
  if (src.startsWith("data:image/")) {
    // data URL은 Tesseract가 직접 처리 가능.
    return src;
  }
  let absolute = src;
  try { absolute = new URL(src, baseUrl).href; } catch {}
  // SW에서 host_permissions로 fetch 가능하지만, offscreen에서도 동일 권한 적용.
  const res = await fetch(absolute, { credentials: "omit" });
  if (!res.ok) throw new Error(`img fetch ${res.status}`);
  const blob = await res.blob();
  return blob;
}

async function ocrImages({ imgs, base }) {
  if (!imgs || imgs.length === 0) return "";
  const worker = await ocrWorker();
  const parts = [];
  let total = 0;
  const PER_IMG_CAP = 200;
  const TOTAL_CAP = 800;
  for (const src of imgs) {
    if (total >= TOTAL_CAP) break;
    try {
      const source = await urlToBitmapSource(src, base);
      const { data } = await worker.recognize(source);
      const text = (data?.text || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const slice = text.slice(0, PER_IMG_CAP);
      parts.push(slice);
      total += slice.length + 1;
    } catch (e) {
      // 한 장 실패는 무시
    }
  }
  return parts.join(" ").slice(0, TOTAL_CAP);
}

function parseWhois(html) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    // testyesnic.py 의 정확한 셀렉터.
    let cell = doc.querySelector(
      'td[style="border:solid 1px #91b9c3; font-size:13px; padding:15px; color:#555; line-height:18px;"]'
    );
    if (!cell) {
      // 스타일 속성이 정확히 안 맞을 때 폴백: WHOIS 라인을 포함한 가장 긴 td.
      const tds = [...doc.querySelectorAll("td")];
      cell = tds.find(t => /domain\s*name|도메인이름/i.test(t.textContent)) || null;
    }
    if (!cell) return "";
    // testextractwhoisdata.py 의 7키 압축.
    const text = cell.innerText || cell.textContent || "";
    const grab = (re) => { const m = text.match(re); return m ? m[1].trim() : ""; };
    const d = {
      "Domain Name":  grab(/Domain Name\s*:?[\s]*([^\n]+)/i),
      "Registrar":    grab(/Registrar\s*:?[\s]*([^\n]+)/i),
      "Registered":   grab(/(?:Registered Date|Creation Date|등록일)\s*:?[\s]*([^\n]+)/i),
      "Updated":      grab(/(?:Last Updated Date|Updated Date|최근 정보 변경일)\s*:?[\s]*([^\n]+)/i),
      "Expires":      grab(/(?:Expiration Date|Registry Expiry Date|사용 종료일)\s*:?[\s]*([^\n]+)/i),
      "Name Server":  grab(/(?:Name Server|호스트이름)\s*:?[\s]*([^\n]+)/i),
      "Contact":      grab(/(?:Registrar Abuse Contact Email|AC E-Mail|책임자 전자우편)\s*:?[\s]*([^\n]+)/i)
    };
    return Object.entries(d).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ");
  } catch (e) {
    return "";
  }
}

// ───────────────────────── 아이콘 생성 (OffscreenCanvas) ─────────────────────────

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawShield(ctx, size, color, glyph) {
  // 배경
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  roundRect(ctx, 1, 1, size - 2, size - 2, Math.max(2, size * 0.18));
  ctx.fill();
  // 글리프
  ctx.fillStyle = "#ffffff";
  const fontSize = Math.round(size * (glyph.length > 1 ? 0.42 : 0.62));
  ctx.font = `bold ${fontSize}px -apple-system, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, size / 2, size / 2 + size * 0.04);
}

function renderImageData(size, color, glyph) {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext("2d");
  drawShield(ctx, size, color, glyph);
  return ctx.getImageData(0, 0, size, size);
}

async function renderDataURL(size, color, glyph) {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext("2d");
  drawShield(ctx, size, color, glyph);
  const blob = await c.convertToBlob({ type: "image/png" });
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function generateIcons() {
  const ACTION_COLOR = "#1f6feb";
  const sizes = [16, 32, 48, 128];
  const action = {};
  for (const s of sizes) action[s] = renderImageData(s, ACTION_COLOR, "✓");
  const [ok, warn, danger] = await Promise.all([
    renderDataURL(128, "#1f883d", "✓"),
    renderDataURL(128, "#d97706", "!"),
    renderDataURL(128, "#b91c1c", "✕")
  ]);
  return { action, dataUrls: { ok, warn, danger } };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;

  if (msg.type === "OCR_DIAGNOSTICS") {
    checkOcrAvailability().then(sendResponse);
    return true;
  }
  if (msg.type === "OCR") {
    ocrImages(msg).then(sendResponse).catch(e => {
      console.warn("OCR failed:", e);
      sendResponse("");
    });
    return true;
  }
  if (msg.type === "WHOIS_PARSE") {
    try { sendResponse(parseWhois(msg.html)); }
    catch (e) { sendResponse(""); }
    return false;
  }
  if (msg.type === "GENERATE_ICONS") {
    generateIcons().then(sendResponse).catch(e => {
      console.warn("icon gen failed:", e);
      sendResponse(null);
    });
    return true;
  }
  return false;
});
