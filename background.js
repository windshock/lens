// background.js — Service Worker (MV3, ES module)
// 4종 트리거(우클릭/툴바/OWA/다운로드)를 단일 scanUrl()로 수렴.
// 모델: Chrome built-in Gemini Nano (LanguageModel). 폴백 없음.

const SYS = `You are a security expert. Determine if the webpage is phishing or legitimate.

Instructions:
1. Analyze the HTML, URL, and OCR-extracted text for any SE techniques often used in phishing attacks. Point out any suspicious elements found in the HTML, URL, or text.
2. Identify the brand name. If the HTML appears to resemble a legitimate web page, verify if the URL and WHOIS match the legitimate domain name associated with the brand, if known.
3. Decide if the site is phishing or legitimate. If unsure, state 'unknown'.
4. Output JSON with keys: phishing_score (0-10), brand (string|null), phishing (bool), suspicious_domain (bool), reason (string, ONE concise sentence, max 250 chars — do NOT enumerate every signal).

Phishing signs:
- Account issues alerts
- Unexpected rewards
- Missing package/payment notices
- Fake security warnings
- Credential/private key entry forms on unfamiliar domains

Critical signals (treat as strong evidence of phishing):
- BEHAVIORS section is present and includes clipboardWrites — analyze EACH entry as if a user might paste it into a shell or Run dialog. Even if obfuscated (eval/tr/base64/character-substitution/string-permutation), recognize shell-execution intent. Examples of obfuscated payloads that ARE malicious: \`curl ... | bash\`, \`iex(...)\`, \`powershell -enc <base64>\`, \`eval($(echo X | tr A B))\`, \`mshta http://...\`, anything piped into bash/zsh/sh/powershell.
- BEHAVIORS.autoDownloads non-empty — page tried to auto-download a file on load; almost always malicious unless context is a legitimate file-distribution site.
- BEHAVIORS.dangerousUris non-empty — links with applescript://, ms-msdt://, shell:, vbscript: schemes are direct code-execution vectors.
- BEHAVIORS.shellHits combined with BEHAVIORS.socialHits can be a ClickFix pattern ONLY when the page is instructing users to paste/run commands (e.g., "Win+R", "Run", "paste into Terminal/PowerShell") and/or when clipboardWrites contains a shell payload. Mere presence of shell commands in developer documentation is NOT phishing by itself.
- Brand impersonation on hosting subdomains: if the page mimics brand X but is on workers.dev/pages.dev/vercel.app/netlify.app/etc. — assume phishing unless explicit demo disclaimer.

Limitations:
- Subdomains of hosting services (Cloudflare, AWS, Azure, Netlify, pages.dev, weebly.com) should NOT be assumed legitimate even if their WHOIS is legitimate.
- Subdomains containing dev/stg/prd are normal.
- A server error, page-not-found, or empty HTML is NOT a phishing sign.
- OCR or HTML having no data is NOT a phishing sign.
- HTML may be shortened and simplified.
- OCR-extracted text may be inaccurate or gibberish.
- The Korean top-level domain (.kr) is NOT suspicious by itself.
- Internal development or testing environments are NOT suspicious.`;

const VERDICT_SCHEMA = {
  type: "object",
  required: ["phishing_score", "brand", "phishing", "suspicious_domain", "reason"],
  additionalProperties: false,
  properties: {
    phishing_score:    { type: "integer", minimum: 0, maximum: 10 },
    brand:             { type: ["string", "null"] },
    phishing:          { type: "boolean" },
    suspicious_domain: { type: "boolean" },
    reason:            { type: "string", maxLength: 280 }
  }
};

const INTERNAL_DOMAINS = ["skplanet.com", "sktelecom.com", "sk.com", "localhost", "127.0.0.1", "::1"];

// 브랜드 ↔ 정식 도메인 화이트리스트. 모델이 브랜드를 식별했는데 도메인이
// 이 목록의 어느 것에도 매칭 안 되고 free-hosting 서브도메인이면 강제 피싱 판정.
const OFFICIAL_DOMAINS = {
  "DeepSeek":     ["deepseek.com", "chat.deepseek.com"],
  "DeepSeek AI":  ["deepseek.com", "chat.deepseek.com"],
  "NotebookLM":   ["notebooklm.google.com", "notebooklm.google"],
  "Google":       ["google.com", "google.co.kr", "google.co.jp", "googleusercontent.com"],
  "Claude":       ["claude.ai", "claude.com", "anthropic.com", "console.anthropic.com"],
  "claude.ai":    ["claude.ai", "claude.com", "anthropic.com", "console.anthropic.com", "code.claude.com"],
  "claude.com":   ["claude.ai", "claude.com", "anthropic.com", "console.anthropic.com", "code.claude.com"],
  "Anthropic":    ["anthropic.com", "claude.ai", "claude.com", "console.anthropic.com", "code.claude.com"],
  "OpenAI":       ["openai.com", "chatgpt.com", "platform.openai.com"],
  "ChatGPT":      ["chatgpt.com", "openai.com"],
  "Meta":         ["meta.com", "facebook.com", "instagram.com", "whatsapp.com"],
  "Microsoft":    ["microsoft.com", "office.com", "live.com", "outlook.com", "azure.com"],
  "Apple":        ["apple.com", "icloud.com"],
  "MetaMask":     ["metamask.io"],
  "Coinbase":     ["coinbase.com", "wallet.coinbase.com"],
  "Binance":      ["binance.com"],
  "SK텔레콤":     ["sktelecom.com", "tworld.co.kr"],
  "SK Telecom":   ["sktelecom.com", "tworld.co.kr"],
  "SK플래닛":     ["skplanet.com"],
  "SK Planet":    ["skplanet.com"],
  "OKCashbag":    ["okcashbag.com"],
  "11번가":       ["11st.co.kr"],
  "Naver":        ["naver.com", "naver.net", "navercorp.com"],
  "네이버":       ["naver.com", "naver.net", "navercorp.com"],
  "Kakao":        ["kakao.com", "daum.net", "kakaobank.com", "kakaopay.com", "kakaocorp.com"],
  "카카오":       ["kakao.com", "daum.net", "kakaobank.com", "kakaopay.com", "kakaocorp.com"],
  "Daum":         ["daum.net", "kakao.com"],
  "다음":         ["daum.net", "kakao.com"],
  "Nate":         ["nate.com", "cyworld.com"],
  "네이트":       ["nate.com", "cyworld.com"],
  "Coupang":      ["coupang.com", "coupangplay.com"],
  "쿠팡":         ["coupang.com", "coupangplay.com"],
  "Gmarket":      ["gmarket.co.kr", "gmarket.com"],
  "지마켓":       ["gmarket.co.kr", "gmarket.com"],
  "Auction":      ["auction.co.kr"],
  "옥션":         ["auction.co.kr"],
  "Interpark":    ["interpark.com"],
  "인터파크":     ["interpark.com"],
  "Toss":         ["toss.im", "tossinvest.com", "tossbank.com"],
  "토스":         ["toss.im", "tossinvest.com", "tossbank.com"],
  "Samsung":      ["samsung.com", "samsung.co.kr", "samsungfire.com", "samsunglife.com"],
  "삼성":         ["samsung.com", "samsung.co.kr"],
  "LG":           ["lg.com", "lge.com", "lgcns.com", "lguplus.com"],
  "LG U+":        ["lguplus.com", "lg.com"],
  "KT":           ["kt.com", "olleh.com", "kticloud.com"],
  "Hyundai":      ["hyundai.com", "hyundai.co.kr", "hmg.com"],
  "현대":         ["hyundai.com", "hyundai.co.kr"],
  "Kia":          ["kia.com", "kia.co.kr"],
  "기아":         ["kia.com", "kia.co.kr"],
  "Shinsegae":    ["shinsegae.com", "ssg.com", "emart.com"],
  "신세계":       ["shinsegae.com", "ssg.com", "emart.com"],
  "Lotte":        ["lotte.com", "lotteon.com", "lottemart.com", "lottecinema.co.kr"],
  "롯데":         ["lotte.com", "lotteon.com", "lottemart.com"],
  "KB국민은행":   ["kbstar.com", "kbfg.com", "liivmate.com"],
  "신한은행":     ["shinhan.com", "shinhancard.com"],
  "하나은행":     ["hanabank.com", "kebhana.com"],
  "우리은행":     ["wooribank.com", "wooricard.com"],
  "NH농협":       ["nonghyup.com", "nhbank.com", "nhcard.com"],
  "IBK기업은행":  ["ibk.co.kr"],
  "카카오뱅크":   ["kakaobank.com"],
  "케이뱅크":     ["kbanknow.com"],
  "Melon":        ["melon.com"],
  "멜론":         ["melon.com"],
  "Naver Webtoon":["webtoon.com", "comic.naver.com"],
  "네이버웹툰":   ["webtoon.com"],
  "Krafton":      ["battlegrounds.com", "pubg.com", "krafton.com"],
  "Netmarble":    ["netmarble.com", "netmarble.net"],
  "넷마블":       ["netmarble.com", "netmarble.net"],
  "Nexon":        ["nexon.com", "nexon.net"],
  "넥슨":         ["nexon.com", "nexon.net"],
  "NCSoft":       ["ncsoft.com", "lineage.com"],
  "엔씨소프트":   ["ncsoft.com"],
  "Musinsa":      ["musinsa.com"],
  "무신사":       ["musinsa.com"],
  "Baemin":       ["baemin.com", "woowa.net"],
  "배달의민족":   ["baemin.com", "woowa.net"],
  "Yogiyo":       ["yogiyo.co.kr"],
  "요기요":       ["yogiyo.co.kr"],
  "Kakao Mobility": ["kakaomobility.com", "t.kakao.com"],
  "카카오T":      ["kakaomobility.com"],
  "Naver Map":    ["map.naver.com"],
  "CGV":          ["cgv.co.kr"],
  "Megabox":      ["megabox.co.kr"],
  "Lotte Cinema": ["lottecinema.co.kr"],
  "Watcha":       ["watcha.com"],
  "Wavve":        ["wavve.com"],
  "Seezn":        ["seezn.com"],
  "Kyobo":        ["kyobobook.co.kr"],
  "교보문고":     ["kyobobook.co.kr"],
  "Yes24":        ["yes24.com"],
  "Aladin":       ["aladin.co.kr"],
  "알라딘":       ["aladin.co.kr"],
};
// 무료 호스팅 / 단명 서브도메인 / 누구나 임의 콘텐츠 올리는 클라우드 스토리지·CDN.
// 정식 브랜드 사이트는 이런 곳에 안 박힘 — 브랜드 사칭 발견 + 이 호스팅이면 거의 확실히 피싱.
const FREE_HOSTING_RE = /(?:^|\.)(?:workers\.dev|pages\.dev|vercel\.app|netlify\.app|netlify\.com|replit\.dev|repl\.co|github\.io|gitlab\.io|weebly\.com|webflow\.io|web\.app|firebaseapp\.com|surge\.sh|onrender\.com|glitch\.me|wixsite\.com|squarespace\.com|wordpress\.com|blogspot\.com|tiiny\.site|herokuapp\.com|cyclic\.app|fly\.dev|deno\.dev|render\.com|ngrok\.io|ngrok-free\.app|trycloudflare\.com|amplifyapp\.com|amazonaws\.com|cloudfront\.net|azurewebsites\.net|azureedge\.net|azurestaticapps\.net|blob\.core\.windows\.net|web\.core\.windows\.net|storage\.googleapis\.com|appspot\.com|run\.app|digitaloceanspaces\.com|ondigitalocean\.app|backblazeb2\.com|fastly\.net|b-cdn\.net|github\.dev|githubusercontent\.com|gitlab\.io|s3-website[-.][a-z0-9-]+\.amazonaws\.com)$/i;

