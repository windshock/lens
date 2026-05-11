# icons/

**런타임 생성으로 변경됨 — 수동으로 PNG를 둘 필요 없습니다.**

설치/시작 시 `offscreen.js` 가 `OffscreenCanvas` 로 다음을 생성합니다:

- **툴바 액션 아이콘** (16/32/48/128) — 파란 방패 + ✓
- **알림 아이콘** (128) — 안전/주의/위험 3종 색상 방패, `chrome.storage.local.notifIcons` 에 data URL 캐시

확인 방법:

```
chrome://extensions → 확장 카드 → "Inspect views: service worker" 콘솔에서
> (await chrome.storage.local.get('notifIcons'))
< { notifIcons: { ok: "data:image/png;base64,...", warn: "...", danger: "..." } }
```

아이콘 디자인을 바꾸려면 `offscreen.js` 의 `drawShield()` / `generateIcons()` 를 수정하세요.

이 디렉터리에 PNG를 두어도 사용되지 않습니다(런타임 ImageData가 우선).
