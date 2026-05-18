# ScamGuard AI — 기술 명세 및 위협 인텔리전스 상세

> 본 문서는 「**ScamGuard AI 개발 배경 및 시범 적용 필요성**」(이형관, 2026.05.18) 의 부속 기술 명세서이며, 본문 요약의 근거가 되는 위협 분석, 도구 아키텍처, 결정론적 룰 카탈로그, 검증 사례, 한계 및 후속 작업을 정리한다.

| | |
|---|---|
| 본문 | 「ScamGuard AI 개발 배경 및 시범 적용 필요성」 |
| 작성일 | 2026.05.18 |
| 대상 버전 | ScamGuard AI v0.1.28 |
| 저장소 | https://github.com/windshock/scamguard-ai |

---

## 목차

1. 위협 인텔리전스 상세
   - 1.1 캠페인 A — AI Client 사칭
   - 1.2 캠페인 B — 카카오톡 다운로드 사칭
   - 1.3 캠페인 C — Microsoft 로그인 사칭 (SK 임직원 타겟)
   - 1.4 공통 IOC 정리표
   - 1.5 MITRE ATT&CK 매핑
2. ScamGuard AI 기술 명세
   - 2.1 설계 원칙
   - 2.2 시스템 아키텍처
   - 2.3 진입 트리거
   - 2.4 결정론적 룰 엔진 (O0–O7 + D1 + O1-whois)
   - 2.5 자동 소유권 검증 (OFFICIAL_DOMAINS / RDAP / CT)
   - 2.6 사용자 통제 — allowlist / denylist / 검사 기록 초기화
   - 2.7 다국어 지원
3. 검증 결과
4. 한계 및 후속 작업
   - 4.1 기술적 한계
   - 4.2 운영상 한계
   - 4.3 후속 작업 우선순위
   - 4.4 의도적으로 적용하지 않은 사항
5. 릴리즈 히스토리
6. 부록 — 개발 환경 및 의존 자원

---

# 1. 위협 인텔리전스 상세

본문 2장에서 제시한 세 가지 발견 사례를, 각 캠페인별 동작 구조와 시그너처 단위로 상세 분석한다. 모든 URL 은 외부 공유 시 자동 미리보기 차단을 위해 defang 표기를 사용한다.

## 1.1 캠페인 A — AI Client 사칭

### 1.1.1 발견 URL

- `hxxps://dawn-snowflake-c5fe[.]emily-young1995[.]workers[.]dev`
- `hxxps://project-deepsk530291kx[.]pages[.]dev`
- `hxxps://autumn-mud-2219[.]davis-drew1992[.]workers[.]dev`

### 1.1.2 위협 구조

Cloudflare Workers 와 Cloudflare Pages 는 사용자가 코드를 업로드만 하면 즉시 `*.workers.dev` 또는 `*.pages.dev` 서브도메인으로 서비스 가능한 무료 PaaS 이다. 평판 기반 도메인 차단(`pages.dev` 자체를 차단) 은 정상 서비스 다수도 막아 운영이 불가능하며, 한편 등록 직후 사용 가능하므로 도메인 등록 시간차 기반 휴리스틱도 무력하다. 따라서 이러한 정상 인프라 악용은 **호스팅 단위 평판이 아니라 페이지 콘텐츠 단위의 분석** 으로만 탐지 가능하다.

세 URL 모두 다음 공통 패턴을 보였다.

- 호스트가 `FREE_HOSTING_RE` 매칭 (workers.dev / pages.dev)
- 다음 단계에서 합법 브랜드(ChatGPT, DeepSeek, Claude 등 AI 서비스) 의 로그인 화면 모사
- 자격증명 입력 요구 또는 결제 정보 입력 유도

### 1.1.3 ScamGuard AI 대응

| 룰 | 트리거 | 결과 |
|---|---|---|
| **O1** (free-hosting + 브랜드 사칭, 강한 증거) | 호스트가 free-hosting + LLM 이 브랜드 식별 + `hasCredentialLikeForms` | `danger`, score≥9 |
| **O5 / O6 슬라이스 가드** (v0.1.12) | 사용자가 평소 `*.workers.dev` 의 정상 워커를 방문하더라도, `workers.dev` 자체가 trusted Set 에 올라가 같은 호스팅의 모든 피싱 사이트가 통째 신뢰되는 우회 경로를 차단 | 룰 매칭 거부 (FREE_HOSTING_RE 가드) |

## 1.2 캠페인 B — 카카오톡 다운로드 사칭

### 1.2.1 발견 URL

- `hxxps://pc-kakaotalk[.]com/download`
- `hxxps://pc-kakaocorp[.]com/download`
- `hxxps://apps-kakaotalk[.]com/download`

### 1.2.2 위협 구조

