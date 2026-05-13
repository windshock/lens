// popup.js

const $ = (id) => document.getElementById(id);

let latestAvailability = "unavailable";
let statusPoll = null;

function normalizeStatus(status) {
  if (typeof status === "string") return { availability: status };
  return status || { availability: "unavailable" };
}

function progressText(progress) {
  if (!progress || typeof progress.loaded !== "number") return "";
  const total = typeof progress.total === "number" && progress.total > 0 ? progress.total : 1;
  const pct = progress.loaded <= 1 && total <= 1
    ? progress.loaded * 100
    : (progress.loaded / total) * 100;
  return ` ${Math.max(0, Math.min(100, Math.round(pct)))}%`;
}

function showStatus(status) {
  const state = normalizeStatus(status);
  const availability = state.availability;
  latestAvailability = availability;
  const el = $("status");
  if (availability === "available") {
    el.className = "status ok";
    el.textContent = "온디바이스 모델 사용 가능";
    $("scan").disabled = false;
    $("scan").textContent = "현재 페이지 검사";
  } else if (availability === "downloadable" || availability === "downloading") {
    el.className = "status dl";
    if (state.error) {
      el.textContent = `모델 준비 실패 — ${state.error}`;
      $("scan").disabled = false;
      $("scan").textContent = "모델 준비 재시도";
    } else {
      const phase = state.preparing || availability === "downloading" ? "모델 다운로드/준비 중" : "모델 다운로드 준비 중";
      el.textContent = `${phase}${progressText(state.progress)}…`;
      $("scan").disabled = true;
      $("scan").textContent = "모델 준비 중…";
    }
  } else {
    el.className = "status no";
    el.textContent = "온디바이스 모델 사용 불가 — 확장 비활성";
    $("scan").disabled = true;
    $("scan").textContent = "현재 페이지 검사";
  }
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: "availability" });
  showStatus(status);
  return normalizeStatus(status);
}

function stopStatusPoll() {
  if (statusPoll) clearInterval(statusPoll);
  statusPoll = null;
}

function startStatusPoll() {
  stopStatusPoll();
  statusPoll = setInterval(async () => {
    try {
      const status = await chrome.runtime.sendMessage({ type: "model-status" });
      showStatus(status);
      const state = normalizeStatus(status);
      if (state.availability === "available" || state.availability === "unavailable" || state.error) {
        stopStatusPoll();
      }
    } catch {
      stopStatusPoll();
    }
  }, 700);
}

async function prepareModelIfNeeded(status) {
  const state = normalizeStatus(status);
  if (state.availability !== "downloadable" && state.availability !== "downloading") return state;

  showStatus({ ...state, availability: "downloading", preparing: true });
  startStatusPoll();
  let prepared;
  try {
    prepared = await chrome.runtime.sendMessage({ type: "prepare-model" });
  } finally {
    stopStatusPoll();
  }
  showStatus(prepared);
  return normalizeStatus(prepared);
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
  const status = await refreshStatus();
  prepareModelIfNeeded(status).catch(e => {
    showStatus({ ...status, error: String(e?.message || e) });
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("url").textContent = tab?.url || "";

  $("scan").addEventListener("click", async () => {
    $("scan").disabled = true;
    let stopTicker = null;
    try {
      const status = await refreshStatus();
      const prepared = await prepareModelIfNeeded(status);
      if (prepared.error || prepared.availability !== "available") {
        renderVerdict({ error: prepared.error || "model_unavailable" });
        return;
      }
      stopTicker = startStageTicker();
      const v = await chrome.runtime.sendMessage({ type: "scan", url: tab.url, tabId: tab.id, source: "popup" });
      renderVerdict(v);
    } catch (e) {
      $("result").innerHTML = `<div class="verdict v-warn">오류: ${String(e)}</div>`;
    } finally {
      if (stopTicker) stopTicker();
      const status = await refreshStatus().catch(() => ({ availability: latestAvailability }));
      $("scan").disabled = normalizeStatus(status).availability !== "available";
    }
  });
}
init();
