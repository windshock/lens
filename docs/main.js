const translations = {
  en: {
    metaDescription: "ScamGuard AI is a Chrome MV3 extension that helps detect gray-zone phishing and scam pages inside the browser with on-device AI and deterministic security rules.",
    navWhy: "Why",
    navWorkflow: "Workflow",
    navSignals: "Signals",
    navRoadmap: "Roadmap",
    heroEyebrow: "Chrome MV3 · on-device AI · defensive research",
    heroLead: "Browser-side phishing protection for gray-zone pages in the AI era.",
    heroBody: "ScamGuard AI combines local page extraction, deterministic security rules, OCR, domain ownership signals, and on-device Gemini Nano analysis to help evaluate suspicious pages without sending page content to external LLM APIs.",
    actionGithub: "View on GitHub",
    actionWorkflow: "How it works",
    visualLabel: "Current verdict",
    visualVerdict: "High risk, evidence-based",
    visualSignal1: "Credential form",
    visualSignal2: "Brand mismatch",
    visualSignal3: "Kit marker",
    visualSignal4: "RDAP/CT checked",
    visualFlow1: "Extract",
    visualFlow2: "Precheck",
    visualFlow3: "Analyze",
    visualFlow4: "Warn",
    summaryOneTitle: "100% local page-content analysis",
    summaryOneBody: "Browsing context stays on the device.",
    summaryTwoTitle: "Complements Safe Browsing",
    summaryTwoBody: "Focuses on zero-hour and targeted gray-zone pages.",
    summaryThreeTitle: "Rules and AI together",
    summaryThreeBody: "Hard evidence is not reduced to a generic score.",
    whyEyebrow: "Origin",
    whyTitle: "Built from real defensive observations",
    whyBody: "Modern phishing pages abuse normal infrastructure, imitate trusted software, and adapt their login screens after rendering. ScamGuard AI was shaped by field observations of AI client impersonation, fake software download pages, and enterprise sign-in phishing kits.",
    originOneTitle: "AI client impersonation",
    originOneBody: "Pages that mimic popular AI tools or installers to capture trust before a download or login flow.",
    originTwoTitle: "Fake software downloads",
    originTwoBody: "Lookalike download journeys that can push suspicious files or deceptive instructions.",
    originThreeTitle: "Enterprise sign-in kits",
    originThreeBody: "Rendered login pages with reusable kit behavior, prefilled identity hints, and off-origin collection paths.",
    originFourTitle: "Normal infrastructure abuse",
    originFourBody: "Phishing hosted on shared platforms, workers, pages, or static hosting that reputation systems may not classify yet.",
    focusEyebrow: "Positioning",
    focusTitle: "A browser-side triage layer",
    focusBody: "ScamGuard AI is not a replacement for Chrome Safe Browsing, a cloud scanner, a generic antivirus, or a thin LLM wrapper. It is a local triage layer for suspicious rendered pages that need evidence-aware judgment before the user continues.",
    focusItem1: "Zero-hour phishing and spear-phishing",
    focusItem2: "Brand impersonation with credential forms",
    focusItem3: "Fake download and clipboard-abuse flows",
    focusItem4: "Rendered-page behavior visible only after load",
    workflowEyebrow: "Workflow",
    workflowTitle: "How ScamGuard AI evaluates a page",
    workflowBody: "The extension keeps page inspection inside the browser and combines direct evidence with contextual analysis only when needed.",
    stepOneTitle: "Inspect link, page, or download",
    stepOneBody: "A clicked link, current page, or suspicious download starts a local scan.",
    stepTwoTitle: "Extract rendered signals",
    stepTwoBody: "DOM, forms, scripts, OCR text, and domain ownership signals are collected without external LLM calls.",
    stepThreeTitle: "Separate hard evidence from ambiguity",
    stepThreeBody: "Strong markers such as phishing-kit behavior or dangerous clipboard payloads should be handled deterministically.",
    stepFourTitle: "Use on-device AI for context",
    stepFourBody: "Gemini Nano assists when the page is suspicious but still requires language, layout, or intent judgment.",
    stepFiveTitle: "Warn, explain, or allow reset",
    stepFiveBody: "Users see a warning or detailed verdict and retain control over allow and reset decisions.",
    signalsEyebrow: "Detection examples",
    signalsTitle: "Evidence the extension can reason about",
    signalsBody: "Public examples are intentionally sanitized. The project does not publish live phishing URLs, credentials, internal hostnames, or sensitive incident details.",
    tablePattern: "Pattern",
    tableWhy: "Why it matters",
    patternOne: "Brand-like login page on a non-official domain",
    whyOne: "May indicate credential harvesting or targeted impersonation.",
    patternTwo: "Password form plus phishing-kit marker",
    whyTwo: "Combines credential collection with direct implementation evidence.",
    patternThree: "Hidden or prefilled corporate email hint",
    whyThree: "Can indicate spear-phishing or account-specific lures.",
    patternFour: "Dynamic logo or background from a victim domain",
    whyFour: "Common behavior in reusable phishing kits that adapt branding.",
    patternFive: "Fake download or clipboard shell payload",
    whyFive: "Can lead to malware delivery or ClickFix-style command abuse.",
    patternSix: "Webhook endpoint combined with a credential form",
    whySix: "Suggests a possible exfiltration path while avoiding collection of secret values.",
    principlesEyebrow: "Design principles",
    principlesTitle: "Privacy-first, evidence-aware protection",
    principleOneTitle: "No external LLM API for page content",
    principleOneBody: "The extension is designed so browsing context is analyzed on the device.",
    principleTwoTitle: "Rules are not replaced by AI",
    principleTwoBody: "Deterministic evidence remains explicit and explainable.",
    principleThreeTitle: "AI handles ambiguous context",
    principleThreeBody: "Language, layout, and intent judgment are useful when hard evidence is not enough.",
    principleFourTitle: "Users keep control",
    principleFourBody: "Allowlist and page reset flows remain visible user decisions.",
    roadmapEyebrow: "Status and roadmap",
    roadmapTitle: "Experimental proof of concept",
    roadmapBody: "ScamGuard AI is intended for security research, pilot testing, and defensive evaluation. It is not yet an enterprise-managed security product.",
    roadmapItem1: "Add hard-evidence precheck before LLM analysis.",
    roadmapItem2: "Expand phishing-kit markers for webhook and messaging-platform exfiltration patterns.",
    roadmapItem3: "Design privacy-first endpoint-only network observation.",
    roadmapItem4: "Review web-accessible resources and conservative safe-domain behavior.",
    roadmapLink: "Track technical improvement issue #2",
    footerText: "Defensive research project for browser-side phishing triage."
  },
  ko: {
    metaDescription: "ScamGuard AI는 온디바이스 AI와 결정론적 보안 규칙으로 브라우저 안에서 그레이존 피싱 및 스캠 페이지를 탐지하는 Chrome MV3 확장 프로그램입니다.",
    navWhy: "배경",
    navWorkflow: "동작 방식",
    navSignals: "탐지 신호",
    navRoadmap: "로드맵",
    heroEyebrow: "Chrome MV3 · 온디바이스 AI · 방어 연구",
    heroLead: "AI 시대의 그레이존 피싱 페이지를 브라우저 안에서 판별합니다.",
    heroBody: "ScamGuard AI는 로컬 페이지 추출, 결정론적 보안 규칙, OCR, 도메인 소유권 신호, 온디바이스 Gemini Nano 분석을 결합해 페이지 콘텐츠를 외부 LLM API로 보내지 않고 의심 페이지를 평가합니다.",
    actionGithub: "GitHub에서 보기",
    actionWorkflow: "동작 방식",
    visualLabel: "현재 판정",
    visualVerdict: "고위험, 증거 기반",
    visualSignal1: "자격 증명 폼",
    visualSignal2: "브랜드 불일치",
    visualSignal3: "피싱 킷 마커",
    visualSignal4: "RDAP/CT 확인",
    visualFlow1: "추출",
    visualFlow2: "사전 검사",
    visualFlow3: "분석",
    visualFlow4: "경고",
    summaryOneTitle: "페이지 콘텐츠 100% 로컬 분석",
    summaryOneBody: "브라우징 맥락은 사용자의 기기 안에 남습니다.",
    summaryTwoTitle: "Safe Browsing 보완",
    summaryTwoBody: "제로아워와 표적형 그레이존 페이지에 집중합니다.",
    summaryThreeTitle: "규칙과 AI의 결합",
    summaryThreeBody: "명확한 증거를 일반 점수 하나로 축소하지 않습니다.",
    whyEyebrow: "출발점",
    whyTitle: "실제 방어 관찰에서 출발한 프로젝트",
    whyBody: "현대 피싱 페이지는 정상 인프라를 악용하고 신뢰받는 소프트웨어를 흉내 내며 렌더링 이후 로그인 화면을 동적으로 바꿉니다. ScamGuard AI는 AI 클라이언트 사칭, 가짜 소프트웨어 다운로드 페이지, 엔터프라이즈 로그인 피싱 킷 관찰에서 출발했습니다.",
    originOneTitle: "AI 클라이언트 사칭",
    originOneBody: "인기 AI 도구나 설치 프로그램처럼 보이게 만들어 다운로드 또는 로그인 전 신뢰를 얻는 페이지입니다.",
    originTwoTitle: "가짜 소프트웨어 다운로드",
    originTwoBody: "의심스러운 파일이나 기만적인 실행 안내로 이어질 수 있는 유사 다운로드 흐름입니다.",
    originThreeTitle: "엔터프라이즈 로그인 킷",
    originThreeBody: "재사용 가능한 킷 동작, 미리 채워진 계정 힌트, 외부 수집 경로가 보이는 렌더링된 로그인 페이지입니다.",
    originFourTitle: "정상 인프라 악용",
    originFourBody: "공유 플랫폼, 워커, 페이지, 정적 호스팅에 올라와 평판 시스템이 아직 분류하지 못할 수 있는 피싱입니다.",
    focusEyebrow: "포지셔닝",
    focusTitle: "브라우저 기반 피싱 트리아지 계층",
    focusBody: "ScamGuard AI는 Chrome Safe Browsing, 클라우드 스캐너, 범용 백신, 단순 LLM 래퍼를 대체하지 않습니다. 사용자가 계속 진행하기 전에 증거 기반 판단이 필요한 의심 렌더링 페이지를 로컬에서 평가하는 보조 계층입니다.",
    focusItem1: "제로아워 피싱과 스피어피싱",
    focusItem2: "자격 증명 폼을 포함한 브랜드 사칭",
    focusItem3: "가짜 다운로드와 클립보드 악용 흐름",
    focusItem4: "페이지 로드 이후에만 보이는 렌더링 동작",
    workflowEyebrow: "동작 방식",
    workflowTitle: "ScamGuard AI가 페이지를 평가하는 방법",
    workflowBody: "확장 프로그램은 페이지 검사를 브라우저 안에 유지하고, 필요한 경우에만 직접 증거와 맥락 분석을 결합합니다.",
    stepOneTitle: "링크, 페이지, 다운로드 검사",
    stepOneBody: "클릭한 링크, 현재 페이지, 의심 다운로드가 로컬 스캔을 시작합니다.",
    stepTwoTitle: "렌더링된 신호 추출",
    stepTwoBody: "DOM, 폼, 스크립트, OCR 텍스트, 도메인 소유권 신호를 외부 LLM 호출 없이 수집합니다.",
    stepThreeTitle: "명확한 증거와 모호한 위험 분리",
    stepThreeBody: "피싱 킷 동작이나 위험한 클립보드 페이로드 같은 강한 마커는 결정론적으로 처리되어야 합니다.",
    stepFourTitle: "맥락 판단에는 온디바이스 AI 사용",
    stepFourBody: "페이지가 의심스럽지만 언어, 레이아웃, 의도 판단이 필요한 경우 Gemini Nano가 보조합니다.",
    stepFiveTitle: "경고, 설명, 또는 초기화",
    stepFiveBody: "사용자는 경고나 상세 판정을 확인하고 허용 및 페이지별 초기화 결정을 직접 유지합니다.",
    signalsEyebrow: "탐지 예시",
    signalsTitle: "확장 프로그램이 판단할 수 있는 증거",
    signalsBody: "공개 예시는 의도적으로 정제되어 있습니다. 이 프로젝트는 실제 피싱 URL, 자격 증명, 내부 호스트명, 민감한 사고 세부 정보를 공개하지 않습니다.",
    tablePattern: "패턴",
    tableWhy: "중요한 이유",
    patternOne: "공식 도메인이 아닌 곳의 브랜드 유사 로그인 페이지",
    whyOne: "자격 증명 탈취나 표적 사칭을 시사할 수 있습니다.",
    patternTwo: "비밀번호 폼과 피싱 킷 마커의 결합",
    whyTwo: "자격 증명 수집과 직접적인 구현 증거가 동시에 나타납니다.",
    patternThree: "숨겨진 또는 미리 채워진 회사 이메일 힌트",
    whyThree: "스피어피싱이나 계정별 유인책을 나타낼 수 있습니다.",
    patternFour: "피해자 도메인에서 동적으로 가져온 로고 또는 배경",
    whyFour: "브랜드를 동적으로 바꾸는 재사용 피싱 킷에서 흔히 보이는 동작입니다.",
    patternFive: "가짜 다운로드 또는 클립보드 셸 페이로드",
    whyFive: "악성 파일 전달이나 ClickFix 유형의 명령 실행 악용으로 이어질 수 있습니다.",
    patternSix: "자격 증명 폼과 결합된 웹훅 엔드포인트",
    whySix: "비밀 값을 수집하지 않으면서도 잠재적인 유출 경로를 판단하는 단서가 됩니다.",
    principlesEyebrow: "설계 원칙",
    principlesTitle: "프라이버시 우선, 증거 중심 보호",
    principleOneTitle: "페이지 콘텐츠에 외부 LLM API를 사용하지 않음",
    principleOneBody: "브라우징 맥락은 사용자의 기기에서 분석되도록 설계되어 있습니다.",
    principleTwoTitle: "규칙을 AI로 대체하지 않음",
    principleTwoBody: "결정론적 증거는 명시적이고 설명 가능한 상태로 남습니다.",
    principleThreeTitle: "AI는 모호한 맥락을 보조",
    principleThreeBody: "명확한 증거만으로 부족할 때 언어, 레이아웃, 의도 판단을 돕습니다.",
    principleFourTitle: "사용자 제어 유지",
    principleFourBody: "허용 목록과 페이지별 초기화 흐름은 사용자가 직접 선택하는 동작으로 남습니다.",
    roadmapEyebrow: "상태와 로드맵",
    roadmapTitle: "실험적 개념 증명",
    roadmapBody: "ScamGuard AI는 보안 연구, 파일럿 테스트, 방어적 평가를 위한 프로젝트입니다. 아직 엔터프라이즈 관리형 보안 제품은 아닙니다.",
    roadmapItem1: "LLM 분석 전에 명확한 증거 사전 검사를 추가합니다.",
    roadmapItem2: "웹훅 및 메시징 플랫폼 유출 패턴에 대한 피싱 킷 마커를 확장합니다.",
    roadmapItem3: "프라이버시 우선의 엔드포인트 메타데이터 관찰 방식을 설계합니다.",
    roadmapItem4: "웹 접근 가능 리소스와 보수적인 안전 도메인 동작을 검토합니다.",
    roadmapLink: "기술 개선 이슈 #2 보기",
    footerText: "브라우저 기반 피싱 트리아지를 위한 방어 연구 프로젝트입니다."
  }
};