세 도메인 모두 카카오톡 PC 클라이언트 다운로드 페이지를 정밀 모사하며, **단일 사용자 자격증명 탈취가 아닌 악성 설치 파일 유포**를 목표로 한다는 점에서 캠페인 A·C 보다 후속 피해 범위가 크다. 일단 사용자가 설치 파일을 받아 실행하면 다음과 같은 후속 행위가 가능하다.

- 정보 유출형 트로이목마 (브라우저 자격증명, 기업 VPN 설정 등)
- 원격 제어형 백도어 (기업 내부망 침투 거점화)
- 랜섬웨어 또는 데이터 wipe

도메인 패턴(`pc-`, `apps-` prefix + 정식 브랜드명) 은 사용자가 빠르게 훑었을 때 `pc.kakaotalk.com` 또는 `apps.kakaotalk.com` 와 시각적으로 혼동을 노린 typosquatting 변형이다. 카카오의 정식 PC 다운로드 도메인은 `pc.kakao.com` 이며, OFFICIAL_DOMAINS 에는 `kakao.com / daum.net / kakaobank.com / kakaopay.com / kakaocorp.com` 5종이 등록되어 있다 — 위 세 도메인은 모두 매칭에서 벗어남.

### 1.2.3 ScamGuard AI 대응

| 룰 | 트리거 | 결과 |
|---|---|---|
| **O1** (단독 브랜드 mismatch + 증거 강함) | LLM 이 brand="Kakao" 또는 "KakaoTalk" 식별 + 다운로드 페이지 구조 + `hasCredentialLikeForms` 또는 `autoDownloads.length > 0` | `danger`, score≥9 (v0.1.20 의 일반 도메인 elevation 적용) |
| **O3** (자동 다운로드 시도) | 페이지 로드만으로 설치 파일 다운로드 트리거 시 | `danger`, score≥9 |
| **O1-whois** (v0.1.22) | LLM brand 토큰("kakao") 이 RDAP Registrant 또는 CT issuer Org 에 없으면 safe override 없음 → mismatch 검사 진행 | — |

### 1.2.4 추가 필요 분석

본 보고 시점에 세 URL 의 페이지 동작 정적 분석은 미완료. 향후 다음을 추적해야 한다.

- 다운로드되는 설치 파일의 SHA-256 / VirusTotal 결과
- 인증서 발급 정보 (Authenticode 위·변조 여부)
- 동일 인프라(C2 IP / 같은 ns / 같은 registrar) 에서 운용되는 다른 사칭 도메인 패턴

## 1.3 캠페인 C — Microsoft 로그인 사칭 (SK 임직원 타겟)

### 1.3.1 발견 URL

- `hxxps://rsig[.]org/rqq/flb/<41자 base62 토큰>`

WHOIS 등록일 2026-01-09 — 발견 시점 기준 약 4개월령. 짧은 도메인 수명은 피싱 캠페인의 전형. URL path 의 41자 base62 토큰(`jHl5zffjk7Tkd6FmW8yBr90Uskjk7Tx4QsP13vW8yB`) 은 피해자별 식별자.

### 1.3.2 핵심 시그너처 — Spear Phishing

페이지의 hidden input 에 SK 임직원의 실제 이메일이 사전 주입되어 있다.

```html
<input type="hidden" name="email" value="jeff.kim@sk.com">
```

공격자가 SK 내부에서 임직원 이메일 목록을 사전 수집한 상태에서 개인별로 URL 을 발사한 **명확한 spear-phishing 캠페인** 의 증거이다.

### 1.3.3 정적 구조 (HTML)

```html
<head>
  <meta name="PageID" content="ConvergedSignIn">
  <link rel="stylesheet"
        href="hxxps://aadcdn[.]msauth[.]net/ests/2.1/content/cdnbundles/converged.v2.login.min_*.css">
</head>
<body>
  <form id="loginForm" method="post" autocomplete="off">
    <input name="office_id"     type="hidden" value="jeff.kim@sk.com">
    <input name="email"         type="hidden" value="jeff.kim@sk.com">
    <input name="office_passwd" type="password" placeholder="Password">
    <input name="ms_link"       type="hidden">
    <input type="submit" value="Sign in">
  </form>
</body>
```

특이점:

- `aadcdn.msauth.net` 은 Microsoft 의 실제 인증 자산 CDN 이며 Microsoft 자체 사인인 페이지에서만 로드된다. 비-Microsoft 사이트가 이 CSS 를 직접 import 하는 정상 사유는 없다.
- `office_passwd` / `office_id` / `ms_link` 는 진짜 Microsoft Converged Sign-In 페이지가 사용하지 않는 명칭이다 (진짜는 `loginfmt` / `passwd` / `flowToken` / `ctx` / `canary`). 즉 필드명 자체가 phishing kit signature.
- `<meta name="PageID" content="ConvergedSignIn">` 은 Microsoft 사인인 페이지의 내부 식별자를 그대로 가져온 것.

