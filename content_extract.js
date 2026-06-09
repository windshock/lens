// content_extract.js — chrome.scripting.executeScript 로 숨김 탭에 1회 주입.
// DOM/forms/anchors/imgs/visibleText + behaviors(클립보드 버퍼, 위험 URI, 사회공학 텍스트 등) 직렬화.

(function extract() {
  // ── 클립보드 후크가 남긴 버퍼(MAIN→ISOLATED 브리지: documentElement dataset) ──
  function readClipboardBuffer() {
    try {
      const raw = document.documentElement.getAttribute("data-pg-clipboard");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  // ── DOM 직렬화 헬퍼 ──
  function serializeAnchor(a) {
    const text = (a.innerText || a.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    return `${a.href} | ${text}`;
  }
  // 컨트롤의 accessible label 추출: aria-label → aria-labelledby → <label for> →
  // 감싸는 <label> → 자기 텍스트(button) → title/placeholder 순. 버튼 텍스트/입력 라벨이
  // 직렬화에 들어가야 LLM 이 "휴대폰 본인인증" 같은 의미를 보고 더미 버튼과 구별한다.
  function accessibleLabel(el) {
    let label = (el.getAttribute("aria-label") || "").trim();
    if (!label && el.getAttribute("aria-labelledby")) {
      label = el.getAttribute("aria-labelledby").split(/\s+/)
        .map(id => { const n = document.getElementById(id); return n ? (n.innerText || n.textContent || "") : ""; })
        .join(" ").trim();
    }
    if (!label && el.id) {
      try {
        const sel = 'label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"')) + '"]';
        const lbl = document.querySelector(sel);
        if (lbl) label = (lbl.innerText || lbl.textContent || "").trim();
      } catch {}
    }
    if (!label && el.closest) {
      const wrap = el.closest("label");
      if (wrap) label = (wrap.innerText || wrap.textContent || "").trim();
    }
    if (!label) label = (el.innerText || el.textContent || "").trim();
    if (!label) label = (el.getAttribute("title") || el.getAttribute("placeholder") || "").trim();
    return label.replace(/\s+/g, " ").slice(0, 80);
  }

  function serializeControl(el, label) {
    const tag = el.tagName.toLowerCase();
    const attrs = ["name", "type", "placeholder", "id", "autocomplete", "action", "method"];
    const pairs = attrs
      .map(k => [k, el.getAttribute(k)])
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}="${String(v).slice(0, 60)}"`);
    if (label) pairs.push(`label="${label}"`);
    return `<${tag} ${pairs.join(" ")}>`;
  }

  function registeredDomainFromHost(host) {
    const h = String(host || "").toLowerCase().replace(/\.+$/, "");
    if (!h) return "";
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return h;
    const parts = h.split(".");
    if (parts.length <= 2) return h;
    const twoLevelTld = new Set(["co.kr", "or.kr", "go.kr", "ne.kr", "co.jp", "co.uk", "com.au"]);
    const last2 = parts.slice(-2).join(".");
    const last3 = parts.slice(-3).join(".");
    if (parts.length >= 3 && twoLevelTld.has(last2)) return last3;
    return last2;
  }

  function fieldNamesFor(form, selector) {
    const names = new Set();
    for (const el of form.querySelectorAll(selector)) {
      const name = (el.getAttribute("name") || "").trim();
      if (name) names.add(name.slice(0, 80));
      if (names.size >= 20) break;
    }
    return [...names];
  }

  function serializeCrossDomainForm(form) {
    const actionAttr = (form.getAttribute("action") || "").trim();
    if (!actionAttr) return null;
    let actionUrl;
    try {
      actionUrl = new URL(actionAttr, location.href);
    } catch {
      return null;
    }
    if (!/^https?:$/i.test(actionUrl.protocol)) return null;

    const sourceHost = location.hostname.toLowerCase();
    const targetHost = actionUrl.hostname.toLowerCase();
    const sourceDomain = registeredDomainFromHost(sourceHost);
    const targetDomain = registeredDomainFromHost(targetHost);
    if (!sourceDomain || !targetDomain || sourceDomain === targetDomain) return null;

    const fieldNames = fieldNamesFor(form, "input[name], textarea[name], select[name], button[name]");
    const hiddenFieldNames = fieldNamesFor(form, "input[type='hidden'][name]");
    const queryParamNames = [...new Set([...actionUrl.searchParams.keys()].map(k => k.slice(0, 80)))].slice(0, 20);
    return {
      action: actionUrl.origin + actionUrl.pathname,
      method: (form.getAttribute("method") || "get").toLowerCase(),
      sourceHost,
      sourceDomain,
      targetHost,
      targetDomain,
      targetPath: actionUrl.pathname.slice(0, 160),
      queryParamNames,
      fieldNames,
      hiddenFieldNames
    };
  }

  // credential / PII / 제출 관련 컨트롤 라벨. 이 패턴에 맞는 버튼만 FORMS(보안 의미 있는
  // 입력/제출 표면)로 분류하고, 나머지 라벨 버튼은 UI_CONTROLS 로 분리, 라벨 없는 버튼은 버린다.
  const CREDENTIAL_CTRL_RE = new RegExp(
    "(로그\\s?인|로그온|sign\\s?in|log\\s?in|signin|" +
    "인증|본인\\s?인증|본인\\s?확인|verify|otp|인증\\s?번호|" +
    "비밀\\s?번호|패스워드|password|passcode|" +
    "아이디|이메일|email|" +
    "다음|next|확인|제출|submit|계속|continue|" +
    "가입|회원\\s?가입|sign\\s?up|register|" +
    "결제|pay|payment|송금|이체|전송|보내기|" +
    "휴대폰|전화\\s?번호|생년월일|주민)",
    "i"
  );

  // ── 시그널 감지: 위험 URI 스킴, 사회공학 텍스트, 다운로드 버튼, copy-button heuristic ──
  const DANGEROUS_URI = /^(applescript|ms-msdt|ms-msvr|ms-search|search-ms|shell|vbscript|jar|chrome|about):/i;
  const EXEC_EXT = /\.(exe|dmg|pkg|msi|bat|cmd|ps1|vbs|jar|scr|hta|app|command|scpt|sh|run|deb|rpm|appimage)(\?|$)/i;
  const SOCIAL_RE = new RegExp(
    "(?:win\\s*\\+\\s*r|⊞\\s*\\+?\\s*r|press\\s+(?:ctrl|cmd|⊞)\\s*\\+\\s*\\w|" +
    "i\\W?m\\s+not\\s+a\\s+robot|verify\\s+you\\s+are\\s+human|cloudflare\\s+(?:verification|challenge)|" +
    "복사\\s*(?:후|해|하)|붙여넣|터미널|보안\\s*확인|" +
    "click\\s+(?:below|to\\s+verify|here\\s+to)|paste\\s+(?:into|in\\s+the)|" +
    "open\\s+(?:powershell|terminal|run|cmd))",
    "i"
  );

  // 단어 하나짜리 powershell/cmd/curl 은 뉴스·문서·채팅 UI에서 너무 흔해 FP를 만든다.
  // 실행 의도가 보이는 옵션/파이프/다운로드/난독화 패턴만 shellHits/codeSnippets 후보로 사용한다.
  const SHELL_EXEC_RE = new RegExp(
    "(?:" +
      "\\bpowershell(?:\\.exe)?\\s+(?:-[a-z]+|/[a-z]+|iex\\b|iwr\\b|irm\\b|invoke-|encodedcommand\\b|enc\\b|nop\\b|w\\s+hidden)" +
      "|\\bpwsh(?:\\.exe)?\\s+(?:-[a-z]+|/[a-z]+|iex\\b|iwr\\b|irm\\b|invoke-|encodedcommand\\b|enc\\b|nop\\b|w\\s+hidden)" +
      "|\\binvoke-?webrequest\\b" +
      "|\\binvoke-?expression\\b" +
      "|\\biex\\s*(?:\\(|\\$|\\()" +
      "|\\bmshta\\s+(?:https?://|javascript:|vbscript:)" +
      "|\\bcmd\\.exe\\s+/(?:c|k)\\b" +
      "|\\bcurl\\s+[^|]{1,300}\\|\\s*(?:bash|sh|zsh)\\b" +
      "|\\bwget\\s+[^|]{1,300}\\|\\s*(?:bash|sh|zsh)\\b" +
      "|\\beval\\s*\\(" +
      "|\\bbase64\\s+-d\\b" +
      "|\\bchmod\\s+\\+x\\b" +
      "|\\btr\\s+['\"][^'\"]+['\"]\\s+['\"][^'\"]+['\"]" +
    ")",
    "i"
  );

  // clipboard.writeText literal 추출(static fallback, 후크 못 잡은 경우 대비)
  const staticClipboardWrites = [];
  function collectClipboardWriteLiterals(src, type) {
    if (!src) return;
    const re = /(?:navigator\.)?clipboard\.writeText\s*\(\s*([`'"])([\s\S]{1,2000}?)\1\s*\)/g;
    let m;
    while ((m = re.exec(src)) && staticClipboardWrites.length < 20) {
      staticClipboardWrites.push({ type, text: m[2].slice(0, 2000), ts: Date.now() });
    }
  }

  // Phishing kit signature markers — Tier 1 (정상 사이트에서 거의 안 나오는 패턴).
  // - clearbit-logo: logo.clearbit.com/${domain} — 피해자 이메일 도메인 기반 로고 동적 페치
  // - screenshotmachine: 피해자 회사 페이지 스크린샷을 배경으로 깖
  // - atob-url: atob() 결과가 ../*.php/.aspx 또는 http URL — 자격증명 exfil 엔드포인트 base64 난독화
  // - telegram/discord/webhook: 자격증명 폼과 결합될 때 강한 exfil 시그널
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
  const phishingKitMarkersSet = new Set();
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

  // 인라인 script 본문 → clipboard.writeText literal + phishing kit marker 추출
  for (const s of document.querySelectorAll("script:not([src])")) {
    const src = s.textContent || "";
    collectClipboardWriteLiterals(src, "inlineScriptLiteral");
    collectPhishingKitMarkers(src);
  }

  // 1) 잡음 태그 제거 제거됨 (사용자 활성 탭에 주입되므로 DOM을 파괴하면 안 됨)
  // document.body.innerText는 원래 script/style 내용을 무시하므로 삭제할 필요가 없습니다.

  // 2) form / UI 컨트롤 분류 직렬화
  //  - FORMS:        실제 데이터 입력/제출 표면 (form/input/textarea/select + credential·PII·submit 버튼)
  //  - UI_CONTROLS:  라벨 있는 일반 버튼 (네비/팔로우/카테고리 등) — 최대 10, 저신호
  //  - 라벨 없는 버튼 더미(`<button type="button">`)는 둘 다에서 제외
  const FORM_CAP = 30, UI_CAP = 10;
  const forms = [];
  const uiControls = [];
  const seenCtrl = new Set();
  for (const el of document.querySelectorAll("input, textarea, select, form, button, [role='button']")) {
    if (seenCtrl.has(el)) continue;
    seenCtrl.add(el);
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") || "").toLowerCase();
    // submit input 은 제출 표면이므로 data-entry 로 본다. button/reset/image 만 버튼류로 분리.
    const isButtonType = tag === "input" && /^(button|reset|image)$/.test(type);
    const isDataEntry = tag === "form" || tag === "textarea" || tag === "select" ||
      (tag === "input" && !isButtonType);
    if (isDataEntry) {
      if (forms.length < FORM_CAP) forms.push(serializeControl(el, accessibleLabel(el)));
      continue;
    }
    // 여기부터 버튼류 (button / [role=button] / input[type=button|reset|image])
    const label = accessibleLabel(el);
    if (!label) continue; // 라벨 없는 더미 버튼 제외
    if (CREDENTIAL_CTRL_RE.test(label)) {
      if (forms.length < FORM_CAP) forms.push(serializeControl(el, label));
    } else if (uiControls.length < UI_CAP) {
      uiControls.push(serializeControl(el, label));
    }
  }

  const crossDomainForms = [];
  for (const form of document.querySelectorAll("form")) {
    const x = serializeCrossDomainForm(form);
    if (x) crossDomainForms.push(x);
    if (crossDomainForms.length >= 10) break;
  }

  // 3) 앵커 + 위험 URI / 실행 확장자 다운로드 링크 분류
  const seenAnchor = new Set();
  const anchors = [];
  const dangerousUris = [];
  const execDownloads = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    const absoluteHref = a.href || href;
    if (DANGEROUS_URI.test(href)) {
      dangerousUris.push({ href, text: (a.innerText || "").trim().slice(0, 60) });
      continue;
    }
    if (EXEC_EXT.test(absoluteHref) || a.hasAttribute("download")) {
      execDownloads.push({ href: absoluteHref, text: (a.innerText || "").trim().slice(0, 60) });
    }
    if (!/^https?:/i.test(absoluteHref)) continue;
    if (seenAnchor.has(absoluteHref)) continue;
    seenAnchor.add(absoluteHref);
    anchors.push(serializeAnchor(a));
    if (anchors.length >= 40) break;
  }

  // 4) 이미지 src (최대 12개)
  const imgs = [];
  for (const img of document.querySelectorAll("img")) {
    const src = img.currentSrc || img.src;
    if (!src) continue;
    imgs.push(src);
    if (imgs.length >= 12) break;
  }

  // 5) visible body text
  // SPA/채팅 서비스의 좌측 사이드바·히스토리·내비게이션 단어가 shellHits로 섞이는 것을 줄이기 위해
  // 본문 영역(main/article/role=main)을 우선 사용한다. 없으면 기존처럼 body로 폴백한다.
  const textRoot = document.querySelector("main, article, [role='main']") || document.body;
  const visibleText = ((textRoot && textRoot.innerText) || "")
    .replace(/\s+/g, " ")
    .trim();

  // 6) 사회공학 / 셸 힌트 텍스트 매치
  const socialHits = [];
  const shellHits = [];
  const socialMatches = visibleText.match(new RegExp(SOCIAL_RE.source, "gi")) || [];
  for (const m of socialMatches.slice(0, 8)) socialHits.push(m.toLowerCase());
  const shellMatches = visibleText.match(new RegExp(SHELL_EXEC_RE.source, "gi")) || [];
  for (const m of shellMatches.slice(0, 8)) shellHits.push(m);

  // 7) copy 버튼 휴리스틱
  const copyButtonsRaw = [];
  for (const el of document.querySelectorAll('button, [role="button"], a[onclick]')) {
    const t = ((el.innerText || el.textContent || "") + " " + (el.getAttribute("aria-label") || "")).trim();
    const onclick = el.getAttribute("onclick") || "";
    if (/(copy|복사|클립보드|clipboard)/i.test(t) || /clipboard\.writeText|execCommand\(['"]copy/i.test(onclick)) {
      collectClipboardWriteLiterals(onclick, "onclickLiteral");
      const label = t || "(no label)";
      const detail = onclick ? `${label} | onclick=${onclick}` : label;
      copyButtonsRaw.push(detail.slice(0, 320));
      if (copyButtonsRaw.length >= 8) break;
    }
  }

  // 7.5) 코드/명령 스니펫 추출 (복사 버튼이 실제로는 사용자 제스처를 요구해서 후크가 못 잡는 케이스 보강)
  // - pre/code 텍스트에서 "쉘 설치 페이로드"로 보이는 라인들을 일부 수집
  const codeSnippets = [];
  const codeLikeNodes = [...document.querySelectorAll("pre, code")]
    .slice(0, 80);
  for (const n of codeLikeNodes) {
    const t = (n.innerText || n.textContent || "").replace(/\r/g, "").trim();
    if (!t) continue;
    // 너무 긴 블록은 앞부분만 (난독화도 앞부분에 단서가 많은 편)
    const s = t.length > 1200 ? (t.slice(0, 1200) + " …") : t;
    if (SHELL_EXEC_RE.test(s)) {
      codeSnippets.push(s);
      if (codeSnippets.length >= 8) break;
    }
  }

  // 8) clipboard 버퍼 + 인라인 정적 literal 머지
  const clipboardWrites = [...readClipboardBuffer(), ...staticClipboardWrites].slice(0, 20);

  // copyButtons는 실제 클립보드 payload/명령 스니펫/사회공학 문구가 있을 때만 의미 있는 보조 신호다.
  // 일반 사이트의 "Copy" UI만으로는 모델이 ClickFix 신호처럼 과대해석하므로 비운다.
  const copyButtons = (clipboardWrites.length > 0 || codeSnippets.length > 0 || socialHits.length > 0)
    ? copyButtonsRaw
    : [];

  // SW가 hidden tab 열 때 박아둔 `#__pg_scan=1` 마커는 finalUrl 에서 제거.
  const cleanUrl = location.href.replace(/(?:[#&])__pg_scan=1\b/, "").replace(/#$/, "");

  return {
    finalUrl: cleanUrl,
    title: document.title || "",
    forms,
    crossDomainForms,
    uiControls,
    anchors,
    imgs,
    visibleText,
    behaviors: {
      clipboardWrites,
      dangerousUris: dangerousUris.slice(0, 10).map(d => `${d.href} (${d.text})`),
      execDownloads: execDownloads.slice(0, 10).map(d => `${d.href} (${d.text})`),
      socialHits,
      shellHits,
      copyButtons,
      codeSnippets,
      phishingKitMarkers: [...phishingKitMarkersSet].slice(0, 8)
      // autoDownloads 는 SW 쪽 downloads.onCreated 핸들러가 머지
    }
  };
})();