// 공개 랭킹(Cloudflare Radar KR / Tranco) 기반 한국 인기 도메인 목록.
// OFFICIAL_DOMAINS와 달리 LLM의 브랜드 인식 없이도 도메인 직접 매칭으로 동작.
// 업데이트: Cloudflare Radar https://radar.cloudflare.com/domains 에서 KR 필터 후 갱신.
const POPULAR_KR_DOMAINS = new Set([
  // 포털·검색
  "naver.com", "daum.net", "nate.com", "kakao.com", "zum.com",
  // 소셜·커뮤니티
  "dcinside.com", "clien.net", "ruliweb.com", "fmkorea.com", "instiz.net",
  "theqoo.net", "mlbpark.com", "bobae.co.kr", "slrclub.com", "ppomppu.co.kr",
  "todayhumor.co.kr", "82cook.com", "blind.com",
  // 뉴스·미디어
  "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr", "ohmynews.com",
  "yna.co.kr", "ytn.co.kr", "mbc.co.kr", "kbs.co.kr", "sbs.co.kr",
  "jtbc.co.kr", "tvchosun.com", "mbn.co.kr", "hankyung.com",
  "mk.co.kr", "sedaily.com", "etnews.com", "zdnet.co.kr",
  // 쇼핑·커머스
  "coupang.com", "gmarket.co.kr", "11st.co.kr", "auction.co.kr",
  "ssg.com", "lotteon.com", "tmon.co.kr", "wemakeprice.com",
  "interpark.com", "musinsa.com", "zigzag.kr", "ably.team",
  "oliveyoung.co.kr", "hwahae.kr", "kurly.com", "ohou.se",
  // 금융·은행
  "kbstar.com", "shinhan.com", "wooribank.com", "hanabank.com",
  "nonghyup.com", "ibk.co.kr", "kakaobank.com", "kbanknow.com",
  "toss.im", "shinhancard.com", "hyundaicard.com", "lottefinance.co.kr",
  "samsungcard.com", "bccard.com", "nhcard.com", "lottecard.co.kr",
  "kbcard.com", "wooricard.com", "citibank.co.kr", "sc.com",
  "koreainvestment.com", "nhqv.com", "miraeasset.com", "kiwoom.com",
  "samsung.com", "hanwha.com",
  // 이동통신·IT
  "sktelecom.com", "kt.com", "lguplus.com", "skbroadband.com",
  "skplanet.com", "skstoa.com", "naver.net", "navercorp.com",
  "kakaoenterprise.com", "kakaopage.com", "webtoon.com",
  // 게임
  "nexon.com", "netmarble.com", "ncsoft.com", "krafton.com",
  "smilegate.com", "bluehole.com", "ngelgames.com", "4game.com",
  // 음악·동영상·OTT
  "melon.com", "genie.co.kr", "bugs.co.kr", "vibe.naver.com",
  "wavve.com", "watcha.com", "tving.com", "seezn.com",
  "laftel.net", "vlive.tv",
  // 배달·교통·여행
  "baemin.com", "yogiyo.co.kr", "coupangeats.com",
  "kakaomobility.com", "kakao.com",
  "naver.com", "yanolja.com", "yeogi.com", "expedia.co.kr",
  "korail.com", "kobus.co.kr", "airport.kr",
  // 교육
  "edunet.net", "ebs.co.kr", "khan.co.kr", "megastudy.net",
  "etoos.com", "daesung.com", "srtplus.or.kr",
  // 공공·정부
  "gov.kr", "korea.kr", "moe.go.kr", "mois.go.kr", "nts.go.kr",
  "nhis.or.kr", "nps.or.kr", "hometax.go.kr", "minwon.go.kr",
  "police.go.kr", "1365.go.kr", "bokjiro.go.kr",
  // 부동산
  "naver.com", "zigbang.com", "dabangapp.com", "hogangnono.com",
  // 도서·문화
  "kyobobook.co.kr", "yes24.com", "aladin.co.kr",
  "cgv.co.kr", "megabox.co.kr", "lottecinema.co.kr",
  // 글로벌(한국 사용 상위)
  "google.com", "youtube.com", "facebook.com", "instagram.com",
  "twitter.com", "x.com", "tiktok.com", "linkedin.com",
  "github.com", "stackoverflow.com", "wikipedia.org",
  "amazon.com", "ebay.com", "aliexpress.com",
  "microsoft.com", "apple.com", "adobe.com",
]);

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const WARNING_URL = chrome.runtime.getURL("warning.html");
// notifications iconUrl 폴백 — 아이콘 캐시가 비었을 때 사용 (1×1 빨간 점 PNG)
const FALLBACK_NOTIF_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TAB_LOAD_TIMEOUT_MS = 8000;
const NAVIGATION_SCAN_COOLDOWN_MS = 60_000;
const PROMPT_OUTPUT_RESERVE = 512;

let _session = null;
let _availability = null;
let _sessionPromise = null;
let _downloadProgress = null;
let _modelError = null;

// ───────────────────────── LanguageModel session ─────────────────────────

async function checkAvailability() {
  if (typeof LanguageModel === "undefined") {
    _availability = "unavailable";
    return _availability;
  }
  try {
    _availability = await LanguageModel.availability();
  } catch (e) {
    console.warn("LanguageModel.availability() threw:", e);
    _availability = "unavailable";
  }
  return _availability;
}

function modelStatus() {
  return {
    availability: _availability,
    preparing: !!_sessionPromise && !_session,
    progress: _downloadProgress,
    error: _modelError
  };
}

