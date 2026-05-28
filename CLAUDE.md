# Windshock Lens — 프로젝트 가이드 (AI 친화 문서)

> v0.2.0 부터 ScamGuard AI 에서 Windshock Lens 로 리네임. 저장소 디렉터리명 `scamguard-ai` 는 유지 (repo 이름 변경 별도 결정). 코드/문서의 product 표기는 Windshock Lens.

> 이 디렉터리는 **Chrome MV3 확장 (Gemini Nano 온디바이스 피싱 검사기)** 입니다.
> 과거 Python 파이프라인(Selenium + Ollama llama3)은 `legacy/python_pipeline/` 으로 보존되어 있으며, 더 이상 런타임 컴포넌트가 아닙니다.

---

## 1. 프로젝트 한눈에 보기

**목표:** 사용자가 만나는 URL이 피싱인지를 Chrome 내장 **Gemini Nano (Prompt API)** 로 즉석 판정. 폴백 없음(미지원 환경에선 확장 자체가 비활성화).

**4종 트리거:**
1. 우클릭 컨텍스트 메뉴 "이 링크 피싱 검사"
2. 툴바 액션 버튼 (현재 페이지 검사)
3. ~~`owa.skplanet.com` 자동 스캔~~ — **v0.1.23 부터 비활성**. owa_scan.js / owa_banner.css 파일은 보존되어 있고 manifest.json 의 content_scripts 엔트리만 제거. 재활성화는 그 블록 복원만 하면 됨.
4. 다운로드 시작 시 — 호스팅 페이지(`referrer`)를 검사, 피싱 판정이면 `chrome.downloads.cancel`

**핵심 데이터 흐름:** SW → 숨김 탭으로 URL 렌더 → content script가 forms/anchors/imgs/text 직렬화 → offscreen document에서 Tesseract OCR + WHOIS HTML 파싱 → SW가 우선순위 슬라이스 빌드 → `LanguageModel.prompt(body, { responseConstraint: VERDICT_SCHEMA })` → 캐시(`chrome.storage.session`) + 알림/배너/다운로드 차단.

---

## 2. 디렉터리 구조

```
scamguard-ai/
├── manifest.json              # MV3, minimum_chrome_version: 138
├── background.js              # SW — LM 세션, 4종 트리거, scanUrl(), 탭 가로채기, allowlist
├── content_extract.js         # 숨김 탭에 주입, DOM/form/anchor/img 직렬화
├── offscreen.html / .js       # OCR(Tesseract.js) + WHOIS DOMParser + 아이콘 런타임 생성
├── owa_scan.js / owa_banner.css   # OWA 자동 스캔 + anchor 배지 + 상단 요약 바
├── popup.html / popup.js      # 툴바 팝업 (상태 + 수동 스캔 + 진행 단계 표시)
├── verdict.html / verdict.js  # 알림 클릭 → 최근 verdict 상세 (게이지+시그널+세션 허용)
├── warning.html/.js/.css      # 위험 페이지 가로채기 화면 (탭이 자동 전환됨)
├── lib/
│   ├── README.md              # Tesseract.js 벤더링 가이드 (업그레이드 시에만 참조)
│   └── tesseract.min.js, worker.min.js, tesseract-core.wasm.js, eng.traineddata, kor.traineddata  ← 저장소에 포함됨 (MV3 정책상 CDN 로드 불가)
├── icons/
│   └── README.md              # 런타임 생성됨, 수동 배치 불필요
│
├── legacy/python_pipeline/   # 과거 코드 — 사양 참조용. 런타임 아님.
│   ├── ModelFile              # 시스템 프롬프트 원본. background.js의 SYS 상수와 동기 유지.
│   ├── testsel.py             # 옛 엔드투엔드(Selenium + Ollama). DOM 추출 로직의 ground truth.
│   ├── testyesnic.py, testextractwhoisdata.py  # WHOIS 셀렉터·파싱 사양
│   ├── checkPhisingEmail.py, .py2  # 옛 이메일 모니터. 자격증명 평문 — 폐기 권장.
│   └── (기타 test*.py)
│
└── (도메인 인벤토리 — 확장과 무관, 유지)
    ├── checkhttpservice.py, extractdomainzonefile.py
    └── skplanet*.{zone,txt}, phishingurls.txt
```

`path/to/venv/` 디렉터리는 과거 `python3 -m venv path/to/venv` 가 placeholder를 그대로 실행한 잔재 venv. 확장과 무관 — 정리 시 삭제해도 무방.

---

## 3. 빌드/로드 절차