const supportedLanguages = new Set(["en", "ko"]);

function preferredLanguage() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("lang");
  const stored = window.localStorage.getItem("scamguard-intro-lang");

  if (supportedLanguages.has(requested)) return requested;
  if (supportedLanguages.has(stored)) return stored;
  if (navigator.language && navigator.language.toLowerCase().startsWith("ko")) return "ko";

  return "en";
}

function applyLanguage(lang) {
  const copy = translations[lang] || translations.en;

  document.documentElement.lang = lang;
  document.title = lang === "ko" ? "ScamGuard AI | 한국어 소개" : "ScamGuard AI";

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    metaDescription.setAttribute("content", copy.metaDescription);
  }

  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (copy[key]) {
      node.textContent = copy[key];
    }
  });

  document.querySelectorAll("[data-lang-switch]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.langSwitch === lang));
  });

  window.localStorage.setItem("scamguard-intro-lang", lang);
}

document.querySelectorAll("[data-lang-switch]").forEach((button) => {
  button.addEventListener("click", () => {
    const lang = button.dataset.langSwitch;
    if (!supportedLanguages.has(lang)) return;

    const url = new URL(window.location.href);
    url.searchParams.set("lang", lang);
    window.history.replaceState({}, "", url);
    applyLanguage(lang);
  });
});

applyLanguage(preferredLanguage());