async function ensureSession() {
  if (_session) return _session;
  if (_sessionPromise) return _sessionPromise;

  _sessionPromise = (async () => {
    const a = await checkAvailability();
    if (a === "unavailable") throw new Error("Gemini Nano 사용 불가");

    _modelError = null;
    if (a === "downloadable" || a === "downloading") {
      _availability = "downloading";
      _downloadProgress = { loaded: 0, total: 1 };
      await applyBadgeState(_availability);
    }

    const session = await LanguageModel.create({
      initialPrompts: [{ role: "system", content: SYS }],
      temperature: 0,
      topK: 1,
      monitor(m) {
        m.addEventListener("downloadprogress", e => {
          _availability = "downloading";
          _downloadProgress = {
            loaded: typeof e.loaded === "number" ? e.loaded : 0,
            total: typeof e.total === "number" ? e.total : 1
          };
          console.log(`LM download: ${e.loaded}/${e.total}`);
          applyBadgeState(_availability).catch(() => {});
        });
      }
    });

    _session = session;
    _availability = "available";
    _downloadProgress = null;
    await applyBadgeState(_availability);
    return _session;
  })();

  try {
    return await _sessionPromise;
  } catch (e) {
    _sessionPromise = null;
    _session = null;
    _modelError = String(e?.message || e);
    _downloadProgress = null;
    await updateBadge();
    throw e;
  }
}

async function applyBadgeState(a) {
  if (a === "available") {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "현재 페이지 피싱 검사" });
  } else if (a === "downloadable" || a === "downloading") {
    chrome.action.setBadgeBackgroundColor({ color: "#888" });
    chrome.action.setBadgeText({ text: "···" });
    chrome.action.setTitle({ title: "온디바이스 모델 다운로드 중" });
  } else {
    chrome.action.setBadgeBackgroundColor({ color: "#b00" });
    chrome.action.setBadgeText({ text: "X" });
    chrome.action.setTitle({ title: "온디바이스 모델 사용 불가" });
  }
}

async function updateBadge() {
  const a = await checkAvailability();
  await applyBadgeState(a);
}

// ───────────────────────── Offscreen document ─────────────────────────

async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [OFFSCREEN_URL]
  });
  if (existing.length > 0) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["DOM_PARSER", "WORKERS"],
    justification: "Tesseract.js OCR과 WHOIS HTML 파싱."
  });
}

async function sendToOffscreen(msg) {
  await ensureOffscreen();
  return await chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}

// ───────────────────────── Helpers ─────────────────────────

async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ───────────────────────── 영구 denylist ─────────────────────────
// phishing(score>=7) 으로 확정된 호스트를 chrome.storage.local 에 sha256 hash 로 보관.
// 확장 자동 업데이트·SW 재시작·브라우저 재시작에 살아남아 O5/O6 우회를 봉쇄하고
// 재방문 시 LLM 호출을 생략(short-circuit). Remove → Load unpacked 만 소실.
let _denylistCache = null;
async function loadDenylist() {
  if (_denylistCache) return _denylistCache;
  const { phishingDenylist = [] } = await chrome.storage.local.get("phishingDenylist");
  _denylistCache = new Set(phishingDenylist);
  return _denylistCache;
}
async function isDenylisted(host) {
  if (!host) return false;
  const h = await sha256Hex(host.toLowerCase());
  const set = await loadDenylist();
  return set.has(h);
}
async function addToDenylist(host) {
  if (!host) return;
  const h = await sha256Hex(host.toLowerCase());
  const set = await loadDenylist();
  if (set.has(h)) return;
  set.add(h);
  await chrome.storage.local.set({ phishingDenylist: [...set] });
  console.log("denylist += host (hash:", h.slice(0, 12) + "…)");
}

// ───────────────────────── 영구 allowlist (host 단위) ─────────────────────────
// 사용자가 warning.html 또는 verdict.html 에서 "허용" 한 호스트를 chrome.storage.local 에
// 평문 host 로 보관(URL hash 가 아니라 host 그대로 — 쿼리/패스 변형에도 안정적으로 일치).
// 확장 자동 업데이트·SW 재시작·브라우저 재시작에 살아남음. Remove → Load unpacked 만 소실.
let _allowlistCache = null;
async function loadAllowlist() {
  if (_allowlistCache) return _allowlistCache;
  const { allowlistHosts = [] } = await chrome.storage.local.get("allowlistHosts");
  _allowlistCache = new Set(allowlistHosts);
  return _allowlistCache;
}
async function isAllowlisted(host) {
  if (!host) return false;
  const set = await loadAllowlist();
  return set.has(host.toLowerCase());
}
async function addToAllowlist(host) {
  if (!host) return;
  const h = host.toLowerCase();
  const set = await loadAllowlist();
  if (set.has(h)) return;
  set.add(h);
  await chrome.storage.local.set({ allowlistHosts: [...set] });
  console.log("allowlist += host:", h);
}

function registeredDomain(url) {
  try {
    const h = new URL(url).hostname;
    // IPv4 주소(숫자+점)는 전체를 그대로 반환
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h;
    // IPv6 루프백
    if (h === "[::1]" || h === "::1") return "::1";
    const parts = h.split(".");
    if (parts.length <= 2) return h;
    const twoLevelTld = new Set(["co.kr", "or.kr", "go.kr", "ne.kr", "co.jp", "co.uk", "com.au"]);
    const last2 = parts.slice(-2).join(".");
    const last3 = parts.slice(-3).join(".");
    if (parts.length >= 3 && twoLevelTld.has(last2)) return last3;
    return last2;
  } catch { return null; }
}

function isInternalDomain(url) {
  const d = registeredDomain(url);
  return d ? INTERNAL_DOMAINS.includes(d) : false;
}

function isLoopbackUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch {
    return false;
  }
}

function clamp(s, n) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) : s;
}

// ───────────────────────── WHOIS (yesnic 스크래핑) ─────────────────────────

async function fetchWhois(domain) {
  if (!domain) return "WHOIS lookup skipped";
  try {
    const url = `https://yesnic.com/whois/index2.php?domain=${encodeURIComponent(domain)}`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return "WHOIS lookup failed";
    const html = await res.text();
    const text = await sendToOffscreen({ type: "WHOIS_PARSE", html });
    return text || "WHOIS lookup failed";
  } catch (e) {
    console.warn("WHOIS fetch error:", e);
    return "WHOIS lookup failed";
  }
}

// ───────────────────────── Prompt builder ─────────────────────────

function joinAndCap(arr, totalCap) {
  let out = [];
  let used = 0;
  for (const item of arr) {
    const s = typeof item === "string" ? item : JSON.stringify(item);
    if (used + s.length > totalCap) break;
    out.push(s);
    used += s.length + 1;
  }
  return out.join("\n");
}

function formatBehaviors(b) {
  if (!b) return "";
  const lines = [];
  if (b.clipboardWrites?.length) {
    lines.push("clipboardWrites (페이지가 사용자 클립보드에 쓴 내용 — 사용자가 어딘가 붙여넣을 수 있는 텍스트):");
    for (const c of b.clipboardWrites.slice(0, 6)) {
      const t = typeof c === "string" ? c : (c?.text || "");
      const ty = typeof c === "string" ? "" : (c?.type ? `[${c.type}] ` : "");
      lines.push(`  - ${ty}${clamp(t, 400)}`);
    }
  }
  if (b.autoDownloads?.length) {
    lines.push("autoDownloads (스캔 중 자동 시작된 다운로드 — 차단됨):");
    for (const d of b.autoDownloads.slice(0, 5)) {
      lines.push(`  - ${d.filename || "(no name)"} from ${clamp(d.url || "", 120)}`);
    }
  }
  if (b.dangerousUris?.length) {
    lines.push("dangerousUris (위험 URI 스킴 링크):");
    for (const u of b.dangerousUris.slice(0, 5)) lines.push(`  - ${clamp(u, 200)}`);
  }
  if (b.execDownloads?.length) {
    lines.push("execDownloads (실행파일 다운로드 링크):");
    for (const u of b.execDownloads.slice(0, 5)) lines.push(`  - ${clamp(u, 160)}`);
  }
  if (b.socialHits?.length) lines.push("socialHits: " + b.socialHits.slice(0, 6).join(", "));
  if (b.shellHits?.length) lines.push("shellHits: " + b.shellHits.slice(0, 6).join(", "));
  if (b.copyButtons?.length) lines.push("copyButtons: " + b.copyButtons.slice(0, 5).map(s => `"${s}"`).join(", "));
  if (b.codeSnippets?.length) {
    lines.push("codeSnippets (pre/code에서 추출된 명령/코드 스니펫):");
    for (const s of b.codeSnippets.slice(0, 4)) {
      lines.push("  - " + clamp(String(s).replace(/\s+/g, " ").trim(), 420));
    }
  }
  return lines.join("\n");
}

