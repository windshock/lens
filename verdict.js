// verdict.js — popup 또는 알림 클릭에서 호출되는 상세 페이지.

function sevsForCurrentLang() {
  return {
    danger: { label: t("verdict.sevDanger"), color: "#b91c1c" },
    warn:   { label: t("verdict.sevWarn"),   color: "#d97706" },
    ok:     { label: t("verdict.sevOk"),     color: "#1f883d" }
  };
}

function sevFor(v) {
  if (!v) return "ok";
  if (v.phishing || (v.phishing_score ?? 0) >= 7) return "danger";
  if ((v.phishing_score ?? 0) >= 4) return "warn";
  return "ok";
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

(async () => {
  await initI18n();
  document.title = t("verdict.heading");

  const params = new URLSearchParams(location.search);
  const targetUrl = params.get("url");

  let v;
  if (targetUrl) {
    // popup에서 특정 URL의 verdict 요청
    v = await chrome.runtime.sendMessage({ type: "getVerdict", url: targetUrl });
  }
  if (!v) {
    // fallback: 마지막 검사 결과
    const { lastVerdict } = await chrome.storage.session.get("lastVerdict");
    v = lastVerdict;
  }
  const root = document.getElementById("root");
  if (!v) {
    root.innerHTML = `<p>${esc(t("verdict.empty"))}</p>`;
    return;
  }
  const sev = sevFor(v);
  const cfg = sevsForCurrentLang()[sev];
  const score = v.phishing_score ?? 0;
  const pct = Math.min(100, Math.max(0, score * 10));
  const ts = v.ts ? new Date(v.ts).toLocaleString() : "";

  root.innerHTML = `
    <h1>${esc(t("verdict.heading"))} <span class="badge ${sev}">${esc(cfg.label)}</span></h1>
    <div class="url">${esc(v.url || "")}</div>

    <div class="grid">
      <div class="gauge" style="--gc:${cfg.color}; --gp:${pct};">
        <span class="num">${score}</span><span class="denom">/10</span>
      </div>
      <div class="signals">
        <div class="sig"><span class="k">${esc(t("verdict.label.brand"))}</span><span class="v">${esc(v.brand) || esc(t("verdict.brandUnknown"))}</span></div>
        <div class="sig"><span class="k">${esc(t("verdict.label.suspicious"))}</span><span class="v ${v.suspicious_domain ? "bad" : "ok"}">${v.suspicious_domain ? esc(t("verdict.yes")) : esc(t("verdict.no"))}</span></div>
        <div class="sig"><span class="k">${esc(t("verdict.label.phishing"))}</span><span class="v ${v.phishing ? "bad" : "ok"}">${v.phishing ? esc(t("verdict.yes")) : esc(t("verdict.no"))}</span></div>
      </div>
    </div>

    <div class="reason">${esc(v.reason || "")}</div>

    <div class="actions">
      <button id="allow" class="warn">${esc(t("verdict.btnAllow"))}</button>
      <button id="close">${esc(t("verdict.btnClose"))}</button>
    </div>

    <div class="ts">${esc(t("verdict.scannedAt"))} ${esc(ts)}</div>
    <pre>${esc(JSON.stringify(v, null, 2))}</pre>
  `;

  document.getElementById("close").addEventListener("click", () => window.close());
  document.getElementById("allow").addEventListener("click", async () => {
    if (!v.url) return;
    let host = "";
    try { host = new URL(v.url).hostname; } catch {}
    const hostLabel = host
      ? t("verdict.confirmAllowHost", host)
      : t("verdict.confirmAllowFallback");
    if (!confirm(t("verdict.confirmAllow", hostLabel))) return;
    const res = await chrome.runtime.sendMessage({ type: "allowlist", url: v.url });
    alert(res?.host ? t("verdict.allowDone", res.host) : t("verdict.allowDoneFallback"));
  });
})();