### 1.3.4 동적 구조 (Inline JavaScript)

```js
// 1) base64 난독화된 exfil endpoint
const actionUrl = atob('Li4vb2Z4LnBocA=='); // → "../ofx.php"

// 2) 피해자 이메일에서 회사 도메인 추출
function getDomainFromEmail(email) { return email.split('@')[1]; }

// 3) Clearbit Logo API 로 피해자 회사 로고 동적 페치
function setLogo(domain) {
  el.innerHTML = `<img src="hxxps://logo[.]clearbit[.]com/${domain}" ...>`;
}

// 4) screenshotmachine.com 으로 피해자 회사 홈페이지 스크린샷 → 블러 배경
function setBackgroundImage(domain) {
  blurOverlay.style.backgroundImage =
    `url('hxxps://api[.]screenshotmachine[.]com?key=...&url=https://${domain}&dimension=1024x768')`;
}

// 5) form action 비워둔 채 fetch() 로 은밀 POST
async function submitFormData() {
  await fetch(actionUrl, { method: 'POST', body: formData });
}

// 6) 비밀번호 3회 입력 받은 뒤 진짜 회사 도메인 /404 로 리다이렉트 — 흔적 은폐
if (loginAttempts >= 3) {
  const domain = getDomainFromEmail(emailField.value);
  setTimeout(() => { window.location.href = `https://${domain}/404`; }, 1000);
}
```

**Tier-1 phishing-kit signature 3종이 모두 등장한다.**

| 시그너처 | 정상 사이트에서의 사용 빈도 | 캠페인 C 에서의 역할 |
|---|---|---|
| `logo[.]clearbit[.]com/${...}` 동적 로고 페치 | 매우 낮음 (CRM 대시보드 일부만) | 피해자 회사 로고를 자동으로 박아 피싱 화면을 회사별 맞춤화 |
| `api[.]screenshotmachine[.]com` 동적 배경 | 사실상 0 | 피해자 회사 홈페이지를 블러 배경으로 사용해 "회사 사이트 위 sign-in" 위장 |
| `atob('<base64>')` 결과가 URL-like | 매우 낮음 | exfil endpoint(`../ofx.php`) 정적 분석 회피 |

3종이 모두 동시에 + 동일 페이지에 password input 까지 존재하면 정상 사이트일 확률은 사실상 0이다.

### 1.3.5 ScamGuard AI 대응

| 룰 | 트리거 | 결과 |
|---|---|---|
| **O7** (Phishing kit Tier-1 시그너처) (v0.1.21) | `phishingKitMarkers` 비어있지 않음 + `hasCredentialLikeForms` | `danger`, score≥9 — LLM 의 brand 인식 실패와 무관하게 결정론적 차단 |
| **D1** (영구 denylist) (v0.1.12) | 한 번 차단된 호스트는 sha256 hash 로 `chrome.storage.local` 에 영구 기록 | 재방문 시 LLM/추출/OCR 전부 생략하고 즉시 short-circuit |

## 1.4 공통 IOC 정리표

| 카테고리 | 시그너처 | 캠페인 |
|---|---|---|
| 호스팅 패턴 | `*.workers.dev`, `*.pages.dev` (FREE_HOSTING_RE 일치) | A |
| 도메인 typosquatting prefix | `pc-`, `apps-` + 정식 브랜드명 | B |
| URL path 토큰 | 40자 이상 base62/base58 무작위 문자열 | C |
| HTML — 외부 자산 | `aadcdn[.]msauth[.]net` 의 CSS 직접 import | C |
| HTML — 메타 태그 | `<meta name="PageID" content="ConvergedSignIn">` | C |
| HTML — 폼 필드명 | `office_passwd`, `office_id`, `ms_link` (Microsoft kit-mimicry) | C |
| HTML — 사전 채움 hidden | `<input type="hidden" name="email" value="*@*.*">` (실제 임직원 이메일) | C |
| JS — 난독화 | `atob('<base64>')` 결과가 `../*.php`, `http(s)://` 등 URL-like | C |
| JS — 외부 호출 | `logo[.]clearbit[.]com/${domain}` 동적 페치 | C |
| JS — 외부 호출 | `api[.]screenshotmachine[.]com?...&url=https://${domain}` | C |
| JS — exfil | form action 비움 + JS `fetch()` 로 POST | C |
| 동작 | 입력 N회 후 victim 도메인 `/404` 리다이렉트로 흔적 은폐 | C |
| 동작 | 페이지 로드만으로 설치 파일 자동 다운로드 시도 | B (추정), 일반 |
| WHOIS | Cloudflare DNS(`*.ns.cloudflare.com`) + 등록 < 6개월 | A, C |

## 1.5 MITRE ATT&CK 매핑

| Tactic | Technique | ID | 캠페인 |
|---|---|---|---|
| Initial Access | Phishing: Spearphishing Link | T1566.002 | C (개인 식별자 + 조직 임직원 이메일 hidden 채움) |
| Initial Access | Phishing: Spearphishing via Service | T1566.003 | A, B (사용자 직접 방문 유도) |
| Resource Development | Establish Accounts: Cloud Accounts | T1585.003 | A (Cloudflare Workers/Pages 무료 가입) |
| Resource Development | Acquire Infrastructure: Domains (Typosquatting) | T1583.001 | B (`pc-kakaotalk[.]com` 류) |
| Defense Evasion | Trusted Relationship (Brand Impersonation) | T1199 | A, B, C |
| Defense Evasion | Obfuscated Files or Information | T1027 | C (`atob` 로 exfil 경로 은닉) |
| Defense Evasion | Indicator Removal | T1070 | C (3회 시도 후 정상 도메인 404 리다이렉트) |
| Credential Access | Credentials: Web Portals | T1056.003 | A, C |
| Execution (post) | User Execution: Malicious File | T1204.002 | B (사용자가 설치 파일 실행) |

---

# 2. ScamGuard AI 기술 명세

## 2.1 설계 원칙

| 원칙 | 결정 | 이유 |
|---|---|---|
| **Zero-Data** | 페이지 / URL / WHOIS 를 외부 LLM API 로 전송하지 않음. 모든 추론은 클라이언트 내 Gemini Nano 가 수행 | 조직 데이터의 외부 유출 0, 운영 비용 0 |
| **온디바이스 LLM 보조** | Gemini Nano 는 보조 신호. 최종 판정은 결정론적 룰 우선 | Gemini Nano 는 GPT-4 대비 추론 한계가 명확. brand=null 같은 실패 시에도 차단이 가능해야 함 |
| **다층 결정론적 룰** | O0~O7 + D1 + O1-whois 의 9개 우선순위 룰 | LLM 비결정성 캡핑, 동일 URL → 동일 verdict 보장 |
| **사용자 통제 보존** | host 단위 영구 allowlist + 페이지별 검사 기록 초기화 | 오탐 시 사용자가 즉시 우회·재검사 가능. SOC 의존 없이 시범 운영 가능 |
| **폴백 없음** | Chrome 138+ / Gemini Nano 미지원 환경에서는 확장 자체 비활성 | "절반만 동작" 으로 인한 잘못된 안심 방지 |

## 2.2 시스템 아키텍처

```
┌────────────────────────────────────────────────────────────────┐
│                       사용자 활성 탭                            │
│  ┌───────────┐                       ┌──────────────────────┐  │
│  │ click_guard│ ──click 가로채기────▶│ background.js (SW)   │  │
│  └───────────┘                       │  ──────────────────  │  │
└──────────────────────────────────────│  • 4 trigger handler │──┘
                                       │  • scanUrl()         │
   ┌───────────┐ context menu          │     ↓                │
   │ 우클릭    │ ─────────────────────▶│  ┌ extract ────────┐ │
   └───────────┘                       │  │ hidden scan tab │ │
                                       │  │ + content_extract│ │
   ┌───────────┐ 툴바 클릭             │  └─────────────────┘ │
   │ popup     │ ─────────────────────▶│     ↓                │
   └───────────┘                       │  ┌ OCR (Tesseract)─┐ │
                                       │  │ + WHOIS (yesnic)│ │
   ┌─────────────┐ downloads.onCreated │  │ + RDAP (rdap.org)│ │
   │ Downloads API│ ───────────────────▶│ │ + CT (crt.sh)   │ │
   └─────────────┘                     │  └─────────────────┘ │
                                       │     ↓                │
                                       │  ┌ LM session ─────┐ │
                                       │  │ Gemini Nano     │ │
                                       │  │ +JSON 스키마 강제│ │
                                       │  └─────────────────┘ │
                                       │     ↓                │
                                       │  ┌ applyOverrides ─┐ │
                                       │  │ O0-O7+D1+Owhois │ │
                                       │  └─────────────────┘ │
                                       │     ↓                │
                                       │  cache + dispatch    │
                                       │     ↓                │
                                       │  ┌────────────────┐  │
                                       │  │ warning.html   │  │
                                       │  │ verdict.html   │  │
                                       │  │ notification   │  │
                                       │  │ download cancel │ │
                                       │  └────────────────┘  │
                                       └──────────────────────┘
```

## 2.3 진입 트리거

| 트리거 | 동작 | 비고 |
|---|---|---|
| 컨텍스트 메뉴 | 링크 우클릭 → "이 링크 피싱 검사" | 사전 검사 (방문 전) |
| 툴바 액션 버튼 | 현재 탭 검사 + popup 으로 상태/결과 표시 | 수동 |
| Navigation 자동 검사 | `chrome.tabs.onUpdated` (status=complete) → 활성 탭 자동 검사 | 사용자가 URL 입력 / 북마크 / 외부 앱에서 연 경우 |
| 다운로드 | `chrome.downloads.onCreated` → referrer 호스팅 페이지 검사. 위험 시 다운로드 cancel + 알림 | 호스팅 페이지가 피싱이면 파일도 차단 |

`owa.skplanet.com` 자동 스캔(과거 5번째 트리거) 은 v0.1.23 부터 사용자 요청에 의해 비활성화. 관련 파일은 보존되어 있어 manifest 한 줄 복원으로 즉시 재활성 가능.

## 2.4 결정론적 룰 엔진 (`applyOverrides`)

LLM 출력 verdict 에 결정론적 후처리를 가하는 9개 룰. 우선순위·트리거·효과를 정리한다.

| 룰 | 동기 | 트리거 조건 | 효과 |
|---|---|---|---|
| **O0** | 무료호스팅 → 정식도메인 회피 redirect | 원본 host 가 free-hosting 이며 최종 host 가 정식 도메인 | `danger`, score≥8 |
| **O1-whois** | RDAP / CT 가 브랜드 매칭 → 정식 도메인 인정 | LLM 식별 brand 토큰이 RDAP Registrant 또는 CT issuer Org 에 포함 | `safe`, score≤3 (O1 mismatch 우회) |
| **O1** | 브랜드 ↔ 도메인 불일치 | OFFICIAL_DOMAINS 의 brand 와 host 불일치 | free-hosting + 증거 강함 → `danger` 9. free-hosting + 약함 → `warn` 6~7. 일반 도메인 + 증거 → `danger` 9. 일반 도메인 + 단독 → `warn` 6. 일치 → `safe` ≤3 |
| **O2** | 클립보드에 셸 페이로드 | `clipboard.writeText` 에 `curl ... \| bash`, `iex(...)`, `powershell -enc`, `eval`, `base64 -d` 등 | `danger` 10 |
| **O3** | 자동 다운로드 시도 | hidden 탭이 페이지 로드만으로 파일 다운로드 시작 | `danger` 9 |
| **O4** | 위험 URI 스킴 링크 | `applescript://`, `ms-msdt://`, `shell:`, `vbscript:` 등 | `danger` 9 |
| **O7** | Phishing kit Tier-1 시그너처 | inline `<script>` 에 `logo.clearbit.com/${...}`, `api.screenshotmachine.com`, `atob → URL-like` 중 1개 이상 + password input | `danger` 9 |
| **D1** | 영구 denylist hit | host hash 가 `chrome.storage.local.phishingDenylist` 에 존재 | `danger` 8 |
| **O5** | 사용자 개인 신뢰 도메인 | host 가 북마크 / 방문 ≥10회/90일 / topSites 에 존재 (단 free-hosting 슬라이스 제외) | `safe` ≤3 |
| **O6** | 공개 랭킹 인기 도메인 | host 가 POPULAR_KR_DOMAINS(Cloudflare Radar 상위 ~120) 에 존재 (단 free-hosting 슬라이스 제외) | `safe` ≤3 |

여러 룰이 동시 발화하면 verdict.reason 에 `[Auto override: O1+O7] reason1 · reason2.` 형태로 누적된다. `danger` 룰이 하나라도 있으면 `safe` 룰(O5/O6/O1-whois) 은 자동 skip.

## 2.5 자동 소유권 검증 (3-Tier)

브랜드 ↔ 도메인 매칭의 정확도를 높이기 위해 3-tier 시스템을 둔다.

### Tier 1 — `OFFICIAL_DOMAINS` (수동 큐레이션, fast path)

`background.js:55` 의 정적 매핑. 80여 개 브랜드 × 1~10개 도메인. 한국 빅브랜드(네이버 / 카카오 / 쿠팡 / 은행 / 통신사) 와 글로벌 빅테크(Microsoft / Apple / Google / Meta) 커버. 매 검사 가장 먼저 조회.

### Tier 2 — RDAP (`rdap.org`)

WHOIS 의 표준 후속. JSON 응답이며 `entities[].roles == "registrant"` 의 vcardArray 에서 organization name 을 추출한다. Verisign(`.com`) 은 GDPR redaction 으로 종종 비어있지만, MarkMonitor 같은 corporate registrar 의 RDAP 는 Microsoft / Apple 같은 대기업 등록자를 노출한다. 결과는 `chrome.storage.session.rdap:<host>` 에 캐시.

### Tier 3 — Certificate Transparency (`crt.sh`)

발급된 TLS 인증서 목록. `issuer_name` 의 `O=...` 가 공용 CA(Let's Encrypt / DigiCert / Sectigo / GlobalSign / Amazon Trust / Cloudflare / Google Trust / GoDaddy / Entrust) 가 아닌 경우 — 즉 브랜드 자체 CA(예: "Microsoft Corporation" 의 Azure RSA Issuing CA) 가 발급한 cert 가 발견되면 강한 소유권 증거이다. 결과는 `chrome.storage.session.cert:<host>` 에 캐시.

세 결과는 `" | "` 로 결합되어 LLM 입력의 `WHOIS:` 라인과 `applyOverrides` 의 `whois` 인자 양쪽에 동일하게 전달된다. **O1-whois 룰** 은 LLM 이 식별한 brand 의 토큰(≥4자) 이 합본 문자열에 포함되면 OFFICIAL_DOMAINS 등록 여부와 무관하게 정식 도메인으로 인정한다. 이는 `login.microsoftonline.com` 등 OFFICIAL_DOMAINS 갭이 발생해도 자동 보강되는 효과를 가진다.

## 2.6 사용자 통제

### 2.6.1 영구 denylist (`chrome.storage.local.phishingDenylist`)

`verdict.phishing && score≥7` 일 때 host 의 sha256 hash 를 기록. 다음 방문 시 LLM / 추출 / OCR 전부 생략하고 즉시 phishing 으로 short-circuit. 사설 IP 는 기록 거부(`addToDenylist` 가드).

### 2.6.2 영구 allowlist (`chrome.storage.local.allowlistHosts`)

warning.html 의 "이 사이트 허용" 버튼이 호출. host 평문으로 저장 — URL 의 쿼리 / 패스가 변형돼도 동일 host 면 일관되게 통과한다. 확장 자동 업데이트 · SW 재시작 · 브라우저 재시작에 살아남으며, 완전 Remove → Load unpacked 만 소실.

### 2.6.3 검사 기록 초기화

오탐 의심 시 영구 trust 까지는 가지 않고 fresh 재검사를 위한 옵션. 두 진입점:

- **warning.html → "이 페이지 기록 지우고 재검사"**: 그 host 의 denylist + verdict 캐시 + RDAP / CT 캐시만 비우고 같은 URL 로 즉시 navigate. 정말 피싱이면 navigation 자동 검사가 다시 `danger` 로 돌려놓는다 — 안전한 토글, 우회 아님.
- **popup → "이 페이지 기록만 초기화"**: 동일 핸들러 재사용. 차단 화면 거치지 않고도 같은 reset 가능.

### 2.6.4 전체 초기화

popup 의 "전체 검사 기록 초기화" 는 `chrome.storage.session.clear()` + denylist / allowlist 빈 배열 set + 모듈 메모리 캐시 null. notifIcons 와 lang 설정은 보존.

## 2.7 다국어 지원

`i18n.js` 가 80여 개 키의 `STRINGS = { en, ko }` 맵을 제공한다. `chrome.storage.local.lang` 에 사용자 선호를 저장하며 기본값은 `en`. popup 헤더의 `EN | 한국어` 토글이 즉시 전환을 수행하고, SW 는 `chrome.storage.onChanged` 로 반영하여 다음 알림 · verdict prefix 부터 새 언어가 적용된다. LLM 이 생성한 `verdict.reason` 본문만 영문 고정(SYS 프롬프트가 영문 출력을 강제).

---

# 3. 검증 결과

본 도구 개발 사이클 중 실제 발견되었거나 사용자 보고된 7개 사례에 대한 검증 결과를 정리한다.

| # | URL / 호스트 | 이슈 유형 | 초기 동작 | 보강 후 동작 | 적용 룰 / 변경 (릴리즈) |
|---|---|---|---|---|---|
| 1 | `rsig[.]org/rqq/flb/<token>#` (캠페인 C) | 진성 spear-phishing | LLM `brand:null, score:6` 출력 → `warn`, 빨간 화면 미발화 | inline JS 의 Tier-1 시그너처 3종 + password input → 결정론적 `danger` 9 | **O7 신설** (v0.1.21) |
| 2 | `login[.]microsoftonline[.]com/...` | 정상 사이트 false positive | OFFICIAL_DOMAINS 의 Microsoft 항목 5개만 — `microsoftonline.com` 누락 → `warn(6)` | 5개 도메인 추가 + RDAP/CT 자동 매칭 | **OFFICIAL_DOMAINS 확장 + O1-whois 신설** (v0.1.22) |
| 3 | `app[.]any[.]run/?_gl=...#register` | 합법 멀웨어 분석 플랫폼 false positive + UX | URL 풀 해시 단위 allowlist 라 쿼리 변형 시 재차단 | host 단위 + 영구 저장으로 전환 | **allowlist 호스트화 / 영구화** (v0.1.13) |
| 4 | `http://172.29.247.33:8080/` | 인트라넷 사설 IP false positive | `isInternalDomain` 이 hostname-only 검사라 RFC1918 IP 통과 → LLM 이 9/10 phishing 판정 → 영구 denylist 등록 → 재방문마다 차단 | RFC1918 / 127/8 / 169.254/16 / IPv6 ULA / link-local / loopback 을 `isPrivateIp` 로 통합. denylist add / lookup 양쪽에 가드 | **isPrivateIp 신설 + denylist defense-in-depth** (v0.1.14) |
| 5 | `*.workers.dev` 일반 (캠페인 A 와 동일 인프라) | shared-hosting 자동 신뢰 우회 | O5 의 슬라이스 폴백이 `workers.dev` 자체를 trusted Set 에 올려 같은 호스팅 피싱 사이트 통째 신뢰 | 슬라이스 폴백에 FREE_HOSTING_RE 가드. O6 에도 미러링 | **O5 / O6 슬라이스 가드** (v0.1.12) |
| 6 | OWA cached-intercept | warning 미발화 | OWA pre-scan 의 캐시 hit 이 `!meta.cached` 가드를 false 로 만들어 click-time intercept 통째 skip | `navigation` / `action` / `popup` source 는 cached 가드 무시. allowlist 가드는 유지 | **dispatchResult cache 가드 수정** (v0.1.12) |
| 7 | OWA stale summary 바 | 메일 전환 시 빨간 바 잔류 | MutationObserver 가 부모 패널의 stale `.pg-summary` 바를 제거 안 함 | `syncAllSummaryBars()` 가 부모 danger 배지 수 재계산 후 0 이면 제거 | **OWA UI 동기화** (v0.1.14) |

### 3.1 종합 평가

7개 사례 모두 결정론적 룰 / OFFICIAL_DOMAINS / WHOIS-RDAP-CT 자동 매칭의 조합으로 해결되었다. 사용자가 명백한 오탐을 마주쳤을 때의 복구 경로(allowlist · 페이지별 reset) 도 두 진입점(warning.html, popup) 양쪽에서 가능하다.

다만 다음 영역은 여전히 LLM 판정에 의존한다.

- brand 추론이 OFFICIAL_DOMAINS 에 없고 자체 CA 도 없는 중소형 사이트의 첫 검사
- 일반 텍스트 기반 사회공학(ClickFix 류) 의 미묘한 변종

본 영역은 모델 업그레이드 또는 룰 보강의 후속 작업 대상이다.

---

# 4. 한계 및 후속 작업

## 4.1 기술적 한계

| ID | 한계 | 현행 완화책 | 미해결 잔여 |
|---|---|---|---|
| R1 | 숨김 탭에서 공격자 JS 실행 | 8초 하드 타임아웃 + `tabs.remove` finally | 8초 안에 발화하는 페이로드는 여전히 위험 |
| R2 | Gemini Nano 추론 한계 (brand 인식 실패) | 결정론적 룰 9종 + RDAP/CT 자동 매칭 | brand=null + 새 kit signature 의 첫 만남은 LLM 의존 |
| R3 | OCR 한계 (이미지 텍스트 기반 사회공학) | Tesseract eng+kor, 200자/이미지 캡 | 손글씨 / 워터마크 / 비표준 폰트는 미흡 |
| R4 | yesnic 의 Registrant Org 미노출 | RDAP fallback + CT 보강 | 두 소스 모두 redacted 인 도메인은 OFFICIAL_DOMAINS 의존 |
| R5 | crt.sh 의 잦은 502 | (예정) 5xx 캐시 안 함 + AbortController 6초 timeout 적용 필요 | 현 시점에선 transient 502 가 세션 내 캐시되어 CT 단서 일시 분실 |
| R6 | SW idle 종료로 인한 LM 세션 사망 | 모듈 스코프 캐시 + lazy 재생성 | cold start 첫 검사가 느림 (LM 재초기화) |
| R7 | 사용자별 분산 학습 | host 단위 영구 allowlist / denylist | 같은 위협을 N 명이 N 번 만나면 N 번 LLM 호출 — 중앙 공유 부재 |

## 4.2 운영상 한계

- **SOC 통합 부재**: 사용자 단말이 차단해도 SOC 는 알 수 없음. 보안팀이 IOC 를 수집 · 전파할 수단 없음.
- **중앙 정책 미지원**: 모든 설정 · allowlist 가 사용자 로컬. 회사 차원의 "이건 무조건 차단" 정책 주입 불가.
- **사용자 학습 곡선**: 빨간 화면 3개 옵션(돌아가기 / 재검사 / 허용) 의 의미 차이 인지 필요.
- **확장 권한 광범위**: `<all_urls>` + `downloads` + `tabs` + `bookmarks` + `history` + `topSites` 등. 권한 사용처에 대한 보안 거버넌스 검토 필요.

## 4.3 후속 작업 우선순위

| 순위 | 작업 | 범위 | 기대 효과 |
|---|---|---|---|
| 1 | crt.sh 5xx 캐시 안 함 + AbortController 6초 timeout | 1 함수 수정 | 가용성 향상, scanUrl 지연 회피 |
| 2 | 텔레메트리 엔드포인트(opt-in): host hash + 룰 ID + 사용자 액션 익명 집계 | 1 endpoint + opt-in UI | SOC 가 IOC 를 수집 · 전파 가능 |
| 3 | enterprise `managed_storage` 로 중앙 정책 주입 (강제 denylist / allowlist) | manifest schema + 정책 로더 | 조직 단위 배포 시 거버넌스 확보 |
| 4 | brand=null 케이스 보강 — base62 path 토큰 결정론적 검출(O8 후보) | applyOverrides 1 룰 추가 | rsig.org 류 LLM 미의존 검출 |
| 5 | 사용자 가이드 1페이지 + 짧은 인앱 onboarding | docs + 첫 실행 시 splash | 사용자 학습 곡선 완화 |
| 6 | 보안팀 ScamGuard 어드민 대시보드 | 별도 web app + 텔레메트리 백엔드 | 운영 가시성 |
| 7 | 캠페인 B (카카오톡 다운로드 사칭) 추가 정적 분석 — 다운로드 파일 SHA-256 / 인증서 / C2 인프라 | 별도 분석 작업 | 본 보고 시점 미완료. IOC 정제 필요 |

## 4.4 의도적으로 적용하지 않은 사항

- **외부 LLM API 사용** — Zero-Data 원칙 위배. 조직 데이터 외부 유출 위험.
- **`windows.net` / `sharepoint.com` 의 와일드카드 OFFICIAL_DOMAINS 등록** — 고객 제어 서브도메인(`*.cloudapp.windows.net`, `*.sharepoint.com` 테넌트) 우회 위험.
- **검사 결과의 자동 SOC 보고(opt-out only)** — 사용자 동의 필수, opt-in 으로 한정.
- **SYS 프롬프트 한국어화** — LLM 출력 안정성에 영향, 영문 유지.

---

# 5. 릴리즈 히스토리

본 도구는 2026 년 5 월 약 2 주간 18 개 마이너 릴리즈를 통해 반복 개발되었다. 릴리즈 본문은 저장소의 `RELEASE_NOTES.md` 또는 GitHub Releases(https://github.com/windshock/scamguard-ai/releases) 참조.

| 버전 | 키워드 | 주요 변경 |
|---|---|---|
| v0.1.10 | 모델 자동 준비 | popup 진입 시 LM 자동 다운로드 트리거 |
| v0.1.11 | 한국 화이트리스트 + 개인 신뢰 | POPULAR_KR_DOMAINS(O6) / getUserTrustedDomains(O5) |
| v0.1.12 | 보안 강화 | O5 shared-hosting 우회 차단, 영구 denylist 도입, OWA cached-intercept 버그 수정 |
| v0.1.13 | UX | host 단위 영구 allowlist |
| v0.1.14 | 신뢰 영역 | 사설 IP 검사 제외, OWA stale summary 바 동기화 |
| v0.1.15–19 | 외부 PR 머지 | copy 버튼 FP 감소, click_guard prefetch / 캐시 재사용 등 |
| v0.1.20 | O1 elevation | 일반 도메인 + credential 폼 → `danger` |
| v0.1.21 | O7 신설 | Phishing kit Tier-1 시그너처 결정론적 검출 |
| v0.1.22 | 자동 소유권 검증 | RDAP + CT 도입, Microsoft 인증 도메인 확장, O1-whois 룰 |
| v0.1.23 | 운영 | OWA 자동 스캔 비활성 |
| v0.1.24 | UX | popup 의 전체 reset 버튼 |
| v0.1.25 | UX | warning 페이지의 페이지별 reset |
| v0.1.26 | UX | popup 의 페이지별 reset |
| v0.1.27 | 글로벌화 | i18n 도입 (영문 기본 + 한글 토글) |
| v0.1.28 | 글로벌화 완성 | applyOverrides 의 모든 reason 도 i18n |

---

# 6. 부록 — 개발 환경 및 의존 자원

| 구분 | 항목 |
|---|---|
| 언어 / 런타임 | JavaScript (Service Worker MV3 ESM), Chrome 138+ |
| 온디바이스 LLM | Gemini Nano (LanguageModel API). `responseConstraint` 로 JSON 스키마 강제 |
| OCR | Tesseract.js v5 (eng + kor traineddata, 저장소 내 `lib/` 에 벤더링 ≈ 44 MB) |
| 소유권 검증 외부 자원 | `rdap.org` bootstrap RDAP, `crt.sh` JSON API (둘 다 API 키 불필요, 페이지 콘텐츠 미전송) |
| 권한 | `contextMenus / tabs / scripting / storage / notifications / offscreen / downloads / activeTab / bookmarks / history / topSites / <all_urls>` |
| 개발 가속 도구 | Claude Code (Anthropic Claude Opus 4.7, 1M context) — 본 사이클의 핵심 가속 요인 |
| 저장소 | https://github.com/windshock/scamguard-ai |
| 라이선스 | (검토 중) |
