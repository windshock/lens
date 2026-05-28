// spof_sw_helpers.js — Service Worker DevTools 콘솔에 붙여넣는 헬퍼.
//
// T-ALL-DOWN 시나리오 등에서 SW 의 외부 fetch 를 stub 으로 막아 보조 통신(WHOIS/RDAP/CT/OCR
// 이미지 fetch / chrome.notifications.create 의 iconUrl 등)이 전부 실패할 때 scan 이 끝까지
// verdict 를 산출하는지 검증한다. popup 측에서 chrome.runtime.sendMessage 로는 SW globalThis
// 에 접근 불가하므로 이 헬퍼는 별도 컨텍스트(SW DevTools)에서 실행해야 한다.
//
// 사용법:
//   1) chrome://extensions → ScamGuard AI 카드 "service worker" 링크 클릭 → 별도 DevTools 창
//   2) 그 SW DevTools Console 에 아래 IIFE 전체 paste → globalThis.__spof 노출
//      ※ SW 는 Worker 컨텍스트라 document.createElement 불가 — popup 에서 쓰던 <script> 인젝션
//        방식은 SW 에서 안 됨. paste 가 정답.
//   3) popup 콘솔에서 SPOF 테스트 (eval/run_spof.js) 실행
//   4) 끝나면 SW 콘솔에서 __spof.restore() 로 원복

(() => {
  if (globalThis.__spof) {
    console.log("[__spof] already installed. use __spof.restore() to reset.");
    return;
  }
  const realFetch = globalThis.fetch;
  const blocked = [];

  globalThis.__spof = {
    /** 모든 fetch 를 reject 시킨다 (T-ALL-DOWN). */
    blockAllFetch() {
      globalThis.fetch = (...args) => {
        const target = (args[0]?.toString?.() || "").slice(0, 100);
        blocked.push(target);
        console.log("[__spof] fetch blocked:", target);
        return Promise.reject(new Error("network-stub-block"));
      };
      console.log("[__spof] fetch stub installed — all fetch will reject");
    },
    /** 특정 호스트 패턴만 reject. */
    blockFetchMatching(regex) {
      globalThis.fetch = (...args) => {
        const target = args[0]?.toString?.() || "";
        if (regex.test(target)) {
          blocked.push(target);
          console.log("[__spof] fetch blocked:", target.slice(0, 100));
          return Promise.reject(new Error("network-stub-block"));
        }
        return realFetch.apply(globalThis, args);
      };
      console.log("[__spof] fetch stub installed — blocking pattern:", regex);
    },
    /** stub 제거하고 실제 fetch 복구. */
    restore() {
      globalThis.fetch = realFetch;
      console.log("[__spof] fetch restored. Blocked calls during stub:", blocked.length);
      console.log("[__spof] last blocked:", blocked.slice(-5));
      blocked.length = 0;
    },
    /** 진단: 현재 stub 상태와 누적 차단 카운트. */
    status() {
      return {
        stubbed: globalThis.fetch !== realFetch,
        blockedCount: blocked.length,
        recentBlocked: blocked.slice(-10)
      };
    },
    /** inflight scan dedup 상태 확인용 (single-flight 검증). */
    inflightInspect() {
      if (typeof inflightScans === "undefined") {
        return "inflightScans is not in this scope (module-scoped const)";
      }
      return { size: inflightScans.size, keys: [...inflightScans.keys()] };
    }
  };
  console.log("[__spof] ready. methods: blockAllFetch / blockFetchMatching(re) / restore / status");
})();