function buildPromptSlices(url, ocr, whois, extracted) {
  return [
    { key: "URL",       value: clamp(url, 500),                                       priority: 1 },
    { key: "WHOIS",     value: clamp(whois, 600),                                     priority: 2 },
    { key: "BEHAVIORS", value: clamp(formatBehaviors(extracted.behaviors), 1500),     priority: 2.5 },
    { key: "FORMS",     value: joinAndCap(extracted.forms || [], 500),                priority: 3 },
    { key: "LINKS",     value: joinAndCap(extracted.anchors || [], 800),              priority: 4 },
    { key: "OCR",       value: clamp(ocr, 800),                                       priority: 5 },
    { key: "TEXT",      value: clamp(extracted.visibleText || "", 1200),              priority: 6 }
  ];
}

function renderSlices(slices) {
  return slices
    .filter(s => s.value && String(s.value).trim().length > 0)
    .map(s => `${s.key}:\n${s.value}`)
    .join("\n\n");
}

async function buildPrompt(session, url, ocr, whois, extracted) {
  let slices = buildPromptSlices(url, ocr, whois, extracted);
  const windowSize = session.inputQuota ?? session.contextWindow ?? 4096;
  let body = renderSlices(slices);
  async function measure(text) {
    if (typeof session.measureInputUsage === "function") {
      return await session.measureInputUsage(text);
    }
    return Math.ceil(text.length / 4);
  }
  let tokens = await measure(body);
  while (tokens > windowSize - PROMPT_OUTPUT_RESERVE && slices.length > 1) {
    // 가장 낮은 우선순위(=숫자 큰) 1개 제거
    slices.sort((a, b) => b.priority - a.priority);
    slices.shift();
    slices.sort((a, b) => a.priority - b.priority);
    body = renderSlices(slices);
    tokens = await measure(body);
  }
  console.log(`prompt tokens=${tokens}/${windowSize}, slices=${slices.map(s => s.key).join(",")}`);
  return body;
}

// ───────────────────────── Hidden tab orchestration ─────────────────────────

function waitForTabComplete(tabId) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("tab load timeout"));
    }, TAB_LOAD_TIMEOUT_MS);
    function listener(updatedId, info) {
      if (updatedId === tabId && info.status === "complete") {
        clearTimeout(to);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// 스캔 중 탭들 — chrome.downloads.onCreated 가 이 탭에서 시작된 다운로드를
// 자동 다운로드 시그널로 기록하고 즉시 취소하기 위해 사용.
const scanningTabs = new Map(); // tabId → { autoDownloads:[] }
const navigationScans = new Map(); // tabId → { url, at }

async function extractFromUrl(url, source, meta) {
  // 1. 활성 탭 주입 (navigation, popup, download) - 스크롤/클릭 봇 동작 없이 조용히 추출
  if ((source === "navigation" || source === "popup" || source === "download-silent-ok") && meta?.tabId != null && meta.tabId >= 0) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: meta.tabId },
        files: ["content_extract.js"]
      });
      if (result?.result) return result.result;
    } catch(e) {
      console.warn("Direct injection failed:", e);
    }
    // 주입 실패(예: chrome:// URL) 시에도 절대 숨김 탭으로 폴백하지 않음
    return { finalUrl: url, forms: [], anchors: [], imgs: [], visibleText: "", behaviors: {} };
  }

  // 2. 백그라운드 자동 스캔 (OWA 메일 자동 검사 등) - 창을 띄우지 않고 fetch로 정적 파싱
  if (source === "owa") {
    try {
      const res = await fetch(url, { redirect: "follow", credentials: "omit" });
      const html = await res.text();
      const parsed = await sendToOffscreen({ type: "PARSE_STATIC_HTML", html, url: res.url });
      if (parsed) return parsed;
    } catch(e) {
      console.warn("Fetch failed for OWA link:", e);
    }
    // OWA 백그라운드 스캔은 절대 숨김 탭(창)을 띄워서는 안 되므로, 실패 시에도 기본 빈 객체 반환
    return { finalUrl: url, forms: [], anchors: [], imgs: [], visibleText: "", behaviors: {} };
  }

  // 3. 명시적 수동 검사 (우클릭 등) 또는 폴백 - 기존처럼 숨김 탭 열어서 완벽한 동적 검사
  return await extractFromHiddenTab(url);
}

async function extractFromHiddenTab(url) {
  // Hidden scan tab을 URL에 `#__pg_scan=1` 마커를 박아서 연다.
  // 페이지에 로드된 click_guard.js가 이 마커를 동기적으로 보고 비활성화 →
  // cascade loop(스캔 tab의 click_guard가 또 스캔 트리거하는 무한반복) 차단.
  // 마커는 hash이므로 서버에 전송 안 됨, 페이지 콘텐츠에 영향 없음.
  const scanUrl = url + (url.includes("#") ? "&" : "#") + "__pg_scan=1";
  const tab = await chrome.tabs.create({ url: scanUrl, active: false });
  scanningTabs.set(tab.id, { autoDownloads: [] });
  try {
    // MAIN-world clipboard hook 을 가능한 빨리 inject.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["clipboard_hook.js"],
        world: "MAIN",
        injectImmediately: true
      });
    } catch (e) { /* tab may not be ready */ }

    await waitForTabComplete(tab.id).catch(e => console.warn(e.message));
    // load complete 이후 페이지 JS 추가 실행 여유
    await new Promise(r => setTimeout(r, 800));

    // Lazy-loaded/accordion 콘텐츠(설치 가이드/코드블록)가 접혀있거나 스크롤 후에만 로드되는 경우가 많음.
    // 스캔 탭에서만 최소한의 "펼치기/스크롤"을 수행해 정적 추출 성공률을 올린다.
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "ISOLATED",
        func: async () => {
          try {
            // 1) details/summary 펼치기
            for (const d of document.querySelectorAll("details")) {
              d.open = true;
            }
            // 2) aria-expanded 기반 아코디언 펼치기(링크 제외)
            const re = /(install|setup|quick\s*install|script\s*editor|execute|run|macos|windows|powershell|terminal|download)/i;
            const btns = [...document.querySelectorAll('button[aria-expanded="false"], [role="button"][aria-expanded="false"]')].slice(0, 40);
            for (const b of btns) {
              const t = ((b.innerText || b.textContent || "") + " " + (b.getAttribute("aria-label") || "")).trim();
              if (!t) continue;
              if (re.test(t)) {
                b.click();
              }
            }
            // 2.5) CTA 클릭으로 설치 섹션/모달 노출 유도 (피싱 페이지들이 "Download→Install" 흐름으로 숨기는 경우)
            const ctaRe = /^\s*(download|get the app|install|execute)\s*$/i;
            const candidates = [...document.querySelectorAll("button, a, [role='button']")].slice(0, 120);
            for (const el of candidates) {
              const t = ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).trim();
              if (!t || !ctaRe.test(t)) continue;
              // 외부 네비게이션은 피함 (같은 오리진/해시만 허용)
              if (el.tagName === "A") {
                const href = el.getAttribute("href") || "";
                if (/^https?:/i.test(href)) {
                  try {
                    const u = new URL(href, location.href);
                    if (u.origin !== location.origin) continue;
                  } catch { continue; }
                }
              }
              try { el.click(); } catch {}
              break;
            }
            // 3) 스크롤로 lazy render 유도 (IntersectionObserver/virtual list 대응)
            try {
              const h = document.body.scrollHeight || 0;
              const steps = 8;
              for (let i = 0; i <= steps; i++) {
                window.scrollTo(0, Math.floor((h * i) / steps));
                await new Promise(r => setTimeout(r, 220));
              }
              window.scrollTo(0, 0);
            } catch {}
          } catch {}
        }
      });
      await new Promise(r => setTimeout(r, 1200));
    } catch {}
    // 2차 inject (페이지가 hook 전에 navigate 된 경우 등 안전망)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["clipboard_hook.js"],
        world: "MAIN"
      });
    } catch {}
    // 페이지 JS 의 onLoad 단계에서 clipboard 호출되는 경우는 clipboard_hook이 이미 캐치.
    // 버튼 자동 클릭으로 dynamic clipboard 노출하는 시도는 click_guard와 cascade loop를
    // 유발하므로 제거. dynamic ClickFix는 사용자가 실제 클릭해야 일어나는 패턴이라
    // 우리 검사 단계에서는 정적/onLoad 시그널만으로 충분히 위험 추론 가능.

    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content_extract.js"]
    });
    const extracted = result?.result || null;
    // 다운로드 시그널 머지
    if (extracted) {
      const sigs = scanningTabs.get(tab.id);
      extracted.behaviors = extracted.behaviors || {};
      extracted.behaviors.autoDownloads = sigs?.autoDownloads || [];
    }
    return extracted;
  } finally {
    scanningTabs.delete(tab.id);
    try { await chrome.tabs.remove(tab.id); } catch {}
  }
}

