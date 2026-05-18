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
  await initI18n();
  applyI18nDom(document);
  // footnote 의 \n 을 <br> 로 직접 렌더
  const fn = $("footnote");
  if (fn) fn.innerHTML = t("warning.footnote").split("\n").join("<br>");
  document.title = t("warning.title");

  const { url, vid } = decodeQS();
  $("url").textContent = safeText(url, t("warning.urlMissing"));
  let hostForTitle = "";
  try { hostForTitle = url ? new URL(url).hostname : ""; } catch {}
  document.title = t("warning.tabTitleHead", hostForTitle || t("warning.urlMissing"));

  let verdict = null;
  if (vid) {
    try {
      verdict = await chrome.runtime.sendMessage({ type: "getVerdict", vid });
    } catch (e) { /* SW 죽었거나 vid 만료 */ }
  }

  if (verdict) {
    $("score").textContent = `${verdict.phishing_score ?? "?"} / 10`;
    $("brand").textContent = safeText(verdict.brand, t("warning.brandUnknown"));
    $("reason").textContent = safeText(verdict.reason, t("warning.reasonMissing"));
  } else {
    $("score").textContent = "?";
    $("brand").textContent = t("warning.brandUnknown");
    $("reason").textContent = t("warning.loadFailed");
  }

  $("back").addEventListener("click", async () => {
    // 위험 페이지가 history 직전에 있을 수 있으므로 탭 자체를 닫는 게 가장 안전.
    await chrome.runtime.sendMessage({ type: "closeTab" });
  });

  $("rescan").addEventListener("click", async () => {
    if (!url) return;
    let host = "";
    try { host = new URL(url).hostname; } catch {}
    const hostLabel = host
      ? t("warning.confirmProceedHost", host)
      : t("warning.confirmProceedFallback");
    const ok = confirm(t("warning.confirmRescan", hostLabel));
    if (!ok) return;
    $("rescan").disabled = true;
    try {
      const r = await chrome.runtime.sendMessage({ type: "resetHistoryForUrl", url });
      if (!r?.ok) {
        alert(t("warning.alertFailed", r?.error || ""));
        $("rescan").disabled = false;
        return;
      }
      location.replace(url);
    } catch (e) {
      alert(t("warning.alertError", String(e?.message || e)));
      $("rescan").disabled = false;
    }
  });

  $("proceed").addEventListener("click", async () => {
    if (!url) return;
    let host = "";
    try { host = new URL(url).hostname; } catch {}
    const hostLabel = host
      ? t("warning.confirmProceedHost", host)
      : t("warning.confirmProceedFallback");
    const ok = confirm(t("warning.confirmProceed", hostLabel));
    if (!ok) return;
    await chrome.runtime.sendMessage({ type: "allowlist", url });
    location.replace(url); // history 한 칸 줄임
  });
}

init().catch(e => console.warn("warning init failed:", e));
