// background.js — Service Worker (MV3, ES module)
// 4종 트리거(우클릭/툴바/OWA/다운로드)를 단일 scanUrl()로 수렴.
// 모델: Chrome built-in Gemini Nano (LanguageModel). 폴백 없음.

// i18n — globalThis.t, globalThis.initI18n 등을 등록.
import "./i18n.js";

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
- First-party developer install instructions such as \`curl https://same-registered-domain/.../install.sh | sh\` shown in docs/code blocks are NOT malicious by themselves. Treat them as risky only when combined with clipboard writes, obfuscation, captcha/verification lures, cross-origin command URLs, brand-domain mismatch, free hosting, auto-downloads, dangerous URI schemes, or credential collection.
- Brand impersonation on hosting subdomains: if the page mimics brand X but is on workers.dev/pages.dev/vercel.app/netlify.app/etc. — assume phishing unless explicit demo disclaimer.
- BEHAVIORS.phishingKitMarkers non-empty — concrete phishing-kit fingerprints found in inline scripts: \`clearbit-logo\` (logo.clearbit.com fetched dynamically by victim email domain), \`screenshotmachine\` (victim company homepage used as blurred background), \`atob-url:\` (base64-decoded credential-exfil endpoint), or messaging/webhook exfil markers such as Telegram, Discord, or webhook.site endpoints. Treat these as strong evidence when combined with a credential form, hidden/prefilled account, brand impersonation, or off-origin collection path.

Limitations:
- Subdomains of hosting services (Cloudflare, AWS, Azure, Netlify, pages.dev, weebly.com) should NOT be assumed legitimate even if their WHOIS is legitimate.
- Subdomains containing dev/stg/prd are normal.
- A server error, page-not-found, or empty HTML is NOT a phishing sign.
- OCR or HTML having no data is NOT a phishing sign.
- HTML may be shortened and simplified.
- OCR-extracted text may be inaccurate or gibberish.
- The Korean top-level domain (.kr) is NOT suspicious by itself.
- In Korean identity flows, URL tokens like pass, pass-popup, and sign-pass often mean PASS mobile identity verification, not password reset.
- A cross-domain form POST is NOT suspicious by itself when CROSS_DOMAIN_FORMS identifies a known identity verification, payment, or OAuth provider and no hard evidence is present.
- If PROVIDER_PAGE_CONTEXT says the current URL is a recognized third-party provider page, do not compare it against an inherited/source brand for domain mismatch.
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

// LM 이 brand 를 일관된 케이싱으로 돌려주지 않음(예: "Claude" vs "deepseek ai") → 객체 키 직접 접근
// 시 대소문자 불일치로 OFFICIAL_DOMAINS lookup 이 miss → O1 override 전체 skip.
// 모듈 로드 시 소문자 키 Map 한 번 만들어두고, 변형(전체/"AI" 접미 제거/첫 단어) 셋을 케이스 무시로 시도.
function lookupOfficialDomains(brand) {
  if (!brand) return null;
  // LM 이 한글 브랜드를 NFD(분해형)로 출력하면 NFC 키 Map 과 직접 매칭 실패 → silent FN.
  // 매칭 전 NFC 로 정규화한다. [[lm-output-normalization]]
  const lc = String(brand).normalize("NFC").toLowerCase().trim();
  if (!lc) return null;
  return OFFICIAL_DOMAINS_LC.get(lc)
    || OFFICIAL_DOMAINS_LC.get(lc.replace(/\s+ai$/i, "").trim())
    || OFFICIAL_DOMAINS_LC.get(lc.split(/\s+/)[0])
    || null;
}

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
  "Microsoft":    ["microsoft.com", "office.com", "live.com", "outlook.com", "azure.com",
                   "microsoftonline.com", "microsoft365.com", "office365.com",
                   "msauth.net", "msftauth.net"],
  "Apple":        ["apple.com", "icloud.com"],
  "MetaMask":     ["metamask.io"],
  "Coinbase":     ["coinbase.com", "wallet.coinbase.com"],
  "Binance":      ["binance.com"],
  "SK텔레콤":     ["sktelecom.com", "tworld.co.kr"],
  "SK Telecom":   ["sktelecom.com", "tworld.co.kr"],
  "SK플래닛":     ["skplanet.com"],
  "SK Planet":    ["skplanet.com"],
  "OKCashbag":    ["okcashbag.com", "ogog.kr"],
  "OK Cashbag":   ["okcashbag.com", "ogog.kr"],
  "OK캐쉬백":     ["okcashbag.com", "ogog.kr"],
  "오케이캐쉬백": ["okcashbag.com", "ogog.kr"],
  "오글오글":     ["okcashbag.com", "ogog.kr"],
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
  "Netflix":      ["netflix.com"],
  "넷플릭스":      ["netflix.com"],
  "Watcha":       ["watcha.com"],
  "Wavve":        ["wavve.com"],
  "Seezn":        ["seezn.com"],
  "Kyobo":        ["kyobobook.co.kr"],
  "교보문고":     ["kyobobook.co.kr"],
  "Yes24":        ["yes24.com"],
  "Aladin":       ["aladin.co.kr"],
  "알라딘":       ["aladin.co.kr"],
};

// lookupOfficialDomains 가 사용하는 소문자 키 Map — OFFICIAL_DOMAINS 정의 직후 한 번 빌드.
const OFFICIAL_DOMAINS_LC = new Map(
  Object.entries(OFFICIAL_DOMAINS).map(([k, v]) => [k.normalize("NFC").toLowerCase(), v])
);

// 무료 호스팅 / 단명 서브도메인 / 누구나 임의 콘텐츠 올리는 클라우드 스토리지·CDN.
// 정식 브랜드 사이트는 이런 곳에 안 박힘 — 브랜드 사칭 발견 + 이 호스팅이면 거의 확실히 피싱.
const FREE_HOSTING_RE = /(?:^|\.)(?:workers\.dev|pages\.dev|vercel\.app|netlify\.app|netlify\.com|replit\.dev|repl\.co|github\.io|gitlab\.io|weebly\.com|webflow\.io|web\.app|firebaseapp\.com|surge\.sh|onrender\.com|glitch\.me|wixsite\.com|squarespace\.com|wordpress\.com|blogspot\.com|tiiny\.site|herokuapp\.com|cyclic\.app|fly\.dev|deno\.dev|render\.com|ngrok\.io|ngrok-free\.app|trycloudflare\.com|amplifyapp\.com|amazonaws\.com|cloudfront\.net|azurewebsites\.net|azureedge\.net|azurestaticapps\.net|blob\.core\.windows\.net|web\.core\.windows\.net|storage\.googleapis\.com|googleusercontent\.com|appspot\.com|run\.app|digitaloceanspaces\.com|ondigitalocean\.app|backblazeb2\.com|fastly\.net|b-cdn\.net|github\.dev|githubusercontent\.com|gitlab\.io|akamaihd\.net|akamaized\.net|edgesuite\.net|edgekey\.net|s3-website[-.][a-z0-9-]+\.amazonaws\.com)$/i;

// FR-029: 멀티테넌트 협업/문서 SaaS 플랫폼. WHOIS/RDAP/CT 소유권은 "플랫폼 운영사"만 증명하고
// 테넌트·문서 콘텐츠 안전을 보장하지 않는다. FREE_HOSTING_RE 와 달리 임의 익명 호스팅이 아니라
// 인증된 조직 테넌트가 정상 사용하는 평면이라, 브랜드 사칭으로 단정하지 않는다. 전역 OFFICIAL_DOMAINS
// safe 등록은 금지(FR-029)이되, hard evidence(O2/O3/O4/O7/D1)·외부 redirect(O0)가 없을 때
// LLM 의 약신호 단독 격상(login page·many buttons·brand mention 등)은 결정론적으로 cap 한다(O8).
const SHARED_SAAS_RE = /(?:^|\.)(?:sharepoint\.com|onedrive\.live\.com|dropbox\.com|dropboxusercontent\.com|box\.com|app\.box\.com)$/i;

// 공개 인기 랭킹에는 CDN, shortener, 협업/UGC 플랫폼도 자주 들어간다.
// 이런 suffix 는 "인기 도메인"이어도 현재 페이지 콘텐츠의 안전성을 보장하지 않으므로 O6에서 제외한다.
const POPULAR_DOMAIN_EXCLUSION_SUFFIXES = [
  "akamai.net", "akamaihd.net", "akamaiedge.net", "akamaized.net", "akadns.net",
  "edgesuite.net", "edgekey.net", "windows.net", "trafficmanager.net", "cloudapp.net", "azurefd.net",
  "docs.google.com", "drive.google.com", "forms.gle", "sites.google.com",
  "bit.ly", "goo.gl", "t.co", "tinyurl.com", "ow.ly", "cutt.ly", "is.gd", "buff.ly", "rebrand.ly",
  "t.me", "telegram.me", "discord.gg", "wa.me",
  "medium.com", "tumblr.com", "notion.site", "notion.so", "canva.site", "substack.com",
  "myshopify.com", "blogger.com",
];

function isPopularDomainTrustExcluded(host) {
  const h = String(host || "").toLowerCase();
  if (!h) return true;
  if (FREE_HOSTING_RE.test(h) || SHARED_SAAS_RE.test(h)) return true;
  return POPULAR_DOMAIN_EXCLUSION_SUFFIXES.some(suffix => h === suffix || h.endsWith("." + suffix));
}

// 공인 제3자 인증/결제 provider 로 향하는 cross-domain form 은 "추가 맥락"이지
// 그 자체로 피싱 근거가 아니다. 단 provider 도메인만으로 safe 처리하면 오용될 수 있으므로
// endpoint/path + 연동 파라미터 시그니처까지 같이 요구한다.
const THIRD_PARTY_FORM_PROVIDER_RULES = [
  {
    domain: "ok-name.co.kr",
    provider: "KCB ok-name",
    type: "identity_verification",
    pathRe: /^\/CommonSvl\/?$/i,
    methodRe: /^post$/i,
    fieldNames: ["tc", "cp_cd", "mdl_tkn", "target_id"],
    minFieldHits: 2
  }
];

// 공개 랭킹(Tranco / Majestic Million / Cisco Umbrella / Cloudflare Radar) 기반 전세계 인기 도메인 목록.
// OFFICIAL_DOMAINS와 달리 LLM의 브랜드 인식 없이도 도메인 직접 매칭으로 동작.
// 업데이트: tools/update-popular-domains.mjs 및 .github/workflows/update-popular-domains.yml.
const POPULAR_DOMAINS = new Set([
  // BEGIN AUTO-GENERATED POPULAR DOMAINS
  // Generated by tools/update-popular-domains.mjs. Do not edit by hand.
  // Final limit: 200; per-source read limit: 2000
  // Source: Cloudflare Radar skipped (missing CLOUDFLARE_API_TOKEN)
  // Source: Tranco XLXNN 1000000 top 2000 (2026-06-09T22:00:01.783313)
  // Source: Majestic Million top 2000
  // Source: Cisco Umbrella top 2000
  "google.com",
  "facebook.com",
  "microsoft.com",
  "gstatic.com",
  "youtube.com",
  "cloudflare.com",
  "instagram.com",
  "gtld-servers.net",
  "apple.com",
  "twitter.com",
  "googletagmanager.com",
  "linkedin.com",
  "office.com",
  "live.com",
  "ezviz7.com",
  "googleapis.com",
  "github.com",
  "wikipedia.org",
  "bing.com",
  "microsoftonline.com",
  "amazon.com",
  "hicloudcam.com",
  "wordpress.org",
  "skype.com",
  "youtu.be",
  "fbcdn.net",
  "pinterest.com",
  "x.com",
  "doubleclick.net",
  "whatsapp.com",
  "digicert.com",
  "tiktok.com",
  "adobe.com",
  "mail.ru",
  "msn.com",
  "data.microsoft.com",
  "office.net",
  "yahoo.com",
  "cloud.microsoft",
  "azure.com",
  "vimeo.com",
  "events.data.microsoft.com",
  "play.google.com",
  "spotify.com",
  "dzen.ru",
  "windowsupdate.com",
  "googlevideo.com",
  "nginx.org",
  "mozilla.org",
  "reddit.com",
  "netflix.com",
  "nginx.com",
  "office365.com",
  "qq.com",
  "zoom.us",
  "f5.com",
  "baidu.com",
  "europa.eu",
  "opera.com",
  "apple-dns.net",
  "whatsapp.net",
  "apache.org",
  "accounts.google.com",
  "aaplimg.com",
  "gravatar.com",
  "windows.com",
  "icloud.com",
  "mailinabox.email",
  "outlook.com",
  "godaddy.com",
  "appsflyersdk.com",
  "update.googleapis.com",
  "nih.gov",
  "googlesyndication.com",
  "miit.gov.cn",
  "chatgpt.com",
  "apps.apple.com",
  "gvt1.com",
  "ytimg.com",
  "archive.org",
  "ntp.org",
  "domaincontrol.com",
  "macromedia.com",
  "nytimes.com",
  "paypal.com",
  "en.wikipedia.org",
  "shopify.com",
  "flickr.com",
  "google-analytics.com",
  "vk.com",
  "googleadservices.com",
  "login.microsoftonline.com",
  "maps.google.com",
  "samsung.com",
  "w3.org",
  "soundcloud.com",
  "itunes.apple.com",
  "yandex.ru",
  "creativecommons.org",
  "gwfb.net",
  "forbes.com",
  "gandi.net",
  "gvt2.com",
  "cpanel.net",
  "theguardian.com",
  "doi.org",
  "sciencedirect.com",
  "mp.microsoft.com",
  "oracle.com",
  "static.microsoft",
  "cnn.com",
  "sourceforge.net",
  "sentry.io",
  "youtube-nocookie.com",
  "amazon-adsystem.com",
  "cdninstagram.com",
  "edge.skype.com",
  "snapchat.com",
  "discord.com",
  "bbc.com",
  "cisco.com",
  "who.int",
  "ipv4only.arpa",
  "ripn.net",
  "config.edge.skype.com",
  "stripe.com",
  "researchgate.net",
  "openai.com",
  "dropcatch.com",
  "mit.edu",
  "example.com",
  "bbc.co.uk",
  "launchpad.net",
  "sfx.ms",
  "policies.google.com",
  "springer.com",
  "ecs.office.com",
  "outlook.office.com",
  "tiktokv.com",
  "tiktokcdn.com",
  "reuters.com",
  "googleblog.com",
  "imdb.com",
  "android.com",
  "hubspot.com",
  "ibm.com",
  "msftconnecttest.com",
  "linktr.ee",
  "criteo.com",
  "nature.com",
  "wikimedia.org",
  "app-measurement.com",
  "php.net",
  "hp.com",
  "officeapps.live.com",
  "nist.gov",
  "harvard.edu",
  "wiley.com",
  "weibo.com",
  "twitch.tv",
  "unity3d.com",
  "ebay.com",
  "cloudflare.net",
  "canva.com",
  "api.whatsapp.com",
  "issuu.com",
  "a2z.com",
  "mobile.events.data.microsoft.com",
  "cloudflare-dns.com",
  "gnu.org",
  "yandex.net",
  "msftncsi.com",
  "teams.microsoft.com",
  "googledomains.com",
  "un.org",
  "cdc.gov",
  "gov.uk",
  "pki.goog",
  "plus.google.com",
  "intuit.com",
  "webex.com",
  "aliyuncs.com",
  "akam.net",
  "app-analytics-services.com",
  "roblox.com",
  "washingtonpost.com",
  "ctldl.windowsupdate.com",
  "wsj.com",
  "wp.com",
  "plesk.com",
  "stanford.edu",
  "myfritz.net",
  "adtrafficquality.google",
  "etsy.com",
  "bloomberg.com",
  "cookiedatabase.org",
  "settings-win.data.microsoft.com",
  "cdn-apple.com",
  "msedge.net",
  "salesforce.com",
  // END AUTO-GENERATED POPULAR DOMAINS
]);

const OFFSCREEN_URL = chrome.runtime.getURL("offscreen.html");
const WARNING_URL = chrome.runtime.getURL("warning.html");
// notifications iconUrl 폴백 — 아이콘 캐시가 비었을 때 사용 (1×1 빨간 점 PNG)
const FALLBACK_NOTIF_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TAB_LOAD_TIMEOUT_MS = 8000;
const NAVIGATION_SCAN_COOLDOWN_MS = 60_000;
const PROMPT_OUTPUT_RESERVE = 512;
const SESSION_TRUST_TTL_MS = 6 * 60 * 60 * 1000;
const CLICK_GUARD_WARN_APPROVAL_TTL_MS = 6 * 60 * 60 * 1000;

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
    const session = await createLanguageModelSession();
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

async function createLanguageModelSession() {
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
    // Chrome 138+ 는 outputLanguage 미지정 시 콘솔 경고 + safety attestation
    // 요구. prompt() 마다 동일 값을 다시 넘기고 있지만 session-level 에서도
    // 명시해 둔다. 지원 코드: [en, es, ja].
    outputLanguage: "en",
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

  _availability = "available";
  _downloadProgress = null;
  await applyBadgeState(_availability);
  return session;
}

async function destroyLanguageModelSession(session) {
  try {
    if (session && typeof session.destroy === "function") session.destroy();
  } catch {}
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

/**
 * 메시지 type 마다 응답 shape 이 다르므로(예: OCR→string, OCR_DIAGNOSTICS→{available,languages},
 * WHOIS_PARSE→string, GENERATE_ICONS→icons map) TS 가 단일 shape 으로 추론하지 않도록
 * @returns 를 any 로 명시한다.
 * @returns {Promise<any>}
 */
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
  // 사설 IP 는 denylist 매칭 대상에서 제외 — 과거에 잘못 기록된 entry 도 자동 inert 처리.
  if (isPrivateIp(host)) return false;
  const h = await sha256Hex(host.toLowerCase());
  const set = await loadDenylist();
  return set.has(h);
}
async function addToDenylist(host) {
  if (!host) return;
  // 사설 IP 는 영구 기록 자체를 거부.
  if (isPrivateIp(host)) return;
  const h = await sha256Hex(host.toLowerCase());
  const set = await loadDenylist();
  if (set.has(h)) return;
  set.add(h);
  await chrome.storage.local.set({ phishingDenylist: [...set] });
  console.log("denylist += host (hash:", h.slice(0, 12) + "…)");
}
async function removeFromDenylist(host) {
  if (!host) return false;
  const h = await sha256Hex(host.toLowerCase());
  const set = await loadDenylist();
  if (!set.delete(h)) return false;
  await chrome.storage.local.set({ phishingDenylist: [...set] });
  console.log("denylist -= host (hash:", h.slice(0, 12) + "…)");
  return true;
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

function providerRuleMatchesHost(rule, host, domain) {
  const h = String(host || "").toLowerCase();
  const d = String(domain || "").toLowerCase();
  return d === rule.domain || h === rule.domain || h.endsWith("." + rule.domain);
}

function classifyThirdPartyProviderUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const domain = registeredDomain(u.href);
    const path = u.pathname || "/";
    for (const rule of THIRD_PARTY_FORM_PROVIDER_RULES) {
      if (!providerRuleMatchesHost(rule, host, domain)) continue;
      const pathMatched = !rule.pathRe || rule.pathRe.test(path);
      return {
        provider: rule.provider,
        type: rule.type,
        matchedDomain: rule.domain,
        host,
        path,
        pathMatched,
        brand: rule.type === "identity_verification" ? `${rule.provider} / PASS` : rule.provider
      };
    }
  } catch {}
  return null;
}

function classifyThirdPartyProviderPage(url, extracted) {
  const info = classifyThirdPartyProviderUrl(extracted?.finalUrl || url);
  if (!info) return null;
  if (info.pathMatched) return info;

  const hay = [
    extracted?.title || "",
    (extracted?.visibleText || "").slice(0, 6000),
    (extracted?.forms || []).join(" "),
    (extracted?.anchors || []).join(" ")
  ].join("\n").normalize("NFC");
  if (info.type === "identity_verification" && /(?:\bPASS\b|KCB|ok-?name|본인\s?인증|본인\s?확인|휴대폰\s?인증|휴대폰\s?본인|통신사|인증)/i.test(hay)) {
    return info;
  }
  return null;
}

// RFC1918 IPv4 (10/8, 172.16/12, 192.168/16) + loopback (127/8) + link-local (169.254/16)
// + IPv6 loopback (::1) + ULA (fc00::/7) + link-local (fe80::/10).
// 사설 IP 자체로는 브랜드 사칭 판정의 의미가 거의 없고 hidden scan tab 이 인증·VPN 으로
// 실패하기 쉬워, internal 로 묶어 LLM 호출과 denylist 기록에서 전부 제외한다.
function isPrivateIp(host) {
  if (!host) return false;
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, "");
  const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) {
    const o = m4.slice(1).map(Number);
    if (o.some(x => x > 255)) return false;
    if (o[0] === 10) return true;
    if (o[0] === 127) return true;
    if (o[0] === 169 && o[1] === 254) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    return false;
  }
  if (h === "::1") return true;
  if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link-local
  if (/^f[cd]/.test(h)) return true;    // fc00::/7 unique-local
  return false;
}

function isInternalDomain(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (isPrivateIp(h)) return true;
  } catch {}
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

function extractRegistrantOrgFromRdap(data) {
  const orgs = [];
  function walkEntities(entities) {
    if (!Array.isArray(entities)) return;
    for (const e of entities) {
      const roles = e.roles || [];
      if (roles.includes("registrant") && Array.isArray(e.vcardArray) && Array.isArray(e.vcardArray[1])) {
        for (const v of e.vcardArray[1]) {
          if (!Array.isArray(v)) continue;
          if (v[0] === "org" || v[0] === "fn") {
            const val = typeof v[3] === "string" ? v[3] : (typeof v[2] === "string" ? v[2] : "");
            if (val) orgs.push(val.trim());
          }
        }
      }
      if (e.entities) walkEntities(e.entities);
    }
  }
  walkEntities(data?.entities || []);
  return orgs.find(o => o && !/^redacted\b/i.test(o)) || orgs[0] || "";
}

function rdapRelatedLinks(data) {
  return (data?.links || [])
    .filter(l => l && l.rel === "related" && /application\/rdap\+json/i.test(l.type || ""))
    .map(l => l.href || l.value)
    .filter(Boolean)
    .filter(href => {
      try { return new URL(href).protocol === "https:"; }
      catch { return false; }
    })
    .slice(0, 2);
}

async function fetchRdapJson(url) {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) return null;
  return await res.json();
}

// rdap.org bootstrap — 표준 JSON 응답. .com/.net registry RDAP 는 registrar 만 보여주고
// registrant 는 rel=related registrar RDAP 에서만 나오는 경우가 있다(예: MarkMonitor).
// 결과: "Registrant: <org>" 또는 빈 문자열.
async function fetchRdap(domain) {
  if (!domain) return "";
  try {
    const cacheKey = "rdap:" + domain;
    const cached = await chrome.storage.session.get(cacheKey);
    if (cached[cacheKey] !== undefined) return cached[cacheKey];
    const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
    const data = await fetchRdapJson(url);
    if (!data) { await chrome.storage.session.set({ [cacheKey]: "" }); return ""; }
    let org = extractRegistrantOrgFromRdap(data);
    if (!org) {
      for (const href of rdapRelatedLinks(data)) {
        try {
          const related = await fetchRdapJson(href);
          org = extractRegistrantOrgFromRdap(related);
          if (org) break;
        } catch {}
      }
    }
    const out = org ? `Registrant: ${org.slice(0, 120)}` : "";
    await chrome.storage.session.set({ [cacheKey]: out });
    return out;
  } catch (e) {
    console.warn("RDAP fetch error:", e);
    return "";
  }
}

// 공용 CA — issuer Org 가 이쪽으로 나오면 브랜드 단서로 못 씀.
const PUBLIC_CA_RE = /(let'?s\s*encrypt|digicert|sectigo|comodo|globalsign|godaddy|amazon|cloudflare|google\s+trust|starfield|entrust\b)/i;

// Certificate Transparency 로그 — crt.sh JSON 응답의 issuer_name 에서 O=<brand> 추출.
// 자체 CA 운영 브랜드(Microsoft Corporation, Apple Inc., Google Trust Services 등)의 cert 가
// 발견되면 강한 소유권 증거. 공용 CA(DigiCert/Let's Encrypt 등)는 PUBLIC_CA_RE 로 거른다.
async function fetchCertOrg(host) {
  if (!host) return "";
  try {
    const cacheKey = "cert:" + host;
    const cached = await chrome.storage.session.get(cacheKey);
    if (cached[cacheKey] !== undefined) return cached[cacheKey];
    const url = `https://crt.sh/?q=${encodeURIComponent(host)}&output=json&exclude=expired&deduplicate=Y`;
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) { await chrome.storage.session.set({ [cacheKey]: "" }); return ""; }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      await chrome.storage.session.set({ [cacheKey]: "" });
      return "";
    }
    // 최근 10개만 검사 (대개 동일 issuer 가 반복됨)
    for (const c of data.slice(0, 10)) {
      const issuer = String(c.issuer_name || "");
      // issuer_name 포맷 예: "C=US, O=Microsoft Corporation, CN=Microsoft Azure RSA TLS Issuing CA 03"
      const m = issuer.match(/(?:^|,\s*)O\s*=\s*"?([^",]+)"?/);
      if (!m) continue;
      const org = m[1].trim();
      if (!org || PUBLIC_CA_RE.test(org)) continue;
      const out = `IssuerOrg: ${org.slice(0, 120)}`;
      await chrome.storage.session.set({ [cacheKey]: out });
      return out;
    }
    await chrome.storage.session.set({ [cacheKey]: "" });
    return "";
  } catch (e) {
    console.warn("CT fetch error:", e);
    return "";
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
  if (b.phishingKitMarkers?.length) {
    lines.push("phishingKitMarkers: " + b.phishingKitMarkers.slice(0, 8).join(", "));
  }
  return lines.join("\n");
}