// ───────────────────────── 캐시 ─────────────────────────

async function cacheGet(key) {
  const o = await chrome.storage.session.get(key);
  return o[key];
}
async function cacheSet(key, val) {
  await chrome.storage.session.set({ [key]: val });
}

// ───────────────────────── 핵심: scanUrl ─────────────────────────

async function scanUrl(url, source, meta = {}) {
  if (!url || !/^https?:/i.test(url)) {
    return { error: "scannable_url_required" };
  }
  const internalDomain = isInternalDomain(url);
  const bypassLookup = !!meta?.bypassCache || isLoopbackUrl(url);
  const key = "v:" + (await sha256Hex(url));
  // 평가 사이클용 bypassCache 플래그 — 캐시·allowlist 우회.
  if (!bypassLookup) {
    let allowlistHost = "";
    try { allowlistHost = new URL(url).hostname.toLowerCase(); } catch {}
    if (allowlistHost && await isAllowlisted(allowlistHost)) {
      const allowed = {
        phishing_score: 0, brand: null, phishing: false,
        suspicious_domain: false,
        reason: `사용자가 이 호스트(${allowlistHost})를 허용함`,
        url, ts: Date.now()
      };
      await dispatchResult(source, url, allowed, { ...meta, allowed: true });
      return allowed;
    }
    const cached = await cacheGet(key);
    if (cached) {
      await dispatchResult(source, url, cached, { ...meta, cached: true });
      return cached;
    }
    // 영구 denylist hit — LLM/추출/OCR 전부 생략하고 phishing 으로 short-circuit.
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host && await isDenylisted(host)) {
        const denied = {
          phishing_score: 8, brand: null, phishing: true,
          suspicious_domain: true,
          reason: "이전 검사에서 피싱으로 판정된 호스트 (영구 기록) — LLM 재검사 생략",
          url, ts: Date.now()
        };
        await cacheSet(key, denied);
        await chrome.storage.session.set({ lastVerdict: denied });
        await dispatchResult(source, url, denied, { ...meta, denylisted: true });
        return denied;
      }
    } catch {}
  }
  let extracted, ocr = "", whois = "WHOIS lookup skipped";
  try {
    extracted = await extractFromUrl(url, source, meta);
    if (!extracted) extracted = { finalUrl: url, forms: [], anchors: [], imgs: [], visibleText: "" };
    if (internalDomain && !hasInternalBypassRisk(extracted)) {
      const safe = {
        phishing_score: 0, brand: null, phishing: false,
        suspicious_domain: false, reason: "사내 신뢰 도메인 — 위험 행위 없음, 모델 호출 생략",
        url, ts: Date.now()
      };
      if (!bypassLookup) await cacheSet(key, safe);
      await chrome.storage.session.set({ lastVerdict: safe });
      await dispatchResult(source, url, safe, { ...meta, skipped: true });
      return safe;
    }
    [ocr, whois] = await Promise.all([
      extracted.imgs?.length
        ? sendToOffscreen({ type: "OCR", imgs: extracted.imgs, base: extracted.finalUrl }).catch(() => "")
        : Promise.resolve(""),
      internalDomain
        ? Promise.resolve("WHOIS lookup skipped (internal domain)")
        : fetchWhois(registeredDomain(extracted.finalUrl || url))
    ]);
  } catch (e) {
    console.warn("extract/whois/ocr failed:", e);
    extracted = extracted || { finalUrl: url, forms: [], anchors: [], imgs: [], visibleText: "" };
  }

  const a = await checkAvailability();
  if (a === "unavailable") {
    return { error: "model_unavailable", availability: a };
  }
  const canStartDownload = new Set(["popup", "contextMenu", "click-guard"]).has(source);
  if (a !== "available" && !canStartDownload) {
    return { error: "model_download_required", availability: a };
  }

  const session = await ensureSession();
  const body = await buildPrompt(session, extracted.finalUrl || url, ocr, whois, extracted);
  let raw;
  try {
    raw = await session.prompt(body, { responseConstraint: VERDICT_SCHEMA, omitResponseConstraintInput: true, outputLanguage: "en" });
  } catch (e) {
    console.warn("LM.prompt failed:", e);
    return { error: "model_error", message: String(e) };
  }
  let verdict;
  try { verdict = JSON.parse(raw); }
  catch {
    const m = raw.match(/\{[\s\S]*\}/);
    try { verdict = m ? JSON.parse(m[0]) : null; } catch { verdict = null; }
  }
  if (!verdict) {
    console.warn("verdict parse failed, raw:", raw);
    return { error: "parse_failed", raw };
  }
  verdict.brand = normalizeBrand(verdict.brand);
  // ── 결정론적 후처리 오버라이드 ──
  await applyOverrides(verdict, extracted, url);
  // 강한 phishing 으로 확정된 호스트는 영구 denylist 에 기록.
  // O5/O6 가 우회한 케이스는 verdict.phishing 이 false 가 되므로 자연스럽게 제외.
  if (verdict.phishing === true && (verdict.phishing_score ?? 0) >= 7) {
    try {
      const finalHost = new URL(extracted?.finalUrl || url).hostname.toLowerCase();
      if (finalHost) await addToDenylist(finalHost);
    } catch {}
  }
  verdict.url = url;
  verdict.ts = Date.now();
  await cacheSet(key, verdict);
  await chrome.storage.session.set({ lastVerdict: verdict });
  await dispatchResult(source, url, verdict, meta);
  return verdict;
}

// ───────────────────────── 결과 처리(source별 분기) ─────────────────────────

function severityFor(v) {
  if (v.phishing || (v.phishing_score ?? 0) >= 7) return "danger";
  if ((v.phishing_score ?? 0) >= 4) return "warn";
  return "ok";
}

async function notify(severity, title, body, verdictId) {
  const prefix = { ok: "[안전]", warn: "[주의]", danger: "[피싱]" };
  const { notifIcons = {} } = await chrome.storage.local.get("notifIcons");
  const iconUrl = notifIcons[severity] || FALLBACK_NOTIF_ICON;
  await chrome.notifications.create(verdictId || `v_${Date.now()}`, {
    type: "basic",
    iconUrl,
    title: `${prefix[severity] || ""} ${title}`,
    message: body,
    priority: severity === "danger" ? 2 : 0,
    requireInteraction: severity === "danger"
  });
}

// ───────────────────────── 결정론적 후처리 오버라이드 ─────────────────────────
// 모델은 작은 온디바이스라 추론이 약함. 명백한 패턴은 코드로 강제 판정.

