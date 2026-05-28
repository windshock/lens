// run_spof.js — popup.html DevTools 콘솔에서 실행하는 SPOF 테스트 모음.
//
// 외부 연동(yesnic/RDAP/CT/OCR/hidden tab/chrome.notifications) 의 각 실패 모드에서
// scanUrl 이 verdict 를 끝까지 산출하는지 검증한다. 일부 테스트(T-ALL-DOWN)는 SW 측
// 사전 작업이 필요하며 그 단계는 각 테스트의 prereq 에 명시되어 있다.
//
// 사용법:
//   1) chrome-extension://<ext-id>/popup.html 새 탭으로 열고 DevTools (Cmd-Opt-I)
//   2) 다음 중 하나로 로드:
//      a) 이 파일 전체 직접 paste
//      b) <script> 인젝션:
//         const s=document.createElement("script");
//         s.src=chrome.runtime.getURL("eval/run_spof.js");
//         document.head.appendChild(s);
//      ※ fetch().then(eval) 은 popup 페이지 CSP 가 차단함.
//   3) 전체 실행: __spof_runAll()
//      개별 실행: __spof_TNX() / __spof_TIP() / __spof_TALLDOWN() / __spof_TSLOW()

(() => {
  async function runScan(url) {
    return chrome.runtime.sendMessage({
      type: "scan", url, source: "contextMenu", bypassCache: true
    });
  }

  async function checkOrphanScanTabs() {
    const tabs = await chrome.tabs.query({});
    return tabs.filter(t => t.url?.includes("__pg_scan=1"));
  }

  function report(name, ms, verdict, orphans, pass, note) {
    const mark = pass ? "✓" : "✗";
    const tag = pass ? "PASS" : "FAIL";
    console.log("─".repeat(80));
    console.log(`${mark} ${tag}  ${name}  (${ms}ms)`);
    console.log("  verdict:", verdict);
    if (orphans !== undefined) console.log("  orphan scan tabs:", orphans?.length ?? 0);
    if (note) console.log("  note:", note);
    return { name, pass, ms, verdict, orphans: orphans?.length ?? 0, note };
  }

  // T-NX: DNS 안 풀리는 URL — hidden tab 8s 타임아웃 후 verdict 산출되어야 함.
  // 부수효과: LM 이 score ≥ 7 매기면 denylist 에 호스트 추가되니 반복 실행 시 캐시 영향 가능.
  globalThis.__spof_TNX = async () => {
    const url = "https://this-host-does-not-exist-99999.invalid/";
    const t0 = performance.now();
    const v = await runScan(url).catch(e => ({ error: String(e) }));
    const ms = Math.round(performance.now() - t0);
    const orphans = await checkOrphanScanTabs();
    const pass = !v?.error && ms < 15000 && orphans.length === 0;
    return report("T-NX  DNS unresolvable", ms, v, orphans, pass,
      pass ? null : "expected: verdict 객체, elapsed<15s, no orphan tabs");
  };

  // T-IP: IP-only URL — WHOIS 도메인 추출 불가, RDAP/CT 빈 결과. LM 은 no-info 처리해야 함.
  globalThis.__spof_TIP = async () => {
    const url = "http://93.184.216.34/"; // example.com IP
    const t0 = performance.now();
    const v = await runScan(url).catch(e => ({ error: String(e) }));
    const ms = Math.round(performance.now() - t0);
    const pass = !v?.error && typeof v?.phishing_score === "number";
    return report("T-IP  IP-only host", ms, v, undefined, pass,
      pass ? null : "expected: verdict 객체 with numeric score");
  };

  // T-ALL-DOWN: SW 의 모든 fetch 가 reject. WHOIS/RDAP/CT/OCR/notification iconUrl 까지 죽음.
  // PREREQ: SW DevTools 콘솔에서 eval/spof_sw_helpers.js paste 후 __spof.blockAllFetch() 실행.
  // 테스트 끝나면 SW 콘솔에서 __spof.restore() 호출.
  globalThis.__spof_TALLDOWN = async () => {
    const url = "https://example.org/?_spoftest=" + Math.random().toString(36).slice(2, 8);
    const t0 = performance.now();
    const v = await runScan(url).catch(e => ({ error: String(e) }));
    const ms = Math.round(performance.now() - t0);
    const pass = !v?.error && typeof v?.phishing_score === "number";
    return report("T-ALL-DOWN  all SW fetch blocked", ms, v, undefined, pass,
      pass ? "(SW 측 fetch stub 활성 가정. 아니면 통상 fetch 통과해 의미 없는 PASS)"
           : "expected: verdict 객체. notify/WHOIS/RDAP/CT/OCR 실패에도 verdict 손실 금지");
  };

  // T-SLOW: 8s+ 걸리는 페이지 — TAB_LOAD_TIMEOUT_MS=8s 후 강제 진행, 부분 extract 로라도 verdict.
  globalThis.__spof_TSLOW = async () => {
    const url = "https://httpbin.org/delay/10";
    const t0 = performance.now();
    const v = await runScan(url).catch(e => ({ error: String(e) }));
    const ms = Math.round(performance.now() - t0);
    // 부분 extract 라 verdict 가 error 일 수도 있으나 LM 호출까지는 가야 함.
    // 합리적 elapsed = TAB_LOAD_TIMEOUT_MS(8s) + post-load delays(800+1200ms) + LM(~10s) ≈ 20-30s.
    const pass = !v?.error && ms < 40000;
    return report("T-SLOW  slow-loading page", ms, v, undefined, pass,
      pass ? null : "expected: verdict 객체 within ~30s");
  };

  globalThis.__spof_runAll = async () => {
    console.log("▶ SPOF test suite — 4 cases");
    console.log("  T-ALL-DOWN 은 사전에 SW 콘솔에서 fetch stub 설치 필요 (eval/spof_sw_helpers.js).");
    console.log("  설치 안 했으면 그 케이스는 의미 없는 PASS 가 나옴 — note 확인.");
    const results = [];
    results.push(await __spof_TNX());
    results.push(await __spof_TIP());
    results.push(await __spof_TALLDOWN());
    results.push(await __spof_TSLOW());
    const pass = results.filter(r => r.pass).length;
    console.log("─".repeat(80));
    console.log(`SUMMARY: ${pass}/${results.length} pass`);
    console.table(results);
    return results;
  };

  console.log("[run_spof] loaded. run: __spof_runAll() or __spof_TNX/TIP/TALLDOWN/TSLOW individually");
})();
