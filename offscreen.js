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
    langPath:   chrome.runtime.getURL("lib/"),
    // workerBlobURL:false → Tesseract 가 워커를 blob 으로 감싸지 않고 extension URL 에서 직접
    // new Worker(workerPath) 로 로드한다. 기본값(true)은 blob 워커가
    // importScripts("chrome-extension://.../lib/worker.min.js") 를 하는데, Chrome 148+ 에서
    // blob-origin 워커의 extension URL importScripts 가 NetworkError 로 차단됨(OCR failed 회귀).
    workerBlobURL: false,
    // gzip:false → lib/ 에 비압축 *.traineddata 를 번들하므로 .gz suffix 를 붙이지 않는다.
    // 기본값(true)은 `eng.traineddata.gz` 를 fetch 하는데 그 파일이 없어 "Failed to fetch" 회귀.
    gzip: false
  });
  return _ocrWorker;
}

// 이미지를 PNG Blob 으로 정규화한다. 원본 blob 을 Tesseract(Leptonica)에 직접 넘기면
// WebP/AVIF/SVG 등 Leptonica 가 못 읽는 포맷이나 비-이미지 응답에서 "Unknown format / cannot
// be read" 가 나고, 심하면 WASM 워커가 abort 되어 이후 OCR 이 전부 깨진다. 브라우저 디코더
// (createImageBitmap)로 디코드 → OffscreenCanvas → PNG 로 재인코딩하면 Leptonica 는 항상
// 읽을 수 있는 PNG 만 받으므로 포맷 문제가 사라진다. (Blob 은 Tesseract recognize 가 확실히 수용)
async function urlToPngBlob(src, baseUrl) {
  let blob;
  if (src.startsWith("data:image/")) {
    blob = await (await fetch(src)).blob();
  } else {
    let absolute = src;
    try { absolute = new URL(src, baseUrl).href; } catch {}
    const res = await fetch(absolute, { credentials: "omit" });
    if (!res.ok) throw new Error(`img fetch ${res.status}`);
    blob = await res.blob();
  }
  const bmp = await createImageBitmap(blob); // SVG/손상 이미지는 여기서 throw → 호출부가 skip
  let w = bmp.width, h = bmp.height;
  if (!w || !h) { bmp.close?.(); return null; }
  const MAX = 2000; // 긴 변 캡 — 과대 이미지 메모리/시간 방어
  const scale = Math.min(1, MAX / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return await canvas.convertToBlob({ type: "image/png" });
}

async function ocrImages({ imgs, base }) {
  if (!imgs || imgs.length === 0) return "";
  let worker;
  try { worker = await ocrWorker(); } catch { return ""; }
  const parts = [];
  let total = 0;
  const PER_IMG_CAP = 200;
  const TOTAL_CAP = 800;
  for (const src of imgs) {
    if (total >= TOTAL_CAP) break;
    // 1) fetch + 브라우저 디코드 + PNG 정규화. 실패(비-이미지/SVG/손상)는 그 이미지만 skip.
    let pngBlob;
    try {
      pngBlob = await urlToPngBlob(src, base);
    } catch (e) {
      continue;
    }
    if (!pngBlob) continue;
    // 2) 인식. recognize 자체가 실패하면 워커가 깨졌을 수 있으니 폐기하고 중단 —
    //    다음 OCR 호출이 ocrWorker() 에서 새 워커를 만든다(self-heal). 죽은 워커를
    //    계속 재사용해 모든 후속 OCR 이 깨지는 회귀를 방지한다.
    try {
      const { data } = await worker.recognize(pngBlob);
      const text = (data?.text || "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      const slice = text.slice(0, PER_IMG_CAP);
      parts.push(slice);
      total += slice.length + 1;
    } catch (e) {
      console.warn("OCR recognize failed — resetting worker:", e);
      try { await worker.terminate?.(); } catch {}
      _ocrWorker = null;
      break;
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
    // 등록인(Registrant) 추출 — yesnic .kr WHOIS 는 영문 "Registrant :" + 한글 "등록인 :" 을
    // 모두 노출한다(예: ogog.kr → "SK Planet Co. Ltd."). `Registrant\s*:` 라 "Registrant Address"
    // 는 매칭되지 않는다. 영문 우선(.com RDAP anchor 와 정규화 일관), 없으면 한글 폴백.
    // O1-whois / O1-whois-transitive / O1-infra 가 소비할 수 있게 별도 `| Registrant:` 세그먼트로
    // 붙인다(콤마-조인 안에 묻으면 override 의 `|` split + `^Registrant:` 필터가 인식 못 함).
    let registrant = grab(/Registrant\s*:\s*([^\n]+)/i) || grab(/등록인\s*:\s*([^\n]+)/i);
    if (registrant) {
      registrant = registrant
        .replace(/&nbsp;/gi, " ")
        // 한 줄에 다음 필드가 붙어온 경우(newline 부재) 방어적 절단
        .split(/\s{2,}|(?:Registrant Address|Administrative Contact|AC E-?Mail|AC Phone|등록인\s*주소|책임자|Registered Date|Expiration Date)/i)[0]
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120);
    }
    const base = Object.entries(d).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ");
    return registrant ? `${base} | Registrant: ${registrant}` : base;
  } catch (e) {
    return "";
  }
}

function parseStaticHtml(html, base) {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");

    const phishingKitMarkersSet = new Set();
    const PHISHING_KIT_LITERALS = [
      { re: /logo\.clearbit\.com\//i, tag: "clearbit-logo" },
      { re: /api\.screenshotmachine\.com/i, tag: "screenshotmachine" },
      { re: /api\.telegram\.org\/bot[^/]+\/sendMessage/i, tag: "telegram-exfil" },
      { re: /api\.telegram\.org\/bot[^/]+\/sendDocument/i, tag: "telegram-document-exfil" },
      { re: /discord(?:app)?\.com\/api\/webhooks/i, tag: "discord-webhook" },
      { re: /webhook\.site\//i, tag: "webhook-site" }
    ];
    const ATOB_LITERAL_RE = /atob\(\s*['"`]([A-Za-z0-9+/=]{8,200})['"`]\s*\)/g;
    const ATOB_DECODED_URL_RE = /^(?:\.\.?\/|https?:\/\/)|\.(?:php|aspx|asp|jsp|do|action|cgi)(?:$|\?)/i;
    function collectPhishingKitMarkers(src) {
      if (!src) return;
      for (const { re, tag } of PHISHING_KIT_LITERALS) {
        if (re.test(src)) phishingKitMarkersSet.add(tag);
      }
      ATOB_LITERAL_RE.lastIndex = 0;
      let m;
      while ((m = ATOB_LITERAL_RE.exec(src)) && phishingKitMarkersSet.size < 16) {
        try {
          const decoded = atob(m[1]);
          if (ATOB_DECODED_URL_RE.test(decoded)) {
            phishingKitMarkersSet.add("atob-url:" + decoded.slice(0, 80));
          }
        } catch {}
      }
    }
    for (const s of doc.querySelectorAll("script")) {
      collectPhishingKitMarkers(s.textContent || "");
      collectPhishingKitMarkers(s.getAttribute("src") || "");
    }
    
    // drop tags
    ["script", "style", "noscript", "svg", "iframe", "link", "meta"].forEach(t => {
      doc.querySelectorAll(t).forEach(n => n.remove());
    });

    const serializeFormElement = (el) => {
      const tag = el.tagName.toLowerCase();
      const attrs = ["name", "type", "placeholder", "value", "action", "method", "id", "autocomplete"];
      const pairs = attrs.map(k => [k, el.getAttribute(k)]).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k}="${String(v).slice(0, 60)}"`);
      return `<${tag} ${pairs.join(" ")}>`;
    };

    const forms = [...doc.querySelectorAll("input,textarea,form,select,button")].slice(0, 40).map(serializeFormElement);
    
    const anchors = [];
    const dangerousUris = [];
    const execDownloads = [];
    const seenAnchor = new Set();
    const DANGEROUS_URI = /^(applescript|ms-msdt|ms-msvr|ms-search|search-ms|shell|vbscript|jar|chrome|about):/i;
    const EXEC_EXT = /\.(exe|dmg|pkg|msi|bat|cmd|ps1|vbs|jar|scr|hta|app|command|scpt|sh|run|deb|rpm|appimage)(\?|$)/i;

    for (const a of doc.querySelectorAll("a[href]")) {
      const href = a.getAttribute("href") || "";
      let absoluteHref = href;
      try { absoluteHref = new URL(href, base).href; } catch {}
      
      if (DANGEROUS_URI.test(href)) {
        dangerousUris.push(`${href} (${(a.textContent || "").trim().slice(0, 60)})`);
        continue;
      }
      if (EXEC_EXT.test(absoluteHref) || a.hasAttribute("download")) {
        execDownloads.push(`${absoluteHref} (${(a.textContent || "").trim().slice(0, 60)})`);
      }
      if (!/^https?:/i.test(absoluteHref)) continue;
      if (seenAnchor.has(absoluteHref)) continue;
      seenAnchor.add(absoluteHref);
      anchors.push(`${absoluteHref} | ${(a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)}`);
      if (anchors.length >= 40) break;
    }

    const imgs = [];
    for (const img of doc.querySelectorAll("img")) {
      const src = img.getAttribute("src");
      if (!src) continue;
      try { imgs.push(new URL(src, base).href); } catch {}
      if (imgs.length >= 12) break;
    }

    const visibleText = (doc.body ? doc.body.textContent : "").replace(/\s+/g, " ").trim();

    // extract social hits & shell hits
    const SOCIAL_RE = new RegExp("(?:win\\s*\\+\\s*r|⊞\\s*\\+?\\s*r|press\\s+(?:ctrl|cmd|⊞)\\s*\\+\\s*\\w|i\\W?m\\s+not\\s+a\\s+robot|verify\\s+you\\s+are\\s+human|cloudflare\\s+(?:verification|challenge)|복사\\s*(?:후|해|하)|붙여넣|터미널|보안\\s*확인|click\\s+(?:below|to\\s+verify|here\\s+to)|paste\\s+(?:into|in\\s+the)|open\\s+(?:powershell|terminal|run|cmd))", "i");
    const SHELL_HINT_RE = /\b(powershell|invoke-?webrequest|invoke-?expression|\biex\b|mshta|cmd\.exe|curl\s+[^|]+\|\s*(?:bash|sh|zsh)|wget\s+[^|]+\|\s*(?:bash|sh|zsh)|eval\s*\(|base64\s+-d|chmod\s+\+x|tr\s+['"][^'"]+['"]\s+['"][^'"]+['"])/i;
    
    const socialHits = (visibleText.match(new RegExp(SOCIAL_RE.source, "gi")) || []).slice(0, 8).map(m => m.toLowerCase());
    const shellHits = (visibleText.match(new RegExp(SHELL_HINT_RE.source, "gi")) || []).slice(0, 8);

    return {
      finalUrl: base,
      title: doc.title || "",
      forms,
      anchors,
      imgs,
      visibleText,
      behaviors: {
        clipboardWrites: [],
        dangerousUris,
        execDownloads,
        socialHits,
        shellHits,
        copyButtons: [],
        codeSnippets: [],
        phishingKitMarkers: [...phishingKitMarkersSet].slice(0, 8)
      }
    };
  } catch (e) {
    return null;
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
  if (msg.type === "PARSE_STATIC_HTML") {
    sendResponse(parseStaticHtml(msg.html, msg.url));
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