// 셸 명령으로 보이는 페이로드(쉘 직접·난독화·파이프 포함)
// NOTE: ClickFix는 curl/wget 이후 파이프 체인이 길어질 수 있어 범위를 넉넉히 둔다.
const SHELL_PAYLOAD_RE = /(?:\bcurl\b[\s\S]{0,12000}\|\s*(?:bash|sh|zsh|fish)\b|\bwget\b[\s\S]{0,12000}\|\s*(?:bash|sh|zsh|fish)\b|\bpowershell(?:\s|\.exe)|\biex\s*\(|\bInvoke-(?:Expression|WebRequest)\b|\bmshta\b|\bcmd\.exe\b|\beval\s*\(|\btr\s+['"][\w./:]+['"]\s+['"][\w./:]+['"]|\bbase64\s+-d\b|\bcertutil\s+-(?:urlcache|decode)\b|\bchmod\s+\+x\b)/i;
// 위험 커스텀 URI 스킴
const DANGEROUS_URI_RE = /^(applescript|ms-msdt|ms-msvr|ms-search|search-ms|shell|vbscript|jar|chrome|about):/i;
// 다운로드 강제 확장자
const EXEC_EXT_RE = /\.(exe|dmg|pkg|msi|bat|cmd|ps1|vbs|jar|scr|hta|app|command|scpt|sh|run|deb|rpm|appimage)(\?|$)/i;

function normalizeBrand(brand) {
  const b = (brand ?? "").toString().trim();
  if (!b) return null;
  const lower = b.toLowerCase();
  // 모델이 도메인 문자열을 브랜드로 반환하는 케이스를 흡수
  if (lower === "claude.ai" || lower === "claude.com" || lower === "code.claude.com") return "Claude";
  if (lower === "anthropic" || lower === "anthropic.com") return "Anthropic";
  if (lower === "chatgpt.com" || lower === "openai.com") return "OpenAI";
  // "brand": "claude.ai (docs)" 같은 변형 완화
  if (/\bclaude\b/.test(lower)) return "Claude";
  if (/\banthropic\b/.test(lower)) return "Anthropic";
  return b;
}

function isDocLikeFreeHosting(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  // github.io는 문서/블로그 FP가 매우 많아 예외 취급
  return /(?:^|\.)github\.io$/.test(h);
}

function hasCredentialLikeForms(extracted) {
  const forms = extracted?.forms || [];
  const s = forms.join(" ").toLowerCase();
  // content_extract.js가 직렬화한 태그 스니펫에 기반한 매우 러프한 휴리스틱
  return (
    /type="password"/.test(s) ||
    /autocomplete="current-password"/.test(s) ||
    /\bname="password"\b/.test(s) ||
    /\bplaceholder="password"\b/.test(s) ||
    /\bname="email"\b/.test(s) ||
    /\btype="email"\b/.test(s)
  );
}

function hasShellClipboardPayload(extracted) {
  const clips = extracted?.behaviors?.clipboardWrites || [];
  for (const c of clips) {
    const text = (typeof c === "string") ? c : (c?.text || "");
    if (SHELL_PAYLOAD_RE.test(text)) return true;
  }
  return false;
}

function hasInternalBypassRisk(extracted) {
  const b = extracted?.behaviors || {};
  return (
    hasShellClipboardPayload(extracted) ||
    (b.autoDownloads?.length > 0) ||
    (b.dangerousUris?.length > 0) ||
    (hasShellPayloadInPageText(extracted) && hasClickFixLikeInstruction(extracted))
  );
}

function hasShellPayloadInPageText(extracted) {
  const text = (extracted?.visibleText || "").slice(0, 8000);
  if (SHELL_PAYLOAD_RE.test(text)) return true;
  // 링크/버튼 텍스트에도 페이로드가 끼는 경우가 있어 보조로 체크
  const anchors = (extracted?.anchors || []).join("\n").slice(0, 4000);
  if (SHELL_PAYLOAD_RE.test(anchors)) return true;
  const copyButtons = (extracted?.behaviors?.copyButtons || []).join("\n").slice(0, 2000);
  if (SHELL_PAYLOAD_RE.test(copyButtons)) return true;
  const codeSnippets = (extracted?.behaviors?.codeSnippets || []).join("\n").slice(0, 8000);
  if (SHELL_PAYLOAD_RE.test(codeSnippets)) return true;
  return false;
}

function hasObfuscationInText(extracted) {
  const text = ((extracted?.visibleText || "") + "\n" + (extracted?.anchors || []).join("\n")).slice(0, 12000);
  // 흔한 난독화/다운로드-실행 체인 단서
  return /(?:\$\(\s*echo\b|\|\s*tr\s+['"][^'"]+['"]\s+['"][^'"]+['"]|\bbase64\b|\bopenssl\b|\bxargs\b|\beval\s*\(|\bpython\s+-c\b|\bnode\s+-e\b)/i.test(text);
}

function hasClickFixLikeInstruction(extracted) {
  const social = extracted?.behaviors?.socialHits || [];
  if (social.length > 0) return true;
  const btns = (extracted?.behaviors?.copyButtons || []).join(" ").toLowerCase();
  if (/(execute|run|open the script|script editor|paste|복사|붙여넣|실행|터미널|powershell|win\+r)/i.test(btns)) return true;
  const text = (extracted?.visibleText || "").slice(0, 12000);
  return /(click the execute button|open the script|script editor|paste (?:it )?into (?:terminal|powershell)|press win\+r|run dialog|copy (?:and )?paste|실행 버튼|스크립트 편집기|붙여넣)/i.test(text);
}

function hasObfuscatedCurlPipeToShell(extracted) {
  const t = ((extracted?.visibleText || "") + "\n" + (extracted?.behaviors?.codeSnippets || []).join("\n")).slice(0, 20000);
  // 전형적인 난독화 설치 체인: curl ... $(echo '...' | tr '...' '...') | zsh/bash/sh
  return /\bcurl\b[\s\S]{0,20000}\$\(\s*echo\b[\s\S]{0,20000}\|\s*tr\s+['"][^'"]+['"]\s+['"][^'"]+['"][\s\S]{0,20000}\)\s*\|\s*(?:bash|sh|zsh)\b/i.test(t);
}

// 사용자 신뢰 도메인 캐시 — SW 수명 동안 유지 (lazy 초기화)
let _userTrustedDomains = null;

async function getUserTrustedDomains() {
  if (_userTrustedDomains) return _userTrustedDomains;
  const trusted = new Set();

  // 1. 즐겨찾기 — 사용자가 명시적으로 저장한 사이트 (가장 강한 신뢰)
  try {
    const bookmarks = await chrome.bookmarks.search({});
    for (const b of bookmarks) {
      const d = registeredDomain(b.url || "");
      if (d) trusted.add(d);
    }
  } catch {}

  // 2. 방문 기록 — 90일 내 10회 이상 방문한 도메인
  try {
    const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
    const items = await chrome.history.search({ text: "", maxResults: 500, startTime: cutoff });
    for (const item of items) {
      if ((item.visitCount || 0) >= 10) {
        const d = registeredDomain(item.url || "");
        if (d) trusted.add(d);
      }
    }
  } catch {}

  // 3. Top Sites — Chrome 뉴탭 기준 상위 20개
  try {
    const top = await chrome.topSites.get();
    for (const s of top) {
      const d = registeredDomain(s.url || "");
      if (d) trusted.add(d);
    }
  } catch {}

  _userTrustedDomains = trusted;
  return trusted;
}

async function applyOverrides(verdict, extracted, url) {
  const overrides = [];
  let finalHost = "", origHost = "";
  try { finalHost = new URL(extracted?.finalUrl || url).hostname.toLowerCase(); } catch {}
  try { origHost  = new URL(url).hostname.toLowerCase(); } catch {}
  const finalOnFree = finalHost && FREE_HOSTING_RE.test(finalHost);
  const origOnFree  = origHost  && FREE_HOSTING_RE.test(origHost);

  // [O0] 사용자가 클릭한 원본 URL이 free-hosting인데 페이지가 정식 브랜드 도메인으로 redirect됨 — 회피형 피싱
  if (origOnFree && !finalOnFree && origHost !== finalHost) {
    overrides.push({
      rule: "O0",
      sev: "danger",
      reason: `회피형 redirect: 원본(${origHost})이 무료 호스팅인데 정식 도메인(${finalHost})로 우회 redirect — 분석 회피 의심`
    });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 8);
    verdict.suspicious_domain = true;
  }

  // [O1] 브랜드 ↔ 정식 도메인 불일치 (가장 흔한 사칭 케이스)
  if (verdict.brand) {
    const officialList = OFFICIAL_DOMAINS[verdict.brand]
      || OFFICIAL_DOMAINS[verdict.brand.replace(/\s+AI$/i, "")]
      || OFFICIAL_DOMAINS[verdict.brand.split(/\s+/)[0]];
    if (officialList) {
      const highConfidencePhishEvidence =
        hasCredentialLikeForms(extracted) ||
        hasShellClipboardPayload(extracted) ||
        (extracted?.behaviors?.autoDownloads?.length > 0) ||
        (extracted?.behaviors?.dangerousUris?.length > 0);
      // 페이지 텍스트의 셸 커맨드는 개발 문서에도 흔하다.
      // github.io 같은 문서형 호스팅에서는 이 신호만으로 피싱 확정하지 않는다.
      const shellInstructionEvidence =
        (hasShellPayloadInPageText(extracted) && (hasObfuscationInText(extracted) || hasClickFixLikeInstruction(extracted))) ||
        hasObfuscatedCurlPipeToShell(extracted);

      // finalHost와 origHost 둘 다 체크 — 어느 한쪽이라도 매칭 안 되고 free-hosting이면 danger
      const hostsToCheck = [...new Set([finalHost, origHost].filter(Boolean))];
      const offenders = hostsToCheck.filter(h =>
        !officialList.some(d => h === d || h.endsWith("." + d))
      );
      if (offenders.length > 0) {
        const offendingFreeHost = offenders.find(h => FREE_HOSTING_RE.test(h));
        if (offendingFreeHost) {
          const strongPhishEvidence = isDocLikeFreeHosting(offendingFreeHost)
            ? (highConfidencePhishEvidence || hasObfuscatedCurlPipeToShell(extracted))
            : (highConfidencePhishEvidence || shellInstructionEvidence);
          if (strongPhishEvidence) {
            overrides.push({
              rule: "O1",
              sev: "danger",
              reason: `브랜드 사칭 + 무료 호스팅: '${verdict.brand}' 정식 도메인은 ${officialList[0]} 인데 페이지는 ${offendingFreeHost}`
            });
            verdict.phishing = true;
            verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 9);
            verdict.suspicious_domain = true;
          } else {
            // 블로그/문서(예: github.io)에서 특정 브랜드를 "언급"하는 경우까지 피싱으로 강제하면 FP가 급증.
            // free-hosting + 브랜드 언급은 "의심 도메인" 정도로만 올리고, 피싱 강제는 다른 증거가 있을 때만.
            overrides.push({
              rule: "O1",
              sev: "warn",
              reason: isDocLikeFreeHosting(offendingFreeHost)
                ? `문서형 GitHub Pages: '${verdict.brand}' 브랜드를 언급하지만 클립보드 페이로드/위험 URI/자동 다운로드/로그인 폼 없음`
                : `브랜드 언급 + 무료 호스팅: '${verdict.brand}' 정식 도메인은 ${officialList[0]} 이지만 페이지는 ${offendingFreeHost} (단독 증거로 피싱 확정 금지)`,
              suppressModelReason: isDocLikeFreeHosting(offendingFreeHost)
            });
            // github.io는 "문서/블로그" FP가 매우 많아 예외로 낮게 캡핑.
            // 그 외 workers.dev/pages.dev 등은 브랜드 사칭이 실제로 매우 흔하므로, 추가 증거가 없어도 피싱으로 올린다.
            if (isDocLikeFreeHosting(offendingFreeHost)) {
              verdict.phishing = false;
              verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
              verdict.suspicious_domain = false;
            } else {
              verdict.phishing = true;
              verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 7);
              verdict.suspicious_domain = true;
            }
          }
        } else {
          overrides.push({
            rule: "O1",
            sev: "warn",
            reason: `브랜드 도메인 불일치: '${verdict.brand}' 정식 도메인(${officialList[0]})이 아닌 ${offenders[0]}`
          });
          verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 6);
          verdict.suspicious_domain = true;
        }
      } else {
        // 모든 호스트가 정식 도메인에 매칭 → 모델 오판정 완화 (강제 0이 아닌 상한 캡핑)
        // 다른 오버라이드(O2/O3/O4)가 있으면 여전히 위험 판정 가능
        overrides.push({
          rule: "O1-safe",
          sev: "safe",
          reason: `정식 브랜드 도메인: '${verdict.brand}' 공식 도메인(${officialList[0]})에서 호스팅됨`,
          suppressModelReason: true
        });
        verdict.phishing = false;
        verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
        verdict.suspicious_domain = false;
      }
    }
  }

  // [O2] 클립보드 쓰기 내용이 쉘 페이로드 — ClickFix 핵심 시그널
  const clips = extracted?.behaviors?.clipboardWrites || [];
  for (const c of clips) {
    const text = (typeof c === "string") ? c : (c?.text || "");
    if (SHELL_PAYLOAD_RE.test(text)) {
      overrides.push({ rule: "O2", sev: "danger", reason: `클립보드에 쉘 페이로드 복사: ${text.slice(0, 120)}` });
      verdict.phishing = true;
      verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 10);
      break;
    }
  }

  // [O3] 스캔 중 자동 다운로드 시도
  const autoDl = extracted?.behaviors?.autoDownloads || [];
  if (autoDl.length > 0) {
    const f = autoDl[0]?.filename || autoDl[0]?.url || "(unknown)";
    overrides.push({ rule: "O3", sev: "danger", reason: `자동 다운로드 시도(${autoDl.length}개): ${f}` });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 9);
  }

  // [O4] 위험 URI 스킴 링크 존재
  const dangerUris = extracted?.behaviors?.dangerousUris || [];
  if (dangerUris.length > 0) {
    overrides.push({ rule: "O4", sev: "danger", reason: `위험 URI 스킴 링크: ${dangerUris.slice(0,3).join(", ")}` });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 9);
  }

  // [D1] 영구 denylist hit — 이전에 phishing(>=7)으로 확정된 호스트.
  // O5/O6 가 우회하지 못하도록 danger 푸시. allowlist 는 scanUrl 상단에서 이미 처리됨.
  if (finalHost && await isDenylisted(finalHost)) {
    overrides.push({ rule: "D1", sev: "danger", reason: `영구 denylist 일치 — 이전 검사에서 피싱으로 판정된 호스트: ${finalHost}` });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 8);
    verdict.suspicious_domain = true;
  }

  // [O5] 사용자 개인 신뢰 도메인 (즐겨찾기 / 빈번 방문 / Top Sites)
  if (!overrides.some(o => o.sev === "danger") && finalHost) {
    try {
      const trustedDomains = await getUserTrustedDomains();
      // shared-hosting eTLD-like 도메인(workers.dev, pages.dev, github.io 등)이 슬라이스
      // 폴백으로 통째 신뢰되지 않도록 가드. 사용자가 *.workers.dev 의 다른 합법 워커를
      // 방문해서 workers.dev 가 trusted Set 에 올라와도 매칭 거부.
      const sliceCandidate = finalHost.includes(".")
        ? finalHost.split(".").slice(-2).join(".")
        : null;
      const sliceIsSharedHosting = sliceCandidate
        ? FREE_HOSTING_RE.test(sliceCandidate)
        : false;
      const o5Domain = trustedDomains.has(finalHost)
        ? finalHost
        : (sliceCandidate && !sliceIsSharedHosting && trustedDomains.has(sliceCandidate))
          ? sliceCandidate
          : null;
      if (o5Domain) {
        overrides.push({ rule: "O5", sev: "safe",
          reason: `사용자 신뢰 도메인 (즐겨찾기/방문기록/TopSites): ${o5Domain}`,
          suppressModelReason: true });
        verdict.phishing = false;
        verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
        verdict.suspicious_domain = false;
      }
    } catch {}
  }

  // [O6] 공개 랭킹 기반 국내 인기 도메인 — 위험 신호 없으면 FP 방지
  if (!overrides.some(o => o.sev === "danger")) {
    // POPULAR_KR_DOMAINS 갱신 사고로 shared-hosting 이 들어와도 슬라이스 폴백이 안 먹게 방어.
    const o6SliceCandidate = finalHost && finalHost.includes(".")
      ? finalHost.split(".").slice(-2).join(".")
      : null;
    const o6SliceIsSharedHosting = o6SliceCandidate
      ? FREE_HOSTING_RE.test(o6SliceCandidate)
      : false;
    const o6Domain = finalHost && POPULAR_KR_DOMAINS.has(finalHost)
      ? finalHost
      : (o6SliceCandidate && !o6SliceIsSharedHosting && POPULAR_KR_DOMAINS.has(o6SliceCandidate))
        ? o6SliceCandidate
        : null;
    if (o6Domain) {
      overrides.push({ rule: "O6", sev: "safe",
        reason: `공개 랭킹 인기 도메인: ${o6Domain}`, suppressModelReason: true });
      verdict.phishing = false;
      verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
      verdict.suspicious_domain = false;
    }
  }

  if (overrides.length > 0) {
    const prefix = "[자동 오버라이드: " + overrides.map(o => o.rule).join("+") + "] "
      + overrides.map(o => o.reason).join(" · ") + ". ";
    const suppressModelReason = overrides.some(o => o.suppressModelReason) && !overrides.some(o => o.sev === "danger");
    verdict.reason = suppressModelReason ? prefix : prefix + (verdict.reason || "");
    console.log("applyOverrides:", overrides);
  }
}