function normalizeNameList(names) {
  return (Array.isArray(names) ? names : [])
    .map(n => String(n || "").trim().toLowerCase())
    .filter(Boolean);
}

function classifyThirdPartyFormProvider(form) {
  if (!form?.targetHost && !form?.targetDomain) return null;
  const targetHost = String(form.targetHost || "").toLowerCase();
  const targetDomain = String(form.targetDomain || "").toLowerCase();
  const targetPath = String(form.targetPath || "");
  const method = String(form.method || "get").toLowerCase();
  const names = new Set([
    ...normalizeNameList(form.fieldNames),
    ...normalizeNameList(form.hiddenFieldNames),
    ...normalizeNameList(form.queryParamNames)
  ]);

  for (const rule of THIRD_PARTY_FORM_PROVIDER_RULES) {
    const hostMatches = targetDomain === rule.domain || targetHost === rule.domain || targetHost.endsWith("." + rule.domain);
    if (!hostMatches) continue;
    if (rule.pathRe && !rule.pathRe.test(targetPath)) continue;
    if (rule.methodRe && !rule.methodRe.test(method)) continue;
    const hits = rule.fieldNames.filter(n => names.has(n.toLowerCase()));
    if (hits.length < (rule.minFieldHits || 1)) continue;
    return {
      provider: rule.provider,
      type: rule.type,
      matchedDomain: rule.domain,
      matchedFields: hits
    };
  }
  return null;
}

