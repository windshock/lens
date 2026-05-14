// warning.js — 위험 페이지 가로채기 화면. background.js의 dispatchResult가 활성 탭을
// 이 페이지로 redirect할 때 ?u=<URL>&vid=<verdict-id> 형태로 호출된다.

const $ = (id) => document.getElementById(id);

function decodeQS() {
  const p = new URLSearchParams(location.search);
  return { url: p.get("u") || "", vid: p.get("vid") || "" };
}

function safeText(s, fallback = "") {
  return (s == null || s === "") ? fallback : String(s);
}

async function init() {
  const { url, vid } = decodeQS();
  $("url").textContent = safeText(url, "(URL 없음)");
  document.title = "피싱 의심: " + (url ? new URL(url).hostname : "알 수 없는 페이지");

  let verdict = null;
  if (vid) {
    try {
      verdict = await chrome.runtime.sendMessage({ type: "getVerdict", vid });
    } catch (e) { /* SW 죽었거나 vid 만료 */ }
  }

  if (verdict) {
    $("score").textContent = `${verdict.phishing_score ?? "?"} / 10`;
    $("brand").textContent = safeText(verdict.brand, "(미확인)");
    $("reason").textContent = safeText(verdict.reason, "(사유 정보 없음)");
  } else {
    $("score").textContent = "?";
    $("brand").textContent = "(미확인)";
    $("reason").textContent = "검사 결과 정보를 불러올 수 없습니다.";
  }

  $("back").addEventListener("click", async () => {
    // 위험 페이지가 history 직전에 있을 수 있으므로 탭 자체를 닫는 게 가장 안전.
    await chrome.runtime.sendMessage({ type: "closeTab" });
  });

  $("proceed").addEventListener("click", async () => {
    if (!url) return;
    let host = "";
    try { host = new URL(url).hostname; } catch {}
    const hostLabel = host ? `사이트 ${host}` : "이 사이트";
    const ok = confirm(`이 페이지가 안전하다고 직접 확인했습니까?\n허용 시 ${hostLabel} 의 모든 페이지는 앞으로 검사하지 않습니다. 이 설정은 확장을 재설치하기 전까지 유지됩니다.`);
    if (!ok) return;
    await chrome.runtime.sendMessage({ type: "allowlist", url });
    location.replace(url); // history 한 칸 줄임
  });
}

init().catch(e => console.warn("warning init failed:", e));