async function dispatchResult(source, url, verdict, meta) {
  const sev = severityFor(verdict);
  const head = sev === "danger" ? "피싱 의심" : sev === "warn" ? "주의" : "안전";
  const reason = verdict.reason || "";
  const tail = meta?.cached ? " (캐시)" : meta?.skipped ? " (사내 도메인)" : meta?.allowed ? " (사용자 허용)" : "";

  if (source === "owa" && meta?.tabId != null) {
    try {
      await chrome.tabs.sendMessage(meta.tabId, {
        type: "verdict-banner",
        url, verdict, severity: sev, anchorId: meta.anchorId
      });
    } catch (e) { /* tab gone */ }
    return;
  }

  // 위험 + 사용자가 활성 탭에 있는 경우(action/popup/navigation/download) → 탭 가로채기.
  // contextMenu는 사용자가 아직 방문 안 했으므로 알림만.
  // 사용자의 적극적 액션(navigation/action/popup)은 fresh user intent 이므로 캐시 hit 이어도 intercept 발화.
  // 그렇지 않으면 OWA pre-scan 의 캐시가 click-time warning.html 가로채기를 죽임.
  const interceptSources = new Set(["action", "popup", "navigation", "download-silent-ok"]);
  const isUserIntent = source === "navigation" || source === "action" || source === "popup";
  if (sev === "danger" && !meta?.allowed && (isUserIntent || !meta?.cached) && interceptSources.has(source) && meta?.tabId != null) {
    try {
      const vid = await sha256Hex(url);
      await chrome.storage.session.set({ ["verdict:" + vid]: verdict });
      const target = `${WARNING_URL}?u=${encodeURIComponent(url)}&vid=${vid}`;
      await chrome.tabs.update(meta.tabId, { url: target });
      return; // 알림 생략 — 경고 페이지가 더 강함
    } catch (e) {
      console.warn("tab intercept failed, falling back to notification:", e);
    }
  }

  if (source === "download-silent-ok") {
    if (sev !== "danger") return; // 안전 다운로드는 무알림
  }
  if (source === "navigation" && sev === "ok") {
    return; // 일반 브라우징에서 안전 알림은 과도하게 시끄럽다.
  }

  await notify(sev, `${head}${tail}`, `${url}\n${clamp(reason, 200)}`);
}