function formatCrossDomainForms(forms) {
  if (!Array.isArray(forms) || forms.length === 0) return "";
  const lines = [];
  for (const form of forms.slice(0, 8)) {
    const role = classifyThirdPartyFormProvider(form);
    const bits = [
      `${form.sourceDomain || form.sourceHost || "source"} -> ${form.targetHost || form.targetDomain || "target"}${form.targetPath || ""}`,
      `method=${form.method || "get"}`
    ];
    if (role) {
      bits.push(`role=third_party_${role.type}`);
      bits.push(`provider=${role.provider}`);
      bits.push(`matchedFields=${role.matchedFields.join(",")}`);
      bits.push("target_provider_recognized=true");
      bits.push("field_signature_matched=true");
      bits.push("treat_cross_domain_as_phishing_evidence=false");
      bits.push("score_cap_without_hard_evidence=3");
      if (role.type === "identity_verification") {
        bits.push("pass_token_interpretation=PASS_mobile_identity_verification_not_password_reset");
      }
    }
    const fields = normalizeNameList(form.fieldNames).slice(0, 12);
    const hidden = normalizeNameList(form.hiddenFieldNames).slice(0, 12);
    if (fields.length) bits.push(`fields=${fields.join(",")}`);
    if (hidden.length) bits.push(`hidden=${hidden.join(",")}`);
    lines.push("- " + bits.join(" "));
  }
  if (lines.some(line => /role=third_party_/.test(line))) {
    lines.push("Decision rule: recognized third-party identity/payment/OAuth provider POST must not be used as phishing evidence without hard evidence.");
  }
  return lines.join("\n");
}

function formatProviderPageContext(url, extracted) {
  const info = classifyThirdPartyProviderPage(url, extracted);
  if (!info) return "";
  return [
    `analysis_subject=target_provider_page`,
    `current_domain_role=third_party_${info.type}_provider`,
    `current_brand=${info.brand}`,
    `provider=${info.provider}`,
    `provider_host=${info.host}`,
    `provider_path=${info.path}`,
    `provider_recognized=true`,
    `inherited_source_brand_should_not_be_used_for_domain_mismatch=true`,
    `treat_provider_domain_as_suspicious=false`,
    `score_cap_without_hard_evidence=3`,
    info.type === "identity_verification"
      ? "pass_token_interpretation=PASS_mobile_identity_verification_not_password_reset"
      : ""
  ].filter(Boolean).join("\n");
}

