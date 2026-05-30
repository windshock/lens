// Promo video text strings. Both EN and KO are timed identically (30s, 4 scenes).
// Short, scannable — viewers don't pause to read.

export const STRINGS = {
  en: {
    // Scene 1 — Problem (0-10s)
    problem_kicker: "Phishing protection today",
    problem_layer1: "Chrome Safe Browsing",
    problem_layer2: "PhishTank · phishing DBs",
    problem_layer3: "Network gateway",
    problem_common: "All depend on URL reputation",
    problem_url_age: "created 2 hours ago",
    problem_query: "querying reputation lists…",
    problem_not_on_list: "Not on list",
    problem_gap_title: "Zero-hour phishing slips through",
    problem_gap_sub: "Pages born hours ago. On no list. Yet.",

    // Scene 2 — Solution (10-18s)
    solution_title: "Windshock Lens reads the page itself.",
    solution_sub: "Not a blocklist.",
    solution_step1: "DOM · forms · clipboard",
    solution_step2: "OCR · WHOIS · CT logs",
    solution_step3: "On-device Gemini Nano",
    solution_step4: "Deterministic security rules",

    // Scene 3 — Verdict (18-25s)
    verdict_url: "microsft-365-signin.workers.dev",
    verdict_score: "9 / 10",
    verdict_brand: "Microsoft (impersonation)",
    verdict_action: "Blocked before you clicked.",

    // Scene 4 — Outro (25-30s)
    outro_title: "Windshock Lens",
    outro_line1: "100% on-device",
    outro_line2: "No external LLM. No telemetry.",
    outro_line3: "Free · open source",
    outro_url: "windshock.github.io/lens",
  },
  ko: {
    problem_kicker: "오늘날의 피싱 방어",
    problem_layer1: "Chrome 안전 브라우징",
    problem_layer2: "PhishTank · 피싱 DB",
    problem_layer3: "사내 게이트웨이",
    problem_common: "모두 URL 평판에 의존",
    problem_url_age: "2시간 전 등록",
    problem_query: "평판 목록 조회 중…",
    problem_not_on_list: "목록 없음",
    problem_gap_title: "영시간 피싱은 빠져나갑니다",
    problem_gap_sub: "몇 시간 전 만들어진 페이지. 어디에도 등록 안 됨.",

    solution_title: "Windshock Lens 는 페이지 자체를 읽습니다.",
    solution_sub: "차단 목록이 아닙니다.",
    solution_step1: "DOM · 폼 · 클립보드",
    solution_step2: "OCR · WHOIS · CT 로그",
    solution_step3: "온디바이스 Gemini Nano",
    solution_step4: "결정론적 보안 룰",

    verdict_url: "microsft-365-signin.workers.dev",
    verdict_score: "9 / 10",
    verdict_brand: "Microsoft (사칭)",
    verdict_action: "클릭 전에 차단했습니다.",

    outro_title: "Windshock Lens",
    outro_line1: "100% 온디바이스",
    outro_line2: "외부 LLM 사용 안 함. 텔레메트리 없음.",
    outro_line3: "무료 · 오픈소스",
    outro_url: "windshock.github.io/lens",
  },
};
