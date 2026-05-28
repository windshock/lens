# Windshock Lens Security Product Requirements

> Formerly ScamGuard AI. Renamed in v0.2.0 (2026-05-28).

Date: 2026-05-28  
Scope: security requirements derived from `docs/development-spec.md` and `security-architecture-review.md`  
Status vocabulary: `draft`, `planned`, `in_progress`, `blocked`, `done`, `deferred`, `accepted-risk`

## Backlog

| Requirement ID | Title | Statement | Linked Scenarios | Priority | Owner | Target Milestone | Status | Acceptance Criteria | Verification Evidence | Last Reviewed |
|---|---|---|---|---|---|---|---|---|---|---|
| SPR-001 | Internal-domain dangerous-signal policy | Decision (2026-05-28): **α adopted** — internal/private hosts are unconditionally trusted; hidden tab/extract/OCR/WHOIS/LM/hardEvidencePrecheck all skipped after pre-extraction cache/trust shortcuts. Reversal requires updating FR-025 + localhost-* fixtures together. | AS-04 | P0 | Extension owner | v0.1.32 | done | `eval/fixture_manifest.json` localhost-* updated to expectedPhishing=false, dev-spec FR-025 added, dev-spec GAP-002 marked resolved. Release notes still need a dedicated entry if this becomes a public release. | localhost-danger/hard-evidence fixtures, dev-spec FR-025, GAP-002 resolved row | 2026-05-28 |
| SPR-002 | Precise Zero-Data privacy wording | Product documentation must distinguish "no external LLM/API for page analysis" from external metadata/resource requests such as WHOIS/RDAP/CT and image fetches. | AS-01 | P1 | Product/docs owner | v0.1.32 | draft | README/public docs contain a privacy boundary section; no claim implies zero outbound requests. | Pending | 2026-05-28 |
| SPR-003 | Permission justification review | Every Chrome permission and host permission must have a documented purpose and a minimization decision before enterprise or store distribution. | AS-03 | P1 | Extension owner | v0.1.32 | draft | Permission table covers `tabs`, `scripting`, `storage`, `notifications`, `offscreen`, `downloads`, `bookmarks`, `history`, `topSites`, `<all_urls>`; rejected alternatives are recorded. | Pending | 2026-05-28 |
| SPR-004 | Verdict secret minimization | Verdict reasons and logs must not persist credentials, tokens, private keys, or full command payloads. Truncated malicious command evidence is allowed only when needed for explainability. | AS-02 | P1 | Detection owner | v0.1.33 | draft | Payload caps are tested; fixture includes a token-like string and verifies redaction/truncation policy. | Pending | 2026-05-28 |
| SPR-005 | Download race characterization | Download interception must be tested against small/fast files and documented as best-effort or hardened if possible. | AS-05 | P2 | QA/security owner | v0.1.33 | draft | Test artifact records pause/cancel behavior for small and normal files; UX docs state residual risk. | Pending | 2026-05-28 |
| SPR-006 | OWA activation contract | OWA auto-scan must be either removed from product claims or reactivated with a documented sensitive-link skip policy. | AS-01 | P2 | Product owner | v0.1.32 | draft | README, CLAUDE.md, manifest, and public docs agree on OWA status. | Pending | 2026-05-28 |
| SPR-007 | Ownership override regression suite | O1-whois safe override must have fixtures covering legitimate ownership and hallucinated/short brand tokens, and the **free-hosting guard** (2026-05-28 added) must be regression-protected by negative fixtures on `*.azurewebsites.net` / `*.appspot.com` / `*.amazonaws.com` impersonating their platform owner brand. | AS-01 | P2 | Detection owner | v0.1.33 | in_progress | Fixture suite includes positive (real corp ownership via RDAP/CT) + negative (shared-hosting tenant impersonating platform owner brand). Guard implementation: `applyOverrides` O1-whois entry condition includes `!finalOnFree && !origOnFree`. | Code guard applied 2026-05-28; fixture set pending. | 2026-05-28 |
| SPR-008 | Denylist DNS-fail pollution policy | DNS-failing or empty-extract hosts get added to permanent denylist when LM scores them ≥7 with no real evidence. Pattern revealed in T-NX SPOF test (`.invalid` host added). Decision (2026-05-28): **accepted-risk** — recovery paths (popup reset, warning-page allowlist) are sufficient; size/UX impact bounded. Re-evaluate if user reports persistent FP. | AS-03 | P3 | Detection owner | TBD | accepted-risk | Documented in dev-spec; runtime reset paths verified. | dev-spec GAP/SPR row, popup reset UX | 2026-05-28 |
| SPR-009 | Hidden scan tab orphan cleanup | If SW idle-terminates while a hidden scan tab is open, `extractFromHiddenTab` 의 `finally` 에서 `chrome.tabs.remove` 가 실행되지 않을 수 있음. `#__pg_scan=1` 마커 탭이 백그라운드에 남는다. | AS-01 | P2 | Extension owner | v0.1.33 | planned | `chrome.runtime.onStartup` 에서 `__pg_scan=1` 마커 탭 일괄 close. 코드 ~5줄. | Pending | 2026-05-28 |
| SPR-010 | Notification iconUrl serialization bug | `chrome.runtime.sendMessage` 를 통해 offscreen → SW 로 전달되는 `ImageData` 가 클래스 정체성을 잃어 `chrome.action.setIcon` 이 거부 ("imageData property must contain an ImageData object"). 동작 비치명적(기본 액션 아이콘으로 폴백). | — | P2 | Extension owner | v0.1.33 | planned | Offscreen 에서 `ImageData` 대신 `{data: Uint8ClampedArray, width, height}` 평문 객체로 전송하고 SW (Worker) 에서 `new ImageData(...)` 재구성. | Pending | 2026-05-28 |

## Lifecycle Delta

| Date | Added | Updated | Closed | Deferred | Accepted Risk |
|---|---|---|---|---|---|
| 2026-05-28 | SPR-001 through SPR-007 | None | None | None | None |
| 2026-05-28 | SPR-008, SPR-009, SPR-010 | SPR-001 closed (α) | SPR-001 | None | SPR-008 |
| 2026-05-28 | None | SPR-007 (free-hosting guard added, status draft→in_progress) | None | None | None |