// ───────────────────────── 트리거 핸들러 ─────────────────────────

// A. 컨텍스트 메뉴
async function regenerateIcons() {
  try {
    const icons = await sendToOffscreen({ type: "GENERATE_ICONS" });
    if (!icons) return;
    if (icons.action) {
      await chrome.action.setIcon({ imageData: icons.action });
    }
    if (icons.dataUrls) {
      await chrome.storage.local.set({ notifIcons: icons.dataUrls });
    }
    console.log("icons generated:", Object.keys(icons.action || {}));
  } catch (e) {
    console.warn("icon generation failed:", e);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.contextMenus.create({
      id: "scan-link",
      title: "이 링크 피싱 검사",
      contexts: ["link"]
    });
  } catch (e) { /* duplicate */ }
  await regenerateIcons();
  await updateBadge();
});
chrome.runtime.onStartup.addListener(async () => {
  // 콜드 스타트 시 storage.local의 아이콘이 살아있는지 점검 — 없으면 재생성
  const { notifIcons } = await chrome.storage.local.get("notifIcons");
  if (!notifIcons || !notifIcons.ok) {
    await regenerateIcons();
  } else {
    // 액션 아이콘은 setIcon 호출이 SW 세션마다 필요할 수 있음
    await regenerateIcons();
  }
  await updateBadge();
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "scan-link" && info.linkUrl) {
    scanUrl(info.linkUrl, "contextMenu").catch(e => console.warn(e));
  }
});

// A-2. 주소창 입력/북마크/외부 앱 링크처럼 브라우저가 직접 연 활성 탭 검사.
// hidden scan tab은 inactive + `#__pg_scan=1` 마커라 여기서 제외된다.
function maybeScanNavigation(tabId, url, tab = {}) {
  if (!url || !/^https?:/i.test(url)) return;
  if (url.includes("__pg_scan=1")) return;
  if (scanningTabs.has(tabId)) return;
  if (tab.active === false) return;

  const last = navigationScans.get(tabId);
  const now = Date.now();
  if (last?.url === url && now - last.at < NAVIGATION_SCAN_COOLDOWN_MS) return;
  navigationScans.set(tabId, { url, at: now });

  scanUrl(url, "navigation", { tabId }).catch(e => {
    console.warn("navigation scan failed:", e);
  });
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== "complete") return;
  maybeScanNavigation(tabId, tab.url || info.url, tab);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") maybeScanNavigation(tabId, tab.url, tab);
  } catch {}
});

chrome.tabs.onRemoved.addListener((tabId) => {
  navigationScans.delete(tabId);
});

// B/C. popup·content script 메시지
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "offscreen") return false; // 라우팅용, SW 무시

  // 디버그용: 모델 호출 없이 DOM 추출 결과 확인
  if (msg?.type === "debug-extract" && msg.url) {
    (async () => {
      try {
        const extracted = await extractFromUrl(msg.url);
        sendResponse({ ok: true, extracted });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (msg?.type === "scan" && msg.url) {
    const source = msg.source || "popup";
    const tabId = sender.tab?.id ?? (Number.isInteger(msg.tabId) ? msg.tabId : undefined);
    const meta = { tabId, anchorId: msg.anchorId, bypassCache: !!msg.bypassCache };
    scanUrl(msg.url, source, meta).then(sendResponse).catch(e => sendResponse({ error: String(e) }));
    return true; // async
  }
  if (msg?.type === "availability") {
    checkAvailability().then(a => sendResponse({ ...modelStatus(), availability: a }));
    return true;
  }
  if (msg?.type === "prepare-model") {
    ensureSession()
      .then(() => sendResponse(modelStatus()))
      .catch(e => sendResponse({ ...modelStatus(), error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "model-status") {
    sendResponse(modelStatus());
    return true;
  }
  if (msg?.type === "diagnostics") {
    (async () => {
      const modelAvailability = await checkAvailability();
      let ocrInfo = { ocrAvailable: false, ocrLanguages: [], tesseractFilesPresent: [] };
      try {
        ocrInfo = await sendToOffscreen({ type: "OCR_DIAGNOSTICS" });
      } catch {}
      const tesseractFilesPresent = [];
      const expectedFiles = [
        "lib/tesseract.min.js", "lib/worker.min.js",
        "lib/tesseract-core.wasm.js", "lib/eng.traineddata", "lib/kor.traineddata"
      ];
      for (const f of expectedFiles) {
        try {
          const url = chrome.runtime.getURL(f);
          const res = await fetch(url, { method: "HEAD" });
          if (res.ok) tesseractFilesPresent.push(f);
        } catch {}
      }
      sendResponse({
        modelAvailability,
        ocrAvailable: ocrInfo.available ?? false,
        ocrLanguages: ocrInfo.languages ?? [],
        tesseractFilesPresent
      });
    })();
    return true;
  }
  if (msg?.type === "clickGuardInit") {
    // [deprecated] click_guard.js 가 이제 URL hash 마커로 동기 판별. 호환을 위해 응답만 유지.
    const tabId = sender.tab?.id;
    sendResponse({ isScanningTab: tabId != null && scanningTabs.has(tabId) });
    return false;
  }
  if (msg?.type === "allowlist" && msg.url) {
    (async () => {
      let host;
      try { host = new URL(msg.url).hostname.toLowerCase(); }
      catch { sendResponse({ ok: false, error: "invalid_url" }); return; }
      if (!host) { sendResponse({ ok: false, error: "empty_host" }); return; }
      await addToAllowlist(host);
      sendResponse({ ok: true, host });
    })();
    return true;
  }
  if (msg?.type === "closeTab") {
    const tabId = sender.tab?.id;
    if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "getVerdict") {
    if (msg.vid) {
      chrome.storage.session.get("verdict:" + msg.vid).then(o => {
        sendResponse(o["verdict:" + msg.vid] || null);
      });
      return true;
    }
    if (msg.url) {
      (async () => {
        const key = "v:" + (await sha256Hex(msg.url));
        const cached = await cacheGet(key);
        sendResponse(cached || null);
      })();
      return true;
    }
  }
});

// D. 다운로드 트리거
chrome.downloads.onCreated.addListener(async (item) => {
  if (!item || item.state !== "in_progress") return;

  // 스캔 중인 hidden 탭에서 시작된 다운로드 → 자동 다운로드 시그널로만 기록하고 즉시 취소.
  // 절대 재귀 스캔으로 들어가지 않음.
  if (item.tabId != null && scanningTabs.has(item.tabId)) {
    const sigs = scanningTabs.get(item.tabId);
    sigs.autoDownloads.push({
      url: item.url, filename: item.filename || "", referrer: item.referrer || "", mime: item.mime || ""
    });
    try { await chrome.downloads.cancel(item.id); } catch {}
    try { await chrome.downloads.erase({ id: item.id }); } catch {}
    console.log("auto-download blocked during scan:", item.url);
    return;
  }

  let hostPage = (item.referrer && /^https?:/.test(item.referrer)) ? item.referrer : null;
  if (!hostPage && item.tabId != null && item.tabId >= 0) {
    try {
      const t = await chrome.tabs.get(item.tabId);
      if (t?.url && /^https?:/.test(t.url)) hostPage = t.url;
    } catch {}
  }
  if (!hostPage) return;
  if (isInternalDomain(hostPage)) return;

  try { await chrome.downloads.pause(item.id); } catch {}

  const downloadMeta = (item.tabId != null && item.tabId >= 0) ? { tabId: item.tabId } : {};
  const verdict = await scanUrl(hostPage, "download-silent-ok", downloadMeta).catch(() => null);
  const danger = verdict && (verdict.phishing || (verdict.phishing_score ?? 0) >= 7);
  if (danger) {
    try { await chrome.downloads.cancel(item.id); } catch {}
    try { await chrome.downloads.erase({ id: item.id }); } catch {}
    await notify("danger", "다운로드 취소", `피싱 의심 페이지(${hostPage})에서 시작된 파일을 차단했습니다.`);
  } else {
    try { await chrome.downloads.resume(item.id); } catch {}
  }
});

// 알림 클릭 → verdict 상세
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("verdict.html") });
});

// 초기 1회
updateBadge().catch(() => {});