### 사전 준비 (1회)
1. Chrome stable ≥ 138 (`chrome://version`)
2. `chrome://on-device-internals` → "Optimization Guide On Device Model" `Available` 확인. `Pending` 이면 Chrome 켜둔 채 ~10분 대기 (약 2GB 다운로드).
3. `lib/` 의 Tesseract.js 파일 5개(eng+kor.traineddata 포함)는 저장소에 포함되어 있어 별도 배치 불필요. 업그레이드 시에만 `lib/README.md` 참조. (아이콘은 런타임 생성됨)

### 로드
4. `chrome://extensions` → Developer mode ON → **Load unpacked** → 이 디렉터리 선택.
5. 확장 카드의 "Inspect views: service worker" 클릭 → SW 콘솔에 `LM availability: available` 및 `icons generated: 16,32,48,128` 확인.

---

## 4. 핵심 파일별 역할

| 파일 | 핵심 책임 |
|---|---|
| `background.js` | `SYS` 시스템 프롬프트 상수, `VERDICT_SCHEMA` JSON 스키마, `scanUrl(url, source, meta)` 단일 진입점, 4종 트리거 핸들러, 캐시·세션 allowlist(`chrome.storage.session`), 알림(`notifIcons` data URL), 다운로드 pause/cancel/resume, **위험 verdict 시 활성 탭을 `warning.html` 로 강제 전환**, `onInstalled`/`onStartup` 에서 아이콘 런타임 생성 트리거. |
| `content_extract.js` | `script/style/svg/iframe` 제거 후 input·textarea·form·select·button 직렬화, anchor href+text(최대 40), img src(최대 12), `body.innerText` 반환. SW에 IIFE 반환값으로 전달. |
| `offscreen.js` | `OCR` 메시지: 이미지를 fetch→blob→Tesseract `recognize`(eng+kor), 이미지당 200자/총 800자 캡. `OCR_DIAGNOSTICS` 메시지: OCR 런타임/언어 파일 가용성 반환. `WHOIS_PARSE` 메시지: yesnic HTML에서 testyesnic의 정확한 td 셀렉터로 파싱 후 7키 한 줄 압축. `GENERATE_ICONS` 메시지: OffscreenCanvas로 액션(16/32/48/128)·알림(ok/warn/danger 128) 방패 아이콘 생성. |
| `owa_scan.js` | `MutationObserver`로 `[role="document"]`/`[class*="ReadingPane"]`/`[class*="ItemContent"]` 패턴 매칭 + 외부 anchor 추출 + SW에 검사 요청. `verdict-banner` 회신 시 `<span class="pg-badge">` 주입. **위험 anchor 누적 시 본문 상단에 `.pg-summary` 빨간 바**(클릭 시 첫 위험 anchor로 스크롤). 30초 무매칭이면 `console.warn` — 단, 실제 OWA 컨텍스트(owa.skplanet.com 또는 OWA DOM 존재)일 때만 경고. |
| `popup.js` | `availability` 조회 후 상태 표시, "현재 페이지 검사" 버튼이 `chrome.runtime.sendMessage({type:"scan", url})` 호출. 스캔 중 단계 표시(페이지 로드→추출→OCR/WHOIS→추론), 결과에 "자세히 보기" 링크. |
| `warning.html`/`.js`/`.css` | 활성 탭이 자동 전환되는 풀스크린 빨간 경고. `?u=&vid=` querystring으로 URL+verdict id 받음. [돌아가기]→`closeTab` 메시지, [그래도 계속]→`allowlist` 메시지 후 원본 URL로 `location.replace`. |
| `verdict.html`/`.js` | conic-gradient 게이지로 phishing_score 시각화 + 시그널 카드(brand/suspicious_domain/phishing) + "이 세션 동안 허용" 버튼. |

---

## 5. 시스템 프롬프트의 단일 진실

`background.js` 의 `SYS` 상수가 LLM에 들어가는 시스템 메시지의 단일 소스. 변경 시:

1. `background.js` 의 `SYS` 수정
2. `legacy/python_pipeline/ModelFile` 도 동기화 (사양 문서로 보존 중)
3. 확장 재로드 — LM 세션은 SW 재시작 시 새로 생성됨

룰 변경(휴리스틱 추가, FP 감소 등)은 99% 이 한 곳을 만지는 작업.

---

## 6. 알려진 한계 & 리스크

| ID | 사항 |
|---|---|
| R1 | 숨김 탭에서 공격자 JS 실행. 8s 하드 타임아웃 + `tabs.remove`로 완화하나 잔여 위험 있음. |
| R2 | Gemini Nano는 llama3-8B 대비 추론 약함. JSON 스키마 강제 + 우선순위 슬라이스(URL+WHOIS+FORMS) + 사내 도메인 단축 평가로 완화. "보조 도구"임을 명시. |
| R3 | OWA DOM은 MS 업데이트로 깨질 수 있음. tolerant 셀렉터 다중 매칭으로 완화. 30s 무매칭 시 SW 콘솔에 경고. |
| R4 | 다운로드 레이스 — tiny 파일은 `pause` 전에 완료될 수 있음. best-effort 수용. |
| R5 | yesnic 스크래핑 실패 시 `"WHOIS lookup failed"` 리터럴 전달. 시스템 프롬프트가 "no-data is not phishing sign"으로 처리. |
| R6 | SW 30s idle 종료 → LM 세션·Tesseract worker 사망. 모듈 스코프 캐시 + lazy 재생성. verdict 캐시는 session storage라 살아남음. |