function buildPromptSlices(url, ocr, whois, extracted) {
  return [
    { key: "URL",       value: clamp(url, 500),                                       priority: 1 },
    { key: "PROVIDER_PAGE_CONTEXT", value: clamp(formatProviderPageContext(url, extracted), 800), priority: 1.8 },
    { key: "WHOIS",     value: clamp(whois, 600),                                     priority: 2 },
    { key: "BEHAVIORS", value: clamp(formatBehaviors(extracted.behaviors), 1500),     priority: 2.5 },
    { key: "CROSS_DOMAIN_FORMS", value: clamp(formatCrossDomainForms(extracted.crossDomainForms), 1000), priority: 2.8 },
    { key: "FORMS",     value: joinAndCap(extracted.forms || [], 500),                priority: 3 },
    { key: "UI_CONTROLS", value: joinAndCap(extracted.uiControls || [], 300),          priority: 4.5 },
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

// 스캔 중 탭들 — chrome.downloads.onCreated / webRequest 가 이 탭에서 발생한 자동 다운로드와
// main-frame POST navigation 의 구조화 필드명을 기록하기 위해 사용한다.
const scanningTabs = new Map(); // tabId → { autoDownloads:[], postForms:[], initialUrl }
const navigationScans = new Map(); // tabId → { url, at }

function postFieldNamesFromRequestBody(body) {
  const formData = body?.formData;
  if (!formData || typeof formData !== "object") return [];
  return Object.keys(formData)
    .map(k => String(k || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function crossDomainPostFormFromRequest(details, state) {
  if (!details || String(details.method || "").toUpperCase() !== "POST") return null;
  const sourceUrl = details.initiator || details.originUrl || details.documentUrl || state?.initialUrl || "";
  let source, target;
  try { source = new URL(sourceUrl); } catch { return null; }
  try { target = new URL(details.url); } catch { return null; }
  if (!/^https?:$/i.test(target.protocol)) return null;

  const sourceHost = source.hostname.toLowerCase();
  const targetHost = target.hostname.toLowerCase();
  const sourceDomain = registeredDomain(source.href);
  const targetDomain = registeredDomain(target.href);
  if (!sourceDomain || !targetDomain || sourceDomain === targetDomain) return null;

  const fieldNames = postFieldNamesFromRequestBody(details.requestBody);
  return {
    action: target.origin + target.pathname,
    method: "post",
    sourceHost,
    sourceDomain,
    targetHost,
    targetDomain,
    targetPath: target.pathname.slice(0, 160),
    queryParamNames: [...target.searchParams.keys()].map(k => String(k).slice(0, 80)).slice(0, 20),
    fieldNames,
    hiddenFieldNames: fieldNames,
    observedBy: "webRequest.postNavigation"
  };
}

function mergeCrossDomainForms(existing, observed) {
  const out = [];
  const seen = new Set();
  for (const form of [...(existing || []), ...(observed || [])]) {
    if (!form) continue;
    const key = [
      form.sourceDomain || form.sourceHost || "",
      form.targetDomain || form.targetHost || "",
      form.targetPath || "",
      form.method || "",
      normalizeNameList(form.fieldNames).join(",")
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(form);
    if (out.length >= 12) break;
  }
  return out;
}

if (chrome.webRequest?.onBeforeRequest) {
  try {
    chrome.webRequest.onBeforeRequest.addListener(
      details => {
        const state = scanningTabs.get(details.tabId);
        if (!state) return;
        if (details.type !== "main_frame" && details.type !== "sub_frame") return;
        const form = crossDomainPostFormFromRequest(details, state);
        if (!form) return;
        state.postForms = mergeCrossDomainForms(state.postForms || [], [form]).slice(-8);
      },
      { urls: ["<all_urls>"] },
      ["requestBody"]
    );
  } catch (e) {
    console.warn("webRequest POST capture unavailable:", e);
  }
}

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
  scanningTabs.set(tab.id, { autoDownloads: [], postForms: [], initialUrl: url });
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
      extracted.crossDomainForms = mergeCrossDomainForms(extracted.crossDomainForms || [], sigs?.postForms || []);
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

// [single-flight] 같은 URL 의 동시 다중 스캔(navigation / popup / click-guard / contextMenu)을
// 첫 호출의 promise 로 공유한다. 캐시 write 전에 들어오는 후속 호출이 cache miss 되어 단일
// LM 세션 큐에 직렬로 쌓이면 popup 응답이 30-50초+ 까지 지연되던 문제 해결. 모듈 스코프 Map
// 이라 SW idle 종료 시 자연히 비워진다. bypassCache(eval harness)는 dedup 제외.
const inflightScans = new Map();

// in-flight awaiter 에서 dispatchResult 재발화가 필요한 source. 부수효과(탭 가로채기 / 배너 / 알림)가
// dispatchResult 안에서만 일어나는 source 들이며, return 값으로 처리되는 popup/click-guard/
// download-silent-ok/eval/fixture 는 제외해 중복 알림을 피한다.
const AWAITER_DISPATCH_SOURCES = new Set(["navigation", "owa", "contextMenu", "action"]);
const CURRENT_TAB_SCAN_SOURCES = new Set(["navigation", "popup", "action"]);

function hostFromUrl(url) {
  try { return new URL(url).hostname.toLowerCase(); }
  catch { return ""; }
}

async function getTabHttpUrl(tabId) {
  if (tabId == null || tabId < 0) return "";
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab?.url && /^https?:/i.test(tab.url) ? tab.url : "";
  } catch {
    return "";
  }
}

function sameHostUrl(a, b) {
  const ah = hostFromUrl(a);
  const bh = hostFromUrl(b);
  return !!ah && !!bh && ah === bh;
}

async function currentTabStillMatchesScan(tabId, scanUrl) {
  const currentUrl = await getTabHttpUrl(tabId);
  return {
    currentUrl,
    matches: !!currentUrl && sameHostUrl(currentUrl, scanUrl)
  };
}

function isSharedHostingHost(host) {
  return !!host && FREE_HOSTING_RE.test(host);
}

async function getSessionTrustedHost(url) {
  const host = hostFromUrl(url);
  if (!host || isSharedHostingHost(host)) return null;
  const now = Date.now();
  const { safeHosts = [] } = await chrome.storage.session.get("safeHosts");
  const live = safeHosts
    .filter(e => e && e.host && e.expiresAt > now && !isSharedHostingHost(e.host))
    .slice(-200);
  if (live.length !== safeHosts.length) {
    await chrome.storage.session.set({ safeHosts: live });
  }
  return live.find(e => e.host === host) || null;
}

async function rememberSessionTrustedHost(url, sourceRule) {
  const host = hostFromUrl(url);
  if (!host || isPrivateIp(host) || isSharedHostingHost(host)) return;
  const now = Date.now();
  const { safeHosts = [] } = await chrome.storage.session.get("safeHosts");
  const live = safeHosts
    .filter(e => e && e.host && e.expiresAt > now && e.host !== host && !isSharedHostingHost(e.host))
    .slice(-199);
  live.push({ host, source: sourceRule, expiresAt: now + SESSION_TRUST_TTL_MS });
  await chrome.storage.session.set({ safeHosts: live });
  console.log("safeHosts added:", host, "source:", sourceRule, "(total", live.length, ")");
}

async function getClickGuardWarnApproval(url) {
  if (!url || !/^https?:/i.test(url)) return null;
  // warn(4~6) 승인은 host 단위로 조회한다. 가입/동의 같은 멀티스텝 플로우가 단계마다
  // URL(query/hash/path)을 바꿔도 승인이 유지돼 confirm 무한 재등장을 막는다.
  // danger(>=7)는 click_guard 에서 이 승인과 무관하게 항상 차단되므로 안전.
  const host = hostFromUrl(url);
  if (!host) return null;
  const now = Date.now();
  const { clickGuardWarnApprovals = [] } = await chrome.storage.session.get("clickGuardWarnApprovals");
  const live = clickGuardWarnApprovals
    .filter(e => e && e.host && e.expiresAt > now)
    .slice(-200);
  if (live.length !== clickGuardWarnApprovals.length) {
    await chrome.storage.session.set({ clickGuardWarnApprovals: live });
  }
  return live.find(e => e.host === host) || null;
}

async function rememberClickGuardWarnApproval(url, score) {
  if (!url || !/^https?:/i.test(url)) return { ok: false, error: "invalid_url" };
  const host = hostFromUrl(url);
  if (!host) return { ok: false, error: "empty_host" };
  const now = Date.now();
  const urlHash = await sha256Hex(url);
  const { clickGuardWarnApprovals = [] } = await chrome.storage.session.get("clickGuardWarnApprovals");
  // host 단위 dedup — 같은 host 의 기존 승인은 교체(갱신). URL 별로 엔트리가 쌓이지 않게.
  const live = clickGuardWarnApprovals
    .filter(e => e && e.host && e.expiresAt > now && e.host !== host)
    .slice(-199);
  const entry = {
    urlHash,
    host,
    score: Number.isFinite(score) ? score : null,
    source: "click-guard-warn-confirm",
    expiresAt: now + CLICK_GUARD_WARN_APPROVAL_TTL_MS
  };
  live.push(entry);
  await chrome.storage.session.set({ clickGuardWarnApprovals: live });
  console.log("clickGuardWarnApprovals added:", host, "score:", entry.score, "(total", live.length, ")");
  return { ok: true, host, expiresAt: entry.expiresAt };
}

async function finalizeVerdict(verdict, extracted, url, key, source, meta) {
  const finalUrl = extracted?.finalUrl || url;
  // FR-033: 회귀 모드(bypassUserTrust)에선 denylist 에 쓰지 않는다. 실패한 fixture 가
  // 영구 denylist 에 등록되면 D1 이 이후 모든 스캔을 phishing 으로 고정해 회귀가 비멱등이 된다.
  if (!meta.bypassUserTrust && verdict.phishing === true && (verdict.phishing_score ?? 0) >= 7) {
    try {
      const finalHost = new URL(finalUrl).hostname.toLowerCase();
      if (finalHost) await addToDenylist(finalHost);
    } catch {}
  }
  verdict.final_url = finalUrl;
  verdict.url = url;
  verdict.ts = Date.now();
  await cacheSet(key, verdict);
  await chrome.storage.session.set({ lastVerdict: verdict });
  await dispatchResult(source, url, verdict, meta);
  return verdict;
}

// ───────────────────────── 핵심: scanUrl ─────────────────────────

async function scanUrl(url, source, meta = {}) {
  if (!url || !/^https?:/i.test(url)) {
    return { error: "scannable_url_required" };
  }
  const bypassLookup = !!meta?.bypassCache || isLoopbackUrl(url);
  const key = "v:" + (await sha256Hex(url));

  if (!bypassLookup) {
    const existing = inflightScans.get(key);
    if (existing) {
      try {
        const verdict = await existing;
        // leader 가 dispatchResult 를 leader 의 source 로 단 한 번만 호출하므로, awaiter 가 다른
        // source 였다면 awaiter 의 부수효과(navigation→warning.html 탭 가로채기, owa→배너 주입,
        // contextMenu→OS 알림)가 누락된다. 부수효과가 명확한 source 만 재발화한다.
        // popup/click-guard/download-silent-ok/eval/fixture 는 return 값으로 충분하므로 제외 —
        // 재발화하면 중복 OS 알림이 발생한다.
        if (verdict && typeof verdict === "object" && !verdict.error
            && AWAITER_DISPATCH_SOURCES.has(source)) {
          await dispatchResult(source, url, verdict, { ...meta, dedupAwaiter: true });
        }
        return verdict;
      } catch {}
    }
  }
  const work = _runScan(url, source, meta, key, bypassLookup);
  if (!bypassLookup) {
    inflightScans.set(key, work);
    work.finally(() => {
      if (inflightScans.get(key) === work) inflightScans.delete(key);
    });
  }
  return work;
}

async function _runScan(url, source, meta, key, bypassLookup) {
  const internalDomain = isInternalDomain(url);
  // 평가 사이클용 bypassCache 플래그 — 캐시·allowlist 우회.
  if (!bypassLookup) {
    let allowlistHost = "";
    try { allowlistHost = new URL(url).hostname.toLowerCase(); } catch {}
    if (allowlistHost && await isAllowlisted(allowlistHost)) {
      const allowed = {
        phishing_score: 0, brand: null, phishing: false,
        suspicious_domain: false,
        reason: t("bg.scan.allowlistShortCircuit", allowlistHost),
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
    // 세션 단위 자동 신뢰 호스트(safeHosts) — 이전 검사에서 O1-safe/O5/O6 단독 발동했고
    // 위험 오버라이드가 없었던 exact host만 짧게 신뢰한다. shared-hosting 전체 등록 도메인
    // 단위로는 절대 skip하지 않는다.
    try {
      const trustedHost = await getSessionTrustedHost(url);
      if (trustedHost) {
        const safeBySession = {
          phishing_score: 0, brand: null, phishing: false,
          suspicious_domain: false,
          reason: t("bg.scan.sessionTrusted", trustedHost.host),
          url, ts: Date.now()
        };
        await cacheSet(key, safeBySession);
        await chrome.storage.session.set({ lastVerdict: safeBySession });
        await dispatchResult(source, url, safeBySession, { ...meta, sessionTrustedHost: true });
        return safeBySession;
      }
    } catch {}
    // 영구 denylist hit — LLM/추출/OCR 전부 생략하고 phishing 으로 short-circuit.
    try {
      const host = new URL(url).hostname.toLowerCase();
      const knownProviderUrl = classifyThirdPartyProviderUrl(url);
      if (host && await isDenylisted(host) && knownProviderUrl?.pathMatched) {
        await removeFromDenylist(host);
      } else if (host && await isDenylisted(host)) {
        const denied = {
          phishing_score: 8, brand: null, phishing: true,
          suspicious_domain: true,
          reason: t("bg.scan.denylistShortCircuit"),
          url, ts: Date.now()
        };
        await cacheSet(key, denied);
        await chrome.storage.session.set({ lastVerdict: denied });
        await dispatchResult(source, url, denied, { ...meta, denylisted: true });
        return denied;
      }
    } catch {}
  }

  // 내부 도메인(사내 INTERNAL_DOMAINS 또는 RFC1918/loopback/link-local/IPv6 ULA 등 사설 IP)
  // 은 hidden tab / extract / OCR / WHOIS / LLM 전부 skip 하고 즉시 safe 반환.
  // 사내 신뢰 영역으로 간주하여 사용자에게 보이는 "검사" 행위(탭 깜빡임 포함) 자체를 생략한다.
  // 과거에는 extract 후 hasInternalBypassRisk 로 판단했지만 hidden 탭이 사용자에게 노출되고
  // 사설 IP 도 의도와 달리 검사가 진행되는 문제가 있어 v0.1.29 부터 즉시 short-circuit.
  if (internalDomain) {
    const safe = {
      phishing_score: 0, brand: null, phishing: false,
      suspicious_domain: false, reason: t("bg.scan.internalSkip"),
      url, ts: Date.now()
    };
    if (!bypassLookup) await cacheSet(key, safe);
    await chrome.storage.session.set({ lastVerdict: safe });
    await dispatchResult(source, url, safe, { ...meta, skipped: true });
    return safe;
  }

  let extracted, ocr = "", whois = "WHOIS lookup skipped";
  try {
    extracted = await extractFromUrl(url, source, meta);
    if (!extracted) extracted = { finalUrl: url, forms: [], anchors: [], imgs: [], visibleText: "" };
    const hardVerdict = hardEvidencePrecheck(extracted, extracted.finalUrl || url);
    if (hardVerdict) {
      return await finalizeVerdict(
        hardVerdict,
        extracted,
        url,
        key,
        source,
        { ...meta, hardEvidencePrecheck: true }
      );
    }
    const regDomain = registeredDomain(extracted.finalUrl || url);
    let finalHostForCt = "";
    try { finalHostForCt = new URL(extracted.finalUrl || url).hostname.toLowerCase(); } catch {}
    const [ocrRes, whoisRes, rdapRes, certRes] = await Promise.all([
      extracted.imgs?.length
        ? sendToOffscreen({ type: "OCR", imgs: extracted.imgs, base: extracted.finalUrl }).catch(() => "")
        : Promise.resolve(""),
      internalDomain
        ? Promise.resolve("WHOIS lookup skipped (internal domain)")
        : fetchWhois(regDomain),
      internalDomain ? Promise.resolve("") : fetchRdap(regDomain).catch(() => ""),
      internalDomain ? Promise.resolve("") : fetchCertOrg(finalHostForCt).catch(() => "")
    ]);
    ocr = ocrRes;
    // yesnic + RDAP + CT 결과를 한 줄로 합쳐 LLM 과 applyOverrides 가 같은 문자열을 본다.
    whois = [whoisRes, rdapRes, certRes].filter(Boolean).join(" | ");
    if (!whois) whois = "WHOIS lookup failed";
  } catch (e) {
    console.warn("extract/whois/ocr failed:", e);
    extracted = extracted || { finalUrl: url, forms: [], anchors: [], imgs: [], visibleText: "" };
  }

  let a = await checkAvailability();
  if (a === "unavailable") {
    // `LanguageModel.availability()` 가 모델 서비스 busy/cold 시 일시적으로 "unavailable" 을
    // 반환하는 flicker 가 있다(특히 무거운 추출 직후 첫 추론). 1회 짧게 재시도해 false negative
    // (정상 페이지가 model_unavailable 로 스캔 실패)를 줄인다. 진짜 미지원이면 재시도도 동일.
    await new Promise(r => setTimeout(r, 600));
    a = await checkAvailability();
  }
  if (a === "unavailable") {
    return { error: "model_unavailable", availability: a };
  }
  const canStartDownload = new Set(["popup", "contextMenu", "click-guard"]).has(source);
  if (a !== "available" && !canStartDownload) {
    return { error: "model_download_required", availability: a };
  }

  // 캐시된 베이스 세션을 재사용하고 스캔마다 clone() 으로 깨끗한 컨텍스트를 쓴다.
  // 예전엔 스캔마다 LanguageModel.create() 로 풀 세션을 새로 만들고 destroy 했는데, on-device
  // 세션 churn 이 누적되면 Gemini Nano 가 새 세션 생성에서 hang 하는 회귀가 있었다("Starting
  // on-device session" 만 반복되고 추론이 안 끝남). clone 은 가볍고 베이스의 system 프롬프트
  // 컨텍스트를 복사하므로 매 스캔 독립 컨텍스트를 보장한다.
  let base;
  try {
    base = await ensureSession();
  } catch (e) {
    return { error: "model_error", message: String(e?.message || e) };
  }
  let session = base, isClone = false;
  if (typeof base.clone === "function") {
    try { session = await base.clone(); isClone = true; } catch { session = base; isClone = false; }
  }
  let raw;
  try {
    const body = await buildPrompt(session, extracted.finalUrl || url, ocr, whois, extracted);
    // prompt 가 행 걸려도 세션·SW 가 영구 wedge 되지 않게 타임아웃. popup 의 60s 안전망보다 짧게.
    raw = await Promise.race([
      session.prompt(body, { responseConstraint: VERDICT_SCHEMA, omitResponseConstraintInput: true, outputLanguage: "en" }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("prompt_timeout_45s")), 45000))
    ]);
  } catch (e) {
    console.warn("LM.prompt failed:", e);
    // hang/오류 시 베이스 세션을 폐기하고 캐시를 비워, 다음 스캔이 새 세션을 만들게 한다(self-heal).
    _session = null;
    _sessionPromise = null;
    destroyLanguageModelSession(base).catch(() => {});
    return { error: "model_error", message: String(e?.message || e) };
  } finally {
    // clone 만 폐기 — 캐시된 베이스 세션은 재사용을 위해 살려둔다.
    if (isClone) destroyLanguageModelSession(session).catch(() => {});
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
  await applyOverrides(verdict, extracted, url, whois, meta);
  return await finalizeVerdict(verdict, extracted, url, key, source, meta);
}

// ───────────────────────── 결과 처리(source별 분기) ─────────────────────────

function severityFor(v) {
  if (v.phishing || (v.phishing_score ?? 0) >= 7) return "danger";
  if ((v.phishing_score ?? 0) >= 4) return "warn";
  return "ok";
}

async function notify(severity, title, body, verdictId) {
  const prefix = {
    ok:     t("notif.prefixOk"),
    warn:   t("notif.prefixWarn"),
    danger: t("notif.prefixDanger")
  };
  // 알림 아이콘은 manifest 와 함께 번들된 static PNG 를 직접 사용한다.
  // 과거 offscreen.js#generateIcons 로 런타임 생성한 data URL 을 storage.local.notifIcons
  // 에 저장해 쓰던 경로는 OffscreenCanvas/ImageData 가 chrome.runtime 메시지의 구조화 복제
  // 과정에서 깨지면서 setIcon 이 실패하던 회귀가 있었고 (v0.2.1 정적 PNG 도입 이후), 정적
  // 아이콘이 있는 한 그 경로 자체가 불필요하다. storage 의 notifIcons 도 더 이상 읽지 않는다.
  const staticIcon = {
    ok:     "icons/notif-ok-128.png",
    warn:   "icons/notif-warn-128.png",
    danger: "icons/notif-danger-128.png"
  }[severity];
  const iconUrl = staticIcon ? chrome.runtime.getURL(staticIcon) : FALLBACK_NOTIF_ICON;
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
// 위험 커스텀 URI 스킴 (hard precheck)
const HARD_DANGEROUS_URI_RE = /^(applescript|ms-msdt|ms-msvr|ms-search|search-ms|shell|vbscript):/i;

function normalizeBrand(brand) {
  // NFC 로 canonical 화 — 한글 브랜드 NFD 출력이 downstream(OFFICIAL_DOMAINS 매칭,
  // O1-whois 토큰 비교, 표시)에서 일관되게 NFC 로 다뤄지게 한다. [[lm-output-normalization]]
  const b = (brand ?? "").toString().normalize("NFC").trim();
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

function hasPhishingKitCredentialEvidence(extracted) {
  const kitMarkers = extracted?.behaviors?.phishingKitMarkers || [];
  return kitMarkers.length > 0 && hasCredentialLikeForms(extracted);
}

function collectHardEvidenceSignals(extracted) {
  const b = extracted?.behaviors || {};
  const signals = [];

  const clips = b.clipboardWrites || [];
  for (const c of clips) {
    const text = (typeof c === "string") ? c : (c?.text || "");
    if (SHELL_PAYLOAD_RE.test(text)) {
      signals.push({
        rule: "H1",
        score: 10,
        reason: t("bg.override.O2.clipboardShell", clamp(text.replace(/\s+/g, " "), 120))
      });
      break;
    }
  }

  const autoDl = b.autoDownloads || [];
  if (autoDl.length > 0) {
    const f = autoDl[0]?.filename || autoDl[0]?.url || "(unknown)";
    signals.push({
      rule: "H2",
      score: 9,
      reason: t("bg.override.O3.autoDownload", autoDl.length, clamp(f, 120))
    });
  }

  const dangerUris = (b.dangerousUris || []).filter(u => HARD_DANGEROUS_URI_RE.test(String(u).trim()));
  if (dangerUris.length > 0) {
    signals.push({
      rule: "H3",
      score: 9,
      reason: t("bg.override.O4.dangerousUri", dangerUris.slice(0, 3).join(", "))
    });
  }

  const kitMarkers = b.phishingKitMarkers || [];
  if (kitMarkers.length > 0 && hasCredentialLikeForms(extracted)) {
    signals.push({
      rule: "H4",
      score: 9,
      reason: t("bg.override.O7.kitMarker", kitMarkers.slice(0, 3).join(", "))
    });
  }

  return signals;
}

function hardEvidencePrecheck(extracted, url) {
  const signals = collectHardEvidenceSignals(extracted);
  if (signals.length === 0) return null;
  const rules = signals.map(s => s.rule).join("+");
  const reasons = signals.map(s => s.reason).join(" · ");
  return {
    phishing_score: Math.max(...signals.map(s => s.score)),
    brand: null,
    phishing: true,
    suspicious_domain: true,
    reason: t("bg.precheck.prefix", rules, reasons),
    hard_evidence: signals.map(s => s.rule),
    llm_skipped: true,
    final_url: extracted?.finalUrl || url
  };
}

function hasShellClipboardPayload(extracted) {
  const clips = extracted?.behaviors?.clipboardWrites || [];
  for (const c of clips) {
    const text = (typeof c === "string") ? c : (c?.text || "");
    if (SHELL_PAYLOAD_RE.test(text)) return true;
  }
  return false;
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

function normalizeBrandDomainToken(s) {
  return String(s || "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/\b(?:incorporated|corporation|company|corp|inc|llc|ltd|co)\b\.?/g, " ")
    .replace(/[^a-z0-9가-힣]/g, "");
}

function brandDomainCandidates(brand) {
  const raw = String(brand || "").normalize("NFC").toLowerCase().trim();
  if (!raw) return [];
  const candidates = new Set();
  const full = normalizeBrandDomainToken(raw);
  if (full.length >= 3) candidates.add(full);
  const first = normalizeBrandDomainToken(raw.split(/\s+/)[0]);
  if (first.length >= 3) candidates.add(first);
  for (const c of [...candidates]) {
    if (c.length > 4 && c.endsWith("ai")) candidates.add(c.slice(0, -2));
  }
  return [...candidates].filter(Boolean);
}

function registeredDomainLabel(url) {
  const d = registeredDomain(url);
  if (!d) return "";
  return normalizeBrandDomainToken(d.split(".")[0]);
}

function brandMatchesRegisteredDomain(brand, url) {
  const label = registeredDomainLabel(url);
  if (!label) return false;
  return brandDomainCandidates(brand).some(c => c === label);
}

function hasVerificationLure(extracted) {
  const social = (extracted?.behaviors?.socialHits || []).join(" ");
  const text = (extracted?.visibleText || "").slice(0, 8000);
  const hay = `${social}\n${text}`;
  return /(?:win\s*\+\s*r|⊞\s*\+?\s*r|run dialog|i\W?m\s+not\s+a\s+robot|verify\s+you\s+are\s+human|cloudflare\s+(?:verification|challenge)|보안\s*확인|script editor|스크립트\s*편집기)/i.test(hay);
}

function findSimpleFirstPartyInstallCommand(extracted, url) {
  const finalUrl = extracted?.finalUrl || url;
  const pageReg = registeredDomain(finalUrl);
  if (!pageReg) return null;
  const sources = (extracted?.behaviors?.codeSnippets || []).join("\n").slice(0, 12000);
  if (!sources) return null;
  const re = /\b(?:curl|wget)\b[\s\S]{0,700}?\|\s*(?:bash|sh|zsh)\b/gi;
  let m;
  while ((m = re.exec(sources))) {
    const command = String(m[0] || "");
    if (/(?:\$\(|`|;|&&|\|\||\beval\b|\bbase64\b|\btr\s+['"]|\bpowershell\b|\biex\b|\bmshta\b|\bcmd\.exe\b|\bcertutil\b|\bchmod\b|\bpython\s+-c\b|\bnode\s+-e\b)/i.test(command)) {
      continue;
    }
    const urls = [...command.matchAll(/\bhttps:\/\/[^\s"'`|<>)]+/gi)].map(x => x[0]);
    if (urls.length !== 1) continue;
    let target;
    try { target = new URL(urls[0]); } catch { continue; }
    if (registeredDomain(target.href) !== pageReg) continue;
    if (!looksLikeInstallerScriptPath(target.pathname)) continue;
    return {
      command: clamp(command.replace(/\s+/g, " ").trim(), 120),
      domain: pageReg,
      targetPath: target.pathname
    };
  }
  return null;
}

function looksLikeInstallerScriptPath(pathname) {
  const path = String(pathname || "").toLowerCase();
  const base = path.split("/").pop() || "";
  return (
    /\.(?:sh|bash|zsh)$/.test(base) ||
    /(?:^|[-_.])(?:install|setup|bootstrap)(?:[-_.]|$)/.test(base) ||
    /(?:^|\/)(?:install|setup|bootstrap)(?:\/|$)/.test(path)
  );
}

function hasFirstPartyInstallPageContext(extracted, url, install) {
  const hay = [
    url,
    extracted?.finalUrl || "",
    extracted?.title || "",
    (extracted?.visibleText || "").slice(0, 5000),
    (extracted?.anchors || []).join(" ").slice(0, 3000),
    install?.targetPath || ""
  ].join("\n").normalize("NFC");
  const installContext = /(?:download|install|setup|get started|quickstart|설치|다운로드)/i.test(hay);
  const developerContext = /(?:documentation|docs|cli|command line|terminal|macos|linux|windows|developer|문서|터미널)/i.test(hay);
  return installContext && developerContext;
}

function firstPartyInstallCommandSafeCap(verdict, extracted, url, finalOnFree, origOnFree, finalHost) {
  if (!verdict?.brand) return null;
  if (lookupOfficialDomains(verdict.brand)) return null;
  if (finalOnFree || origOnFree || (finalHost && SHARED_SAAS_RE.test(finalHost))) return null;
  if (!brandMatchesRegisteredDomain(verdict.brand, extracted?.finalUrl || url)) return null;
  if (hasCredentialLikeForms(extracted)) return null;
  if (hasShellClipboardPayload(extracted)) return null;
  if ((extracted?.behaviors?.autoDownloads || []).length > 0) return null;
  if ((extracted?.behaviors?.dangerousUris || []).length > 0) return null;
  if ((extracted?.behaviors?.phishingKitMarkers || []).length > 0) return null;
  if (hasObfuscationInText(extracted)) return null;
  if (hasVerificationLure(extracted)) return null;
  const install = findSimpleFirstPartyInstallCommand(extracted, url);
  if (!install) return null;
  if (!hasFirstPartyInstallPageContext(extracted, url, install)) return null;
  return install;
}

function modelReasonLooksBenign(reason) {
  const r = String(reason || "").normalize("NFC").toLowerCase();
  if (!r) return false;
  if (/\b(?:not|isn'?t|is not|does not appear to be)\s+(?:legitimate|authentic|official)\b/.test(r)) return false;
  if (/\b(?:fake|impersonat|credential theft|steal credentials|phishing attempt|malicious intent)\b/.test(r)) return false;
  return (
    /\b(?:legitimate|authentic|official)\b/.test(r) ||
    /\bwhois\b.{0,80}\b(?:confirm|match|authentic|legitimate)\b/.test(r) ||
    /\bno (?:clear |obvious )?(?:phishing|malicious|suspicious) (?:indicators?|signals?|evidence)\b/.test(r) ||
    /\bnot (?:a )?(?:phishing|malicious|suspicious) (?:site|page|attempt)\b/.test(r) ||
    /(?:정상|정식|공식|합법|진짜)\s*(?:사이트|도메인|페이지)?/.test(r) ||
    /(?:피싱|악성|위험|의심).{0,16}(?:징후|신호|근거|증거).{0,12}(?:없|아니)/.test(r)
  );
}

function hasHighConfidenceDangerSurface(extracted) {
  return (
    hasCredentialLikeForms(extracted) ||
    hasShellClipboardPayload(extracted) ||
    (extracted?.behaviors?.autoDownloads || []).length > 0 ||
    (extracted?.behaviors?.dangerousUris || []).length > 0 ||
    (extracted?.behaviors?.phishingKitMarkers || []).length > 0 ||
    hasObfuscatedCurlPipeToShell(extracted)
  );
}

function hasModelSafeScoreContradiction(verdict, extracted) {
  return (
    verdict?.phishing === false &&
    verdict?.suspicious_domain === false &&
    (verdict?.phishing_score ?? 0) >= 7 &&
    modelReasonLooksBenign(verdict?.reason) &&
    !hasHighConfidenceDangerSurface(extracted)
  );
}

function matchedThirdPartyProviderForms(extracted) {
  return (extracted?.crossDomainForms || [])
    .map(form => {
      const role = classifyThirdPartyFormProvider(form);
      return role ? { form, ...role } : null;
    })
    .filter(Boolean);
}

function hasNonFormHardEvidence(extracted) {
  return (
    hasShellClipboardPayload(extracted) ||
    (extracted?.behaviors?.autoDownloads || []).length > 0 ||
    (extracted?.behaviors?.dangerousUris || []).length > 0 ||
    (extracted?.behaviors?.phishingKitMarkers || []).length > 0 ||
    hasObfuscatedCurlPipeToShell(extracted)
  );
}

function hasDirectCredentialOrPaymentForms(extracted) {
  for (const raw of (extracted?.forms || [])) {
    const s = String(raw || "");
    if (!s || /<input\b[^>]*\btype="hidden"/i.test(s)) continue;
    if (/type="password"/i.test(s)) return true;
    if (/autocomplete="current-password"/i.test(s)) return true;
    if (/\b(?:name|placeholder|label)="[^"]*(?:password|passcode|card|cvc|cvv|private\s?key|seed\s?phrase|ssn|resident|jumin|비밀\s?번호|패스워드|카드|주민|개인\s?키|시드)[^"]*"/i.test(s)) {
      return true;
    }
    if (/(?:textarea|select)\b[^>]*(?:주민|카드|비밀\s?번호|패스워드|개인\s?키|시드|password|card|private\s?key|seed\s?phrase|ssn|resident|jumin)/i.test(s)) {
      return true;
    }
  }
  return false;
}

function thirdPartyProviderContextLooksNatural(match, extracted, url) {
  const names = [
    ...normalizeNameList(match.form?.fieldNames),
    ...normalizeNameList(match.form?.hiddenFieldNames),
    ...normalizeNameList(match.form?.queryParamNames)
  ].join(" ");
  const hay = [
    url,
    extracted?.finalUrl || "",
    extracted?.title || "",
    (extracted?.visibleText || "").slice(0, 5000),
    (extracted?.forms || []).join(" "),
    match.form?.targetPath || "",
    names
  ].join("\n").normalize("NFC");

  if (match.type === "identity_verification") {
    return /(?:pass|safehscert|oknm|cert|auth|verify|identity|본인\s?인증|본인\s?확인|휴대폰\s?인증|휴대폰\s?본인|인증|회원\s?가입|예약|검진)/i.test(hay);
  }
  if (match.type === "payment_gateway") {
    return /(?:pay|payment|checkout|billing|order|결제|주문|구매|청구)/i.test(hay);
  }
  if (match.type === "oauth_provider") {
    return /(?:oauth|login|sign\s?in|로그인|간편\s?로그인|소셜\s?로그인)/i.test(hay);
  }
  return false;
}

function thirdPartyProviderFormSafeCap(verdict, extracted, url, finalOnFree, origOnFree, finalHost) {
  const matches = matchedThirdPartyProviderForms(extracted);
  if (matches.length === 0) return null;
  if (finalOnFree || origOnFree || (finalHost && SHARED_SAAS_RE.test(finalHost))) return null;
  if (hasNonFormHardEvidence(extracted)) return null;
  if (hasDirectCredentialOrPaymentForms(extracted)) return null;

  const contextual = matches.find(m => thirdPartyProviderContextLooksNatural(m, extracted, url));
  if (!contextual) return null;

  const modelNeedsCorrection = verdict?.phishing === true ||
    verdict?.suspicious_domain === true ||
    (verdict?.phishing_score ?? 0) >= 4;
  if (!modelNeedsCorrection) return null;
  return contextual;
}

function thirdPartyProviderPageSafeCap(extracted, url, finalOnFree, origOnFree) {
  const providerPage = classifyThirdPartyProviderPage(extracted?.finalUrl || url, extracted);
  if (!providerPage) return null;
  if (finalOnFree || origOnFree) return null;
  if (hasNonFormHardEvidence(extracted)) return null;
  if (hasDirectCredentialOrPaymentForms(extracted)) return null;
  return providerPage;
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

// Normalize a WHOIS/RDAP registrant or org string for fuzzy company match.
// Strips lowercase + common corporate suffixes (EN + KO) + non-alphanumeric (keeps Hangul).
// "SK Planet Co. Ltd." → "skplanet"
// "에스케이플래닛(주)" → "에스케이플래닛"
function normalizeRegistrant(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/(co\.?\s*,?\s*ltd\.?|corporation|corp\.?|inc\.?|llc|gmbh|limited|s\.a\.|s\.r\.l\.)\b/gi, "")
    .replace(/\(주\)|주식회사|유한회사|\(유\)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "")
    .trim();
}

// Pull the Registrant or IssuerOrg value out of a single whois segment (yesnic + RDAP + CT
// joined by " | "). Returns the FIRST match — RDAP Registrant takes precedence in practice.
function extractRegistrantValue(whoisStr) {
  if (!whoisStr) return "";
  const m = String(whoisStr).match(/(?:Registrant|IssuerOrg)\s*:\s*([^|]+?)(?:\s*\||$)/i);
  return m ? m[1].trim() : "";
}

// 보조 ownership 신호: WHOIS 의 Name Server 호스트 + Contact 이메일 도메인.
// Registrant/IssuerOrg(소유권 증거, O1-whois)보다 약하므로 단독 safe 근거로 쓰지 않고,
// O1-infra-corroboration 에서 페이지 브랜드 명시 + free-hosting 부재 + hard evidence 부재와
// 결합할 때만 weak FP cap 근거로 사용한다. (예: ogog.kr 의 ns1.skplanet.com / domain_skp@skplanet.com)
function extractInfraDomains(whoisStr) {
  if (!whoisStr) return [];
  const s = String(whoisStr);
  const out = new Set();
  let m;
  const nsRe = /Name\s*Server\s*:\s*([a-z0-9.\-]+)/ig;
  while ((m = nsRe.exec(s))) out.add(m[1].toLowerCase().replace(/\.+$/, ""));
  const emailRe = /[a-z0-9._%+\-]+@([a-z0-9.\-]+\.[a-z]{2,})/ig;
  while ((m = emailRe.exec(s))) out.add(m[1].toLowerCase());
  return [...out].filter(Boolean);
}

// whois 문자열의 등록일(Registered / Registered Date / 등록일)을 epoch ms 로 파싱.
// yesnic .kr 포맷("2021. 09. 07.") + ISO("1999-02-26T...") + "YYYY/MM/DD" 모두 수용. 실패 시 null.
function whoisRegisteredDate(whoisStr) {
  if (!whoisStr) return null;
  const m = String(whoisStr).match(/Registered(?:\s*Date)?\s*:\s*(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/i);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = Date.UTC(y, mo - 1, d);
  return Number.isFinite(t) ? t : null;
}

async function applyOverrides(verdict, extracted, url, whois = "", meta = {}) {
  const overrides = [];
  let finalHost = "", origHost = "";
  try { finalHost = new URL(extracted?.finalUrl || url).hostname.toLowerCase(); } catch {}
  try { origHost  = new URL(url).hostname.toLowerCase(); } catch {}
  const finalOnFree = finalHost && FREE_HOSTING_RE.test(finalHost);
  const origOnFree  = origHost  && FREE_HOSTING_RE.test(origHost);
  const providerPage = thirdPartyProviderPageSafeCap(extracted, url, finalOnFree, origOnFree);

  // [O0] 사용자가 클릭한 원본 URL이 free-hosting인데 페이지가 정식 브랜드 도메인으로 redirect됨 — 회피형 피싱
  if (origOnFree && !finalOnFree && origHost !== finalHost) {
    overrides.push({
      rule: "O0",
      sev: "danger",
      reason: t("bg.override.O0.baitRedirect", origHost, finalHost)
    });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 8);
    verdict.suspicious_domain = true;
  }

  // [O1-whois] brand 가 RDAP Registrant 또는 CT issuer Org 와 매칭되면 OFFICIAL_DOMAINS
  // 등록 여부와 무관하게 정식 도메인으로 인정 — 큐레이션 갭(예: microsoftonline.com)을 자동 보강.
  // 매칭 대상은 독립 소유권 증거인 "Registrant:" / "IssuerOrg:" 세그먼트로 제한한다.
  // yesnic의 Domain Name / Name Server / Contact는 검사 대상 도메인을 되비추는 값이라
  // 브랜드 hallucination의 자기검증 근거로 쓰면 안 된다.
  // [free-hosting 가드] 공유 호스팅(azurewebsites.net / appspot.com / amazonaws.com 등)에선
  // Registrant 가 platform 운영사(Microsoft/Google/Amazon)로 비치지만 그 안의 테넌트 콘텐츠
  // 소유권을 증명하지 않는다. 이 평면에서 ownership 매칭은 silent FN 으로 직결 — O1 의 danger
  // 의도를 무력화하던 패치였음. 공유 호스팅에선 O1-whois 자체를 skip.
  if (verdict.brand && whois && !finalOnFree && !origOnFree) {
    const brandRaw = verdict.brand.toLowerCase().replace(/\s+ai\b/i, "").trim();
    const brandTokens = [brandRaw, ...brandRaw.split(/\s+/)]
      .map(t => t.replace(/[^a-z0-9]/g, ""))
      .filter(t => t.length >= 4);
    const ownershipEvidence = String(whois)
      .split("|")
      .map(s => s.trim())
      .filter(s => /^(Registrant|IssuerOrg)\s*:/i.test(s))
      .join(" | ");
    const ownershipLower = ownershipEvidence.toLowerCase();
    const whoisHasBrand = ownershipLower && brandTokens.some(t => ownershipLower.includes(t));
    if (whoisHasBrand) {
      overrides.push({
        rule: "O1-whois",
        sev: "safe",
        reason: t("bg.override.O1whois.match", verdict.brand),
        suppressModelReason: true
      });
      verdict.phishing = false;
      verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
      verdict.suspicious_domain = false;
      // O1 brand-mismatch 분기 진입 안 함 — 자동 검증으로 충분.
      // 단 다른 deterministic danger(O2 클립보드 셸/O3 자동 다운로드/O4 위험 URI/O7 키트 마커)는
      // 아래에서 계속 검사되어 필요 시 danger 로 덮어쓴다.
    }
  }

  // [O1-whois-transitive] OFFICIAL_DOMAINS 큐레이션은 anchor 도메인만 유지하고, sibling 은
  // WHOIS Registrant 동일성으로 런타임 추론. 방문 호스트의 Registrant 와 OFFICIAL_DOMAINS[brand]
  // anchor 도메인의 Registrant 가 정규화 후 같으면 sibling 으로 인정해 safe cap. 큐레이션 갭
  // (예: SK Planet 의 ogog.kr — okcashbag.com 과 같은 등록인) 을 자동 보강한다. 공유 호스팅
  // (FREE_HOSTING_RE) 호스트는 platform 운영사가 비치므로 skip. hard evidence (O2~O7, D1) 는
  // 별도로 cap 위에서 발화한다.
  if (
    verdict.brand &&
    !overrides.some(o => o.rule === "O1-whois") &&
    !finalOnFree && !origOnFree
  ) {
    const visitedRegistrant = normalizeRegistrant(extractRegistrantValue(whois));
    if (visitedRegistrant) {
      const officialList = lookupOfficialDomains(verdict.brand);
      if (officialList && officialList.length > 0) {
        // 방문 호스트가 이미 OFFICIAL_DOMAINS[brand] 에 직접 일치하면 transitive 룰 skip — O1 의
        // 정상 O1-safe 경로가 cap 을 거는 게 더 깔끔.
        const hostsToCheck = [...new Set([finalHost, origHost].filter(Boolean))];
        const directlyMatched = hostsToCheck.some(h =>
          officialList.some(d => h === d || h.endsWith("." + d))
        );
        if (!directlyMatched) {
          for (const anchor of officialList) {
            try {
              const anchorRdap = await fetchRdap(anchor);
              const anchorReg = normalizeRegistrant(extractRegistrantValue(anchorRdap));
              if (anchorReg && anchorReg === visitedRegistrant) {
                overrides.push({
                  rule: "O1-whois-transitive",
                  sev: "safe",
                  reason: t(
                    "bg.override.O1whoisTransitive.match",
                    verdict.brand,
                    extractRegistrantValue(whois),
                    anchor
                  ),
                  suppressModelReason: true
                });
                verdict.phishing = false;
                verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
                verdict.suspicious_domain = false;
                break;
              }
            } catch { /* anchor RDAP failed — try next */ }
          }
        }
      }
    }
  }

  // [O1] 브랜드 ↔ 정식 도메인 불일치 (가장 흔한 사칭 케이스)
  if (verdict.brand && !overrides.some(o => o.rule === "O1-whois") && !overrides.some(o => o.rule === "O1-whois-transitive")) {
    const officialList = lookupOfficialDomains(verdict.brand);
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
              reason: t("bg.override.O1.freeHostStrong", verdict.brand, officialList[0], offendingFreeHost)
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
                ? t("bg.override.O1.docPagesMention", verdict.brand)
                : t("bg.override.O1.freeHostWarn", verdict.brand, officialList[0], offendingFreeHost),
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
          // 일반(free-hosting 아닌) 도메인에서 브랜드 ↔ 도메인 불일치.
          // 단독 mismatch 만으로는 정상 referral·뉴스·문서가 많아 warn(6) 으로 캡핑.
          // 다만 password input/auto-download/위험 URI 같은 high-confidence 증거가 더 있으면
          // rsig.org 류 깨끗해 보이는 도메인에서도 분명한 사칭 phishing 이므로 danger 로 elevate.
          if (highConfidencePhishEvidence) {
            overrides.push({
              rule: "O1",
              sev: "danger",
              reason: t("bg.override.O1.brandMismatchWithEvidence", verdict.brand, officialList[0], offenders[0])
            });
            verdict.phishing = true;
            verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 9);
            verdict.suspicious_domain = true;
          } else {
            overrides.push({
              rule: "O1",
              sev: "warn",
              reason: t("bg.override.O1.brandMismatchOnly", verdict.brand, officialList[0], offenders[0])
            });
            verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 6);
            verdict.suspicious_domain = true;
          }
        }
      } else {
        // 모든 호스트가 정식 도메인에 매칭 → 모델 오판정 완화 (강제 0이 아닌 상한 캡핑)
        // 다른 오버라이드(O2/O3/O4)가 있으면 여전히 위험 판정 가능
        overrides.push({
          rule: "O1-safe",
          sev: "safe",
          reason: t("bg.override.O1.brandSafe", verdict.brand, officialList[0]),
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
      overrides.push({ rule: "O2", sev: "danger", reason: t("bg.override.O2.clipboardShell", text.slice(0, 120)) });
      verdict.phishing = true;
      verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 10);
      break;
    }
  }

  // [O3] 스캔 중 자동 다운로드 시도
  const autoDl = extracted?.behaviors?.autoDownloads || [];
  if (autoDl.length > 0) {
    const f = autoDl[0]?.filename || autoDl[0]?.url || "(unknown)";
    overrides.push({ rule: "O3", sev: "danger", reason: t("bg.override.O3.autoDownload", autoDl.length, f) });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 9);
  }

  // [O4] 위험 URI 스킴 링크 존재
  const dangerUris = extracted?.behaviors?.dangerousUris || [];
  if (dangerUris.length > 0) {
    overrides.push({ rule: "O4", sev: "danger", reason: t("bg.override.O4.dangerousUri", dangerUris.slice(0,3).join(", ")) });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 9);
  }

  // [O7] Phishing kit Tier-1 시그너처 + credential 폼.
  // logo.clearbit.com / api.screenshotmachine.com / atob() → URL 같은 패턴은 정상 사이트에서
  // 거의 안 나오는 키트 디자인 패턴 (피해자 이메일 도메인 기반 동적 브랜딩, base64 난독화된
  // exfil 엔드포인트). 같은 페이지에 password input 까지 있으면 brand 인식 실패하더라도 확정.
  const kitMarkers = extracted?.behaviors?.phishingKitMarkers || [];
  if (kitMarkers.length > 0 && hasCredentialLikeForms(extracted)) {
    overrides.push({
      rule: "O7",
      sev: "danger",
      reason: t("bg.override.O7.kitMarker", kitMarkers.slice(0,3).join(", "))
    });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 9);
    verdict.suspicious_domain = true;
  }

  // [D1] 영구 denylist hit — 이전에 phishing(>=7)으로 확정된 호스트.
  // O5/O6 가 우회하지 못하도록 danger 푸시. allowlist 는 scanUrl 상단에서 이미 처리됨.
  if (finalHost && !providerPage && await isDenylisted(finalHost)) {
    overrides.push({ rule: "D1", sev: "danger", reason: t("bg.override.D1.denylistHit", finalHost) });
    verdict.phishing = true;
    verdict.phishing_score = Math.max(verdict.phishing_score ?? 0, 8);
    verdict.suspicious_domain = true;
  }

  // [O12] Direct visit to a recognized provider page. 사용자가 KCB/PASS 같은 provider URL 로
  // 이동한 뒤 별도 스캔이 돌면 source brand(예: Howcare)를 current brand로 끌고 와 domain
  // mismatch 를 만들면 안 된다. provider page 자체는 provider brand로 분리하고, hard evidence가
  // 없을 때 모델의 inherited-brand 오판정을 cap 한다.
  if (providerPage && !overrides.some(o => ["O2", "O3", "O4", "O7"].includes(o.rule))) {
    for (let i = overrides.length - 1; i >= 0; i--) {
      if (overrides[i].sev === "warn" || overrides[i].rule === "O1") overrides.splice(i, 1);
    }
    overrides.push({
      rule: "O12-third-party-provider-page",
      sev: "safe",
      reason: t("bg.override.O12.thirdPartyProviderPage", providerPage.brand, providerPage.host),
      suppressModelReason: true
    });
    verdict.brand = providerPage.brand;
    verdict.phishing = false;
    verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
    verdict.suspicious_domain = false;
    verdict.third_party_provider = true;
    verdict.provider = providerPage.provider;
    verdict.provider_type = providerPage.type;
  }

  // [O9] First-party developer install command. OFFICIAL_DOMAINS 를 계속 늘리는 대신,
  // 브랜드 토큰이 등록 도메인 SLD 와 정확히 일치하고 설치 명령의 HTTPS URL 도 같은 등록 도메인일
  // 때만 LLM 의 "curl | sh == malicious" FP 를 cap 한다. 클립보드 강제쓰기, 난독화, captcha/
  // verification lure, free/shared hosting, credential form, auto-download, dangerous URI, phishing kit
  // 중 하나라도 있으면 발화하지 않는다. 세션/영구 trust 에도 넣지 않아 매번 재평가한다.
  if (
    !overrides.some(o => o.sev === "danger") &&
    !overrides.some(o => o.rule === "O1" && o.sev !== "safe")
  ) {
    const install = firstPartyInstallCommandSafeCap(verdict, extracted, url, finalOnFree, origOnFree, finalHost);
    if (install) {
      overrides.push({
        rule: "O9-first-party-install",
        sev: "safe",
        reason: t("bg.override.O9.firstPartyInstall", verdict.brand, install.domain),
        suppressModelReason: true
      });
      verdict.phishing = false;
      verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
      verdict.suspicious_domain = false;
    }
  }

  // [O11] Cross-domain form to recognized third-party provider. 한국 본인확인/결제 생태계에서는
  // 회원사 페이지가 공인 provider 로 hidden POST 하는 정상 플로우가 흔하다. cross-domain POST 는
  // 위험 점수 근거가 아니라 context-expansion 신호로 취급하고, provider endpoint/파라미터 시그니처가
  // 맞고 hard evidence 가 없을 때만 모델의 "외부 폼 전송" 오판을 cap 한다.
  if (!overrides.some(o => o.sev === "danger")) {
    const providerFlow = thirdPartyProviderFormSafeCap(verdict, extracted, url, finalOnFree, origOnFree, finalHost);
    if (providerFlow) {
      for (let i = overrides.length - 1; i >= 0; i--) {
        if (overrides[i].sev === "warn") overrides.splice(i, 1);
      }
      overrides.push({
        rule: "O11-third-party-form-provider",
        sev: "safe",
        reason: t("bg.override.O11.thirdPartyFormProvider", providerFlow.provider, providerFlow.form?.targetHost || providerFlow.matchedDomain),
        suppressModelReason: true
      });
      verdict.phishing = false;
      verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
      verdict.suspicious_domain = false;
    }
  }

  // [O5] 사용자 개인 신뢰 도메인 (즐겨찾기 / 빈번 방문 / Top Sites)
  // FR-033: meta.bypassUserTrust 가 true 면 (regression mode) O5 전체 skip — 다른 사용자
  // 브라우저에서 회귀 검증해도 결과 결정성을 보장.
  if (!meta.bypassUserTrust && !overrides.some(o => o.sev === "danger") && finalHost) {
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
          reason: t("bg.override.O5.personalTrust", o5Domain),
          suppressModelReason: true });
        verdict.phishing = false;
        verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
        verdict.suspicious_domain = false;
      }
    } catch {}
  }

  // [O6] 공개 랭킹 기반 전세계 인기 도메인 — 위험 신호 없으면 FP 방지
  if (!overrides.some(o => o.sev === "danger")) {
    // POPULAR_DOMAINS 갱신 사고로 shared-hosting 이 들어와도 exact/slice 매칭이 안 먹게 방어.
    const o6FinalHostIsExcluded = finalHost
      ? isPopularDomainTrustExcluded(finalHost)
      : false;
    const o6SliceCandidate = finalHost && finalHost.includes(".")
      ? finalHost.split(".").slice(-2).join(".")
      : null;
    const o6SliceIsExcluded = o6SliceCandidate
      ? isPopularDomainTrustExcluded(o6SliceCandidate)
      : false;
    const o6Domain = finalHost && !o6FinalHostIsExcluded && POPULAR_DOMAINS.has(finalHost)
      ? finalHost
      : (o6SliceCandidate && !o6SliceIsExcluded && POPULAR_DOMAINS.has(o6SliceCandidate))
        ? o6SliceCandidate
        : null;
    if (o6Domain) {
      overrides.push({ rule: "O6", sev: "safe",
        reason: t("bg.override.O6.popularDomain", o6Domain), suppressModelReason: true });
      verdict.phishing = false;
      verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
      verdict.suspicious_domain = false;
    }
  }

  // [O8] 멀티테넌트 SaaS 플랫폼 (FR-029/030/031). hard evidence·외부 redirect 가 없을 때만,
  // LLM 의 약신호 단독 격상(brand mention/login page/many buttons)을 결정론적으로 cap 한다.
  // O1-safe 와 달리 브랜드 소유권을 주장하지 않으므로 DOMAIN_TRUST_RULES 에 넣지 않는다 —
  // 세션/영구 trust 로 굳히지 않고 매 스캔 재평가(테넌트 콘텐츠는 가변, FR-030).
  if (!overrides.some(o => o.sev === "danger") && finalHost && SHARED_SAAS_RE.test(finalHost)) {
    overrides.push({ rule: "O8-saas", sev: "safe",
      reason: t("bg.override.O8.sharedSaas", finalHost), suppressModelReason: true });
    verdict.phishing = false;
    verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
    verdict.suspicious_domain = false;
  }

  // [O1-infra-corroboration] WHOIS Name Server / Contact 이메일 도메인이 어떤 브랜드의 공식
  // 도메인과 매칭되고, 그 브랜드(모회사 포함)가 페이지 텍스트/제목/링크에 명시되어 있을 때만
  // weak FP 를 cap 한다. Registrant/IssuerOrg(O1-whois)보다 약한 보조 증거라서 단독 safe 금지 —
  // (1) free-hosting 아님 (2) hard evidence(danger) 없음 (3) 페이지에 조직/브랜드 명시
  // (4) NS/Contact 도메인이 그 브랜드 공식 도메인과 매칭. 네 조건 모두 충족 시에만 score ≤ 3.
  // O1-whois/transitive/safe 가 이미 처리한 경우는 skip. 소유권 주장이 아니므로 DOMAIN_TRUST_RULES 제외.
  if (
    !overrides.some(o => o.sev === "danger") &&
    !overrides.some(o => ["O1-whois", "O1-whois-transitive", "O1-safe"].includes(o.rule)) &&
    !finalOnFree && !origOnFree
  ) {
    const infra = extractInfraDomains(whois);
    if (infra.length > 0) {
      const pageHay = ((extracted?.title || "") + " " +
                       (extracted?.visibleText || "") + " " +
                       (extracted?.anchors || []).join(" "))
        .normalize("NFC").toLowerCase();
      let matchedBrand = null, matchedInfra = null;
      for (const [brandKey, domains] of Object.entries(OFFICIAL_DOMAINS)) {
        const hit = infra.find(d => domains.some(off => d === off || d.endsWith("." + off)));
        if (!hit) continue;
        if (pageHay.includes(brandKey.normalize("NFC").toLowerCase())) {
          matchedBrand = brandKey; matchedInfra = hit; break;
        }
      }
      if (matchedBrand) {
        overrides.push({ rule: "O1-infra-corroboration", sev: "safe",
          reason: t("bg.override.O1infra.match", matchedBrand, matchedInfra), suppressModelReason: true });
        verdict.phishing = false;
        verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
        verdict.suspicious_domain = false;
      }
    }
  }

  // [O10] 모델 자기모순 보정. Gemini Nano 가 가끔 phishing=false/suspicious_domain=false 와
  // "legitimate/no phishing indicators" reason 을 내면서 score 만 7+ 로 주는 경우가 있다.
  // danger evidence 가 없을 때만 score 를 reason/boolean 과 일관되게 cap 한다.
  if (!overrides.some(o => o.sev === "danger") && hasModelSafeScoreContradiction(verdict, extracted)) {
    overrides.push({
      rule: "O10-model-consistency",
      sev: "safe",
      reason: t("bg.override.O10.modelConsistency"),
      suppressModelReason: true
    });
    verdict.phishing = false;
    verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
    verdict.suspicious_domain = false;
  }

  // [O13] Established .kr domain with a real corporate registrant — curation-free FP cap.
  // LM 이 brand 를 못 잡거나 OFFICIAL_DOMAINS 에 없어도, .kr 레지스트리에 실재 법인 registrant 가
  // 있고 도메인이 1년 이상 됐으면 정상으로 본다. OFFICIAL_DOMAINS 무한 확장(브랜드×별칭 매트릭스)
  // 대신 증거(.kr 실명 등록 + 도메인 나이)로 일반화. 다른 override(danger/warn/safe)가 하나라도
  // 있으면 발화 안 함 — 특히 O1 brand-mismatch warn(사칭 의심)을 덮지 않게 한다. 소유권 주장이
  // 아니므로 DOMAIN_TRUST_RULES 제외(매 스캔 재평가). hard evidence 는 항상 우선.
  if (
    !overrides.some(o => o.sev === "danger" || o.sev === "warn") &&
    !overrides.some(o => o.sev === "safe") &&
    (verdict.phishing_score ?? 0) > 3 &&
    finalHost && /\.kr$/i.test(finalHost) &&
    !finalOnFree && !origOnFree
  ) {
    const registrant = extractRegistrantValue(whois);
    const PRIVACY_RE = /(privacy|redact|proxy|whoisguard|protect|withheld|비공개|개인정보\s*보호|정보보호)/i;
    const realOrg = registrant.length >= 2 && !PRIVACY_RE.test(registrant);
    const regDate = whoisRegisteredDate(whois);
    const ageDays = regDate != null ? (Date.now() - regDate) / 86400000 : null;
    if (realOrg && ageDays != null && ageDays >= 365) {
      overrides.push({
        rule: "O13-established-kr-registrant",
        sev: "safe",
        reason: t("bg.override.O13.establishedKr", registrant, Math.floor(ageDays / 365)),
        suppressModelReason: true
      });
      verdict.phishing = false;
      verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
      verdict.suspicious_domain = false;
    }
  }

  // [O14] Brand 가 자기 등록도메인과 정확히 일치 + 노후 도메인 — curation-free FP cap (TLD 무관).
  // LM 이 식별한 brand 가 방문 호스트의 등록 도메인 레이블과 정확히 같으면(예: brand "Lpoint" ↔
  // lpoint.com), 그 페이지는 *다른* 브랜드를 사칭하는 게 아니다(피싱의 본질은 사칭). 정확 일치라
  // combosquat("lpoint-verify.com")은 매칭 안 되고, 노후(≥365일)·free-hosting 아님으로 신생
  // brandable 도메인 탈취를 거른다. O13(.kr registrant)이 못 잡는 .com 등을 brand-domain 동일성
  // 으로 보강. 다른 override(danger/warn/safe)가 하나라도 있으면 발화 안 함(특히 O1 사칭 warn 보존).
  // 소유권 주장 아님(DOMAIN_TRUST_RULES 제외, 매 스캔 재평가). hard evidence 우선.
  if (
    !overrides.some(o => o.sev === "danger" || o.sev === "warn") &&
    !overrides.some(o => o.sev === "safe") &&
    (verdict.phishing_score ?? 0) > 3 &&
    verdict.brand &&
    !finalOnFree && !origOnFree &&
    brandMatchesRegisteredDomain(verdict.brand, extracted?.finalUrl || url)
  ) {
    const regDate = whoisRegisteredDate(whois);
    const ageDays = regDate != null ? (Date.now() - regDate) / 86400000 : null;
    if (ageDays != null && ageDays >= 365) {
      overrides.push({
        rule: "O14-brand-owns-domain",
        sev: "safe",
        reason: t("bg.override.O14.brandOwnsDomain", verdict.brand, Math.floor(ageDays / 365)),
        suppressModelReason: true
      });
      verdict.phishing = false;
      verdict.phishing_score = Math.min(verdict.phishing_score ?? 0, 3);
      verdict.suspicious_domain = false;
    }
  }

  if (overrides.length > 0) {
    const prefix = t("bg.override.prefix",
      overrides.map(o => o.rule).join("+"),
      overrides.map(o => o.reason).join(" · "));
    const suppressModelReason = overrides.some(o => o.suppressModelReason) && !overrides.some(o => o.sev === "danger");
    verdict.reason = suppressModelReason ? prefix : prefix + (verdict.reason || "");
    console.log("applyOverrides:", overrides);
  }

  // 세션 자동 신뢰 호스트 마킹 — 도메인 화이트리스트 기반 안전 판정(O1-safe/O5/O6)만 발동했고
  // 위험 시그널이 전혀 없을 때만. 콘텐츠 시그널(예: 클립보드 셸 페이로드)이 잡혔다면 트러스트 안 함.
  // 이후 같은 exact host의 다른 URL은 scanUrl 상단에서 LLM 호출 없이 short-circuit.
  const DOMAIN_TRUST_RULES = new Set(["O1-safe", "O5", "O6"]);
  const domainTrustRule = overrides.find(o => DOMAIN_TRUST_RULES.has(o.rule));
  const hasDomainTrustRule = !!domainTrustRule;
  const hasAnyDanger = overrides.some(o => o.sev === "danger");
  if (hasDomainTrustRule && !hasAnyDanger) {
    try {
      await rememberSessionTrustedHost(extracted?.finalUrl || url, domainTrustRule.rule);
    } catch {}
  }
}

async function dispatchResult(source, url, verdict, meta) {
  const sev = severityFor(verdict);
  const head = sev === "danger" ? t("notif.headDanger") : sev === "warn" ? t("notif.headWarn") : t("notif.headOk");
  const reason = verdict.reason || "";
  const tail = meta?.cached ? t("notif.tailCached") : meta?.skipped ? t("notif.tailSkipped") : meta?.allowed ? t("notif.tailAllowed") : "";

  if (source === "owa" && meta?.tabId != null) {
    try {
      await chrome.tabs.sendMessage(meta.tabId, {
        type: "verdict-banner",
        url, verdict, severity: sev, anchorId: meta.anchorId
      });
    } catch (e) { /* tab gone */ }
    return;
  }

  if (source === "navigation" && meta?.tabId != null) {
    const targetUrlForTab = verdict?.final_url || url;
    const tabMatch = await currentTabStillMatchesScan(meta.tabId, targetUrlForTab);
    if (!tabMatch.matches) {
      console.log("navigation verdict ignored — tab URL no longer matches scan target:", {
        targetUrl: targetUrlForTab,
        currentUrl: tabMatch.currentUrl
      });
      return;
    }
  }

  // 위험 + 사용자가 활성 탭에 있는 경우(action/popup/navigation/download) → 탭 가로채기.
  // contextMenu는 사용자가 아직 방문 안 했으므로 알림만.
  // 사용자의 적극적 액션(navigation/action/popup)은 fresh user intent 이므로 캐시 hit 이어도 intercept 발화.
  // 그렇지 않으면 OWA pre-scan 의 캐시가 click-time warning.html 가로채기를 죽임.
  const interceptSources = new Set(["action", "popup", "navigation", "download-silent-ok"]);
  const isUserIntent = source === "navigation" || source === "action" || source === "popup";
  if (sev === "danger" && !meta?.allowed && (isUserIntent || !meta?.cached) && interceptSources.has(source) && meta?.tabId != null) {
    try {
      const targetUrlForTab = verdict?.final_url || url;
      const tabMatch = await currentTabStillMatchesScan(meta.tabId, targetUrlForTab);
      if (!tabMatch.matches) {
        console.log("tab intercept skipped — tab URL no longer matches scan target:", {
          source,
          targetUrl: targetUrlForTab,
          currentUrl: tabMatch.currentUrl
        });
        return;
      }
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
  if (source === "popup") {
    // popup 이 자체 UI 로 verdict 표시. 추가 OS 알림은 중복 UX 이고, 알림이 뜨는 순간
    // popup blur 로 자동 닫힐 수 있어 결과 렌더링을 방해할 잠재 위험이 있다.
    return;
  }

  // notify 실패(예: chrome.notifications.create 가 iconUrl 디코딩 못함, OS-level 알림 권한 거부 등)가
  // scan verdict 손실로 이어지면 안 된다 — 알림은 UX 부수효과이고 verdict 는 핵심 출력.
  try {
    await notify(sev, `${head}${tail}`, `${url}\n${clamp(reason, 200)}`);
  } catch (e) {
    console.warn("notify failed:", e);
  }
}

// ───────────────────────── 트리거 핸들러 ─────────────────────────

// A. 컨텍스트 메뉴
// (regenerateIcons 제거됨 — v0.2.1 정적 PNG 도입 후 manifest 의 default_icon + icons/notif-*.png
//  를 직접 쓰면 충분. 과거 runtime OffscreenCanvas 경로는 ImageData 가 chrome.runtime 메시지의
//  구조화 복제에서 깨져 setIcon 이 거부하던 회귀가 있었고, notification 도 static PNG 로 직접
//  서빙하면서 storage.local.notifIcons 도 더 이상 필요 없다.)

chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.contextMenus.create({
      id: "scan-link",
      title: "이 링크 피싱 검사",
      contexts: ["link"]
    });
  } catch (e) { /* duplicate */ }
  await updateBadge();
});
chrome.runtime.onStartup.addListener(async () => {
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
    const meta = {
      tabId,
      anchorId: msg.anchorId,
      bypassCache: !!msg.bypassCache,
      // FR-033: 회귀 테스트가 사용자 환경 의존 신호 (O5 personal trust = bookmarks/history/topSites)
      // 를 우회해 결정론적 verdict 를 얻기 위한 플래그. 정상 사용자 흐름에선 송신하지 않음.
      bypassUserTrust: !!msg.bypassUserTrust,
    };
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
      // offscreen 의 OCR_DIAGNOSTICS 응답 shape: { available, languages }
      let ocrInfo = { available: false, languages: [] };
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
  if (msg?.type === "clickGuardWarnApprovalStatus" && msg.url) {
    getClickGuardWarnApproval(msg.url)
      .then(entry => sendResponse({
        approved: !!entry,
        host: entry?.host,
        expiresAt: entry?.expiresAt
      }))
      .catch(e => sendResponse({ approved: false, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === "rememberClickGuardWarnApproval" && msg.url) {
    rememberClickGuardWarnApproval(msg.url, msg.score)
      .then(sendResponse)
      .catch(e => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
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
  if (msg?.type === "resetHistoryForUrl" && msg.url) {
    (async () => {
      try {
        let host = "";
        try { host = new URL(msg.url).hostname.toLowerCase(); } catch {}
        // 1) 해당 URL 의 verdict 캐시 + warning vid 제거
        const sessionKeysToRemove = [];
        const urlHash = await sha256Hex(msg.url);
        sessionKeysToRemove.push("v:" + urlHash, "verdict:" + urlHash);
        // 같은 host 가 들어있는 다른 verdict cache 도 청소
        const all = await chrome.storage.session.get();
        for (const k of Object.keys(all)) {
          const v = all[k];
          if (k.startsWith("v:") || k.startsWith("verdict:")) {
            if (v && typeof v === "object" && typeof v.url === "string") {
              try { if (new URL(v.url).hostname.toLowerCase() === host) sessionKeysToRemove.push(k); }
              catch {}
            }
          }
        }
        // 2) RDAP / CT 캐시 (host 키) 제거
        if (host) sessionKeysToRemove.push("rdap:" + host, "cert:" + host);
        if (sessionKeysToRemove.length) await chrome.storage.session.remove([...new Set(sessionKeysToRemove)]);
        // 3) exact-host 세션 신뢰도 제거 — 다음 검사는 다시 추출부터 시작.
        if (host) {
          const { safeHosts = [] } = await chrome.storage.session.get("safeHosts");
          const nextSafeHosts = safeHosts.filter(e => e?.host !== host);
          if (nextSafeHosts.length !== safeHosts.length) {
            await chrome.storage.session.set({ safeHosts: nextSafeHosts });
          }
        }
        // 4) click guard warn 승인도 제거 — 다음 social/copy/download 클릭은 다시 확인받는다.
        if (host) {
          const { clickGuardWarnApprovals = [] } = await chrome.storage.session.get("clickGuardWarnApprovals");
          const nextApprovals = clickGuardWarnApprovals.filter(e => e?.host !== host && e?.urlHash !== urlHash);
          if (nextApprovals.length !== clickGuardWarnApprovals.length) {
            await chrome.storage.session.set({ clickGuardWarnApprovals: nextApprovals });
          }
        }

        // 5) 영구 denylist 에서 host hash 제거
        let denyRemoved = 0;
        if (host) {
          const hostHash = await sha256Hex(host);
          const { phishingDenylist = [] } = await chrome.storage.local.get("phishingDenylist");
          const filtered = phishingDenylist.filter(h => h !== hostHash);
          denyRemoved = phishingDenylist.length - filtered.length;
          if (denyRemoved > 0) await chrome.storage.local.set({ phishingDenylist: filtered });
        }
        // 6) host allowlist 는 의도와 다르므로 건드리지 않음 — "허용" 한 결정은 유지.

        // 7) 모듈 메모리 캐시 무효화
        _denylistCache = null;

        console.log("resetHistoryForUrl:", { host, denyRemoved, sessionRemoved: sessionKeysToRemove.length });
        sendResponse({ ok: true, host, denyRemoved, sessionRemoved: sessionKeysToRemove.length });
      } catch (e) {
        console.warn("resetHistoryForUrl failed:", e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }
  if (msg?.type === "resetHistory") {
    (async () => {
      try {
        // 삭제 전 카운트 — 응답에 포함해서 사용자에게 보여줌.
        const before = await chrome.storage.local.get(["phishingDenylist", "allowlistHosts"]);
        const denylistEntries = (before.phishingDenylist || []).length;
        const allowlistEntries = (before.allowlistHosts || []).length;

        // 1) session storage 전체 비움 — verdict cache (v:), warning vid (verdict:),
        //    lastVerdict, RDAP/CT 캐시 (rdap:/cert:), safeHosts, allowlist (legacy) 등.
        await chrome.storage.session.clear();

        // 2) local storage 의 denylist + 호스트 allowlist 만 비움. notifIcons 는 보존
        //    (다시 생성 비용 발생 방지).
        await chrome.storage.local.set({ phishingDenylist: [], allowlistHosts: [] });

        // 3) 모듈 스코프 메모리 캐시 무효화 — 다음 isDenylisted/isAllowlisted/
        //    getUserTrustedDomains 호출 시 storage 에서 fresh load.
        _denylistCache = null;
        _allowlistCache = null;
        _userTrustedDomains = null;

        console.log("history reset — cleared:", { denylistEntries, allowlistEntries });
        sendResponse({ ok: true, cleared: { denylistEntries, allowlistEntries } });
      } catch (e) {
        console.warn("resetHistory failed:", e);
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
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
    await notify("danger", t("notif.downloadCancelTitle"), t("notif.downloadCancelBody", hostPage));
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
