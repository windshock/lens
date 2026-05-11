// verdict.js — popup 또는 알림 클릭에서 호출되는 상세 페이지.

const SEVS = {
  danger: { label: "피싱 의심", color: "#b91c1c" },
  warn:   { label: "주의",      color: "#d97706" },
  ok:     { label: "안전",      color: "#1f883d" }
};

function sevFor(v) {
  if (!v) return "ok";
  if (v.phishing || (v.phishing_score ?? 0) >= 7) return "danger";
  if ((v.phishing_score ?? 0) >= 4) return "warn";
  return "ok";
}

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c])); }

(async () => {
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
    root.innerHTML = "<p>최근 검사 기록이 없습니다.</p>";
    return;
  }
  const sev = sevFor(v);
  const cfg = SEVS[sev];
  const score = v.phishing_score ?? 0;
  const pct = Math.min(100, Math.max(0, score * 10));
  const ts = v.ts ? new Date(v.ts).toLocaleString() : "";

  root.innerHTML = `
    <h1>최근 검사 결과 <span class="badge ${sev}">${cfg.label}</span></h1>
    <div class="url">${esc(v.url || "")}</div>

    <div class="grid">
      <div class="gauge" style="--gc:${cfg.color}; --gp:${pct};">
        <span class="num">${score}</span><span class="denom">/10</span>
      </div>
      <div class="signals">
        <div class="sig"><span class="k">브랜드</span><span class="v">${esc(v.brand) || "(미확인)"}</span></div>
        <div class="sig"><span class="k">의심 도메인</span><span class="v ${v.suspicious_domain ? "bad" : "ok"}">${v.suspicious_domain ? "예" : "아니오"}</span></div>
        <div class="sig"><span class="k">피싱 판정</span><span class="v ${v.phishing ? "bad" : "ok"}">${v.phishing ? "예" : "아니오"}</span></div>
      </div>
    </div>

    <div class="reason">${esc(v.reason || "")}</div>

    <div class="actions">
      <button id="allow" class="warn">이 세션 동안 허용</button>
      <button id="close">닫기</button>
    </div>

    <div class="ts">검사 시각: ${ts}</div>
    <pre>${esc(JSON.stringify(v, null, 2))}</pre>
  `;

  document.getElementById("close").addEventListener("click", () => window.close());
  document.getElementById("allow").addEventListener("click", async () => {
    if (!v.url) return;
    if (!confirm("이 세션 동안 이 URL을 더 이상 검사하지 않습니다. 진행할까요?")) return;
    await chrome.runtime.sendMessage({ type: "allowlist", url: v.url });
    alert("허용 등록되었습니다. (브라우저 종료 시 해제)");
  });
})();
