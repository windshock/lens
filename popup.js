// popup.js

const $ = (id) => document.getElementById(id);

function showStatus(availability) {
  const el = $("status");
  if (availability === "available") {
    el.className = "status ok";
    el.textContent = "온디바이스 모델 사용 가능";
    $("scan").disabled = false;
  } else if (availability === "downloadable" || availability === "downloading") {
    el.className = "status dl";
    el.textContent = "모델 다운로드 중… (chrome://on-device-internals 확인)";
    $("scan").disabled = true;
  } else {
    el.className = "status no";
    el.textContent = "온디바이스 모델 사용 불가 — 확장 비활성";
    $("scan").disabled = true;
  }
}

const STAGES = [
  { at: 0,    label: "페이지 로드 중…" },
  { at: 2500, label: "DOM/이미지 추출 중…" },
  { at: 5000, label: "OCR + WHOIS 조회 중…" },
  { at: 8000, label: "모델 추론 중…" }
];

function startStageTicker() {
  const result = $("result");
  let i = 0;
  result.innerHTML = `<div class="verdict v-warn" id="stage">${STAGES[0].label}</div>`;
  const stage = document.getElementById("stage");
  const start = Date.now();
  const t = setInterval(() => {
    const elapsed = Date.now() - start;
    while (i + 1 < STAGES.length && elapsed >= STAGES[i + 1].at) i++;
    stage.textContent = STAGES[i].label + " (" + Math.round(elapsed / 1000) + "s)";
  }, 500);
  return () => clearInterval(t);
}

function renderVerdict(v) {
  const box = $("result");
  if (!v) { box.innerHTML = ""; return; }
  if (v.error) {
    box.innerHTML = `<div class="verdict v-warn">오류: ${v.error}</div>`;
    return;
  }
  const sev = v.phishing || (v.phishing_score ?? 0) >= 7 ? "danger"
            : (v.phishing_score ?? 0) >= 4 ? "warn" : "ok";
  const label = sev === "danger" ? "피싱 의심" : sev === "warn" ? "주의" : "안전";
  const score = v.phishing_score ?? 0;
  const reason = (v.reason || "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
  box.innerHTML = `
    <div class="verdict v-${sev}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${label}</strong>
        <span style="font-size:11px;">${score}/10${v.brand ? " · " + v.brand : ""}</span>
      </div>
      <div class="reason">${reason}</div>
      <div style="margin-top:6px;"><a href="#" id="detail" style="font-size:11px;color:inherit;">자세히 보기</a></div>
    </div>`;
  const detail = document.getElementById("detail");
  if (detail) detail.addEventListener("click", (e) => {
    e.preventDefault();
    const params = v.url ? `?url=${encodeURIComponent(v.url)}` : "";
    chrome.tabs.create({ url: chrome.runtime.getURL("verdict.html") + params });
  });
}

async function init() {
  const availability = await chrome.runtime.sendMessage({ type: "availability" });
  showStatus(availability);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("url").textContent = tab?.url || "";

  $("scan").addEventListener("click", async () => {
    $("scan").disabled = true;
    const stopTicker = startStageTicker();
    try {
      const v = await chrome.runtime.sendMessage({ type: "scan", url: tab.url, source: "popup" });
      stopTicker();
      renderVerdict(v);
    } catch (e) {
      stopTicker();
      $("result").innerHTML = `<div class="verdict v-warn">오류: ${String(e)}</div>`;
    } finally {
      $("scan").disabled = availability !== "available";
    }
  });
}
init();
