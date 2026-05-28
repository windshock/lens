// run_regression.js — popup.html DevTools 콘솔에 붙여넣어 회귀 검증.
//
// eval/fixture_manifest.json 의 모든 케이스에 대해 chrome.runtime.sendMessage 로
// scan 요청을 보내고, expectedPhishing / minScore / maxScore 기대값과 비교해 PASS/FAIL 보고.
// bypassCache: true 라 single-flight 와 캐시 둘 다 우회 — 매번 깨끗한 LM 호출 발생.
//
// 사용법:
//   1) chrome-extension://<ext-id>/popup.html 을 새 탭으로 열고 DevTools (Cmd-Opt-I)
//   2) 다음 중 하나로 로드:
//      a) 이 파일 전체 직접 paste (단순)
//      b) <script> 인젝션 (programmatic — extension 자체 URL 이라 CSP 'self' 통과):
//         const s=document.createElement("script");
//         s.src=chrome.runtime.getURL("eval/run_regression.js");
//         document.head.appendChild(s);
//      ※ fetch().then(eval) 은 MV3 extension page 의 'script-src self' 가 차단해서 안 됨.
//   3) PASS/FAIL 라인 + 최종 console.table 확인
//
// 새 케이스 추가는 eval/fixture_manifest.json 에. 이 runner 는 manifest 만 fetch 해서 돌림.

(async () => {
  const manifestUrl = chrome.runtime.getURL("eval/fixture_manifest.json");
  let fixtures;
  try {
    fixtures = await fetch(manifestUrl).then(r => r.json());
  } catch (e) {
    console.error("fixture_manifest.json fetch 실패 — extension 컨텍스트(popup.html) 인지 확인:", e);
    return;
  }

  console.log(`▶ Running ${fixtures.length} fixtures (bypassCache=true)`);
  console.log("─".repeat(90));

  const results = [];
  for (const fx of fixtures) {
    const t0 = performance.now();
    let v = null, err = null;
    try {
      v = await chrome.runtime.sendMessage({
        type: "scan", url: fx.url, source: "contextMenu", bypassCache: true
      });
    } catch (e) {
      err = String(e?.message || e);
    }
    const ms = Math.round(performance.now() - t0);

    let pass = false;
    let failReason = "";
    if (err) {
      failReason = "sendMessage rejected: " + err;
    } else if (!v || v.error) {
      failReason = "scan error: " + (v?.error || "null verdict");
    } else {
      const phishMatch = v.phishing === fx.expectedPhishing;
      const score = v.phishing_score ?? null;
      const minOK = fx.minScore == null || (score !== null && score >= fx.minScore);
      const maxOK = fx.maxScore == null || (score !== null && score <= fx.maxScore);
      pass = phishMatch && minOK && maxOK;
      if (!phishMatch) {
        failReason = `phishing=${v.phishing} (expected ${fx.expectedPhishing})`;
      } else if (!minOK) {
        failReason = `score=${score} < minScore ${fx.minScore}`;
      } else if (!maxOK) {
        failReason = `score=${score} > maxScore ${fx.maxScore}`;
      }
    }

    results.push({
      name: fx.name,
      pass,
      phishing: v?.phishing ?? null,
      score: v?.phishing_score ?? null,
      brand: v?.brand ?? null,
      ms,
      fail: failReason
    });

    const mark = pass ? "✓" : "✗";
    const tag = pass ? "PASS" : "FAIL";
    const note = failReason ? ` — ${failReason}` : "";
    console.log(`${mark} ${tag}  ${fx.name.padEnd(40)} phishing=${v?.phishing} score=${v?.phishing_score} (${ms}ms)${note}`);
  }

  const passCount = results.filter(r => r.pass).length;
  const failCount = results.length - passCount;
  console.log("─".repeat(90));
  console.log(`SUMMARY: ${passCount}/${results.length} pass · ${failCount} fail`);
  console.table(results);
  return results;
})();