---

## 7. 검증

### 7-1. 수동 검증

각 트리거의 골든 패스/네거티브:

- **T1 컨텍스트 메뉴**: `phishingurls.txt` 의 `http://211.188.179.86:8686/down/...` 를 빈 페이지에 붙여넣고 우클릭 → 빨간 알림, score ≥ 7. `https://www.google.com` 우클릭 → 초록 알림.
- **T2 툴바**: 위 URL로 직접 이동 → 툴바 아이콘 클릭 → 팝업에서 동일 verdict.
- **T3 OWA**: `owa.skplanet.com` 로그인 → 외부 링크 포함 메일 열기 → 각 anchor 옆 배지 ≤ 10초.
- **T4 다운로드**: 위 phishing URL이 호스팅하는 다운로드 트리거 → 빨간 알림, `~/Downloads` 에 파일 없음. github 릴리스 zip 다운로드는 무알림으로 완료.

**비활성 상태 검증:** Chrome을 `--disable-features=OptimizationGuideOnDeviceModel` 로 재실행 → 배지 `X`, 4개 트리거 전부 no-op. "폴백 없음" 요구사항 증명.

### 7-2. 자동 검증 (eval_harness.py)

```bash
# Diagnostics: 모델/OCR 상태 확인
python3 eval/eval_harness.py --diagnostics

# Fixture validation: fixture_manifest.json 기반 pass/fail
python3 eval/eval_harness.py --fixture

# 전체 코퍼스 스캔 (기존)
python3 eval/eval_harness.py --max 20
```

**diagnostics 메시지 인터페이스:**
```
chrome.runtime.sendMessage({ type: "diagnostics" })
→ { modelAvailability, ocrAvailable, ocrLanguages, tesseractFilesPresent }
```

**fixture manifest** (`eval/fixture_manifest.json`): 각 케이스는 `{ name, url, expectedPhishing, maxScore?, minScore?, notes }` 형태.

**테스트 페이지 분리:**
- `eval/danger_fixture.html`: 위험 URI, 실행파일 링크, ClickFix 복사 버튼만 포함 (자동 검증 판정 기준)
- `eval/benign_fixture.html`: 정상 복사 버튼, Copyright false-match, 정상 문서/다운로드 링크만 포함
- `eval/test_page.html`: 종합 수동 테스트용 (혼합형, 자동 검증 판정 기준으로 사용하지 않음)

---

## 8. 변경/확장 시 자주 보는 자리

| 사용자 요청 | 손볼 위치 |
|---|---|
| 룰 강화/완화 | `background.js` 의 `SYS` 상수 (+ `legacy/.../ModelFile` 동기화) |
| 출력 키 추가/제거 | `background.js` 의 `VERDICT_SCHEMA` + `popup.js`/`verdict.js` 렌더링 |
| 토큰 초과 다발 | `background.js` 의 `buildPromptSlices()` 캡 조정 |
| OCR 결과 비어있음 | `offscreen.js` 의 `ocrImages` + `checkOcrAvailability()` + `lib/README.md` 의 Tesseract 배치 확인 |
| OCR/모델 진단 | `chrome.runtime.sendMessage({type:"diagnostics"})` → `background.js` 핸들러 + `offscreen.js` 의 `OCR_DIAGNOSTICS` |
| OWA DOM 안 잡힘 | `owa_scan.js` 의 `PANEL_SELECTORS` 확장 |
| 사내 도메인 추가 | `background.js` 의 `INTERNAL_DOMAINS` 배열 |
| Gemini Nano 미지원 환경에서 동작 원함 | 정책 변경 사안 — 현 설계는 의도적으로 폴백 없음 |

---

## 9. 보안 주의 사항

- `legacy/python_pipeline/checkPhisingEmail.py` 와 `.py2` 에는 2024-06 시점의 **사내 자격증명 + OpenAI API 키가 평문 하드코딩**되어 있음. 사용 안 하더라도 **즉시 회전/폐기**할 것. 이 파일들은 참조 가치가 낮아 삭제도 무방.
- 확장의 `host_permissions: ["<all_urls>"]` + `downloads` 권한은 강력. 단일 사용자 PoC 가정이며, 사내 배포 시 별도 권한 심사 필요.
