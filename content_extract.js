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
  function serializeFormElement(el) {
    const tag = el.tagName.toLowerCase();
    const attrs = ["name", "type", "placeholder", "value", "action", "method", "id"];
    const pairs = attrs
      .map(k => [k, el.getAttribute(k)])
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}="${String(v).slice(0, 60)}"`);
    return `<${tag} ${pairs.join(" ")}>`;
  }

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

  // 인라인 script 본문 → clipboard.writeText literal 추출
  for (const s of document.querySelectorAll("script:not([src])")) {
    const src = s.textContent || "";
    collectClipboardWriteLiterals(src, "inlineScriptLiteral");
  }

  // 1) 잡음 태그 제거 제거됨 (사용자 활성 탭에 주입되므로 DOM을 파괴하면 안 됨)
  // document.body.innerText는 원래 script/style 내용을 무시하므로 삭제할 필요가 없습니다.

  // 2) form 직렬화
  const forms = [...document.querySelectorAll("input,textarea,form,select,button")]
    .slice(0, 40)
    .map(serializeFormElement);

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
      codeSnippets
      // autoDownloads 는 SW 쪽 downloads.onCreated 핸들러가 머지
    }
  };
})();
