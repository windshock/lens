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
    el.textContent = t("popup.statusOk");
    $("scan").disabled = false;
    $("scan").textContent = t("popup.btnScan");
  } else if (availability === "downloadable" || availability === "downloading") {
    el.className = "status dl";
    if (state.error) {
      el.textContent = t("popup.statusError", String(state.error));
      $("scan").disabled = false;
      $("scan").textContent = t("popup.btnRetry");
    } else {
      const phase = state.preparing || availability === "downloading" ? t("popup.statusDl") : t("popup.statusDlPrep");
      el.textContent = `${phase}${progressText(state.progress)}…`;
      $("scan").disabled = true;
      $("scan").textContent = t("popup.btnPreparing");
    }
  } else {
    el.className = "status no";
    el.textContent = t("popup.statusUnavailable");
    $("scan").disabled = true;
    $("scan").textContent = t("popup.btnScan");
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

function getStages() {
  return [
    { at: 0,    label: t("popup.stage0") },
    { at: 2500, label: t("popup.stage1") },
    { at: 5000, label: t("popup.stage2") },
    { at: 8000, label: t("popup.stage3") }
  ];
}

function startStageTicker() {
  const STAGES = getStages();
  const result = $("result");
  let i = 0;
  result.innerHTML = `<div class="verdict v-warn" id="stage">${STAGES[0].label}</div>`;
  const stage = document.getElementById("stage");
  const start = Date.now();
  const tt = setInterval(() => {
    const elapsed = Date.now() - start;
    while (i + 1 < STAGES.length && elapsed >= STAGES[i + 1].at) i++;
    stage.textContent = t("popup.stageElapsed", STAGES[i].label, Math.round(elapsed / 1000));
  }, 500);
  return () => clearInterval(tt);
}

function renderVerdict(v) {
  const box = $("result");
  if (!v) { box.innerHTML = ""; return; }
  if (v.error) {
    box.innerHTML = `<div class="verdict v-warn">${t("popup.error", String(v.error))}</div>`;
    return;
  }
  const sev = v.phishing || (v.phishing_score ?? 0) >= 7 ? "danger"
            : (v.phishing_score ?? 0) >= 4 ? "warn" : "ok";
  const label = sev === "danger" ? t("popup.verdictDanger") : sev === "warn" ? t("popup.verdictWarn") : t("popup.verdictOk");
  const score = v.phishing_score ?? 0;
  const reason = (v.reason || "").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
  box.innerHTML = `
    <div class="verdict v-${sev}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${label}</strong>
        <span style="font-size:11px;">${score}/10${v.brand ? " · " + v.brand : ""}</span>
      </div>
      <div class="reason">${reason}</div>
      <div style="margin-top:6px;"><a href="#" id="detail" style="font-size:11px;color:inherit;">${t("popup.detail")}</a></div>
    </div>`;
  const detail = document.getElementById("detail");
  if (detail) detail.addEventListener("click", (e) => {
    e.preventDefault();
    const params = v.url ? `?url=${encodeURIComponent(v.url)}` : "";
    chrome.tabs.create({ url: chrome.runtime.getURL("verdict.html") + params });
  });
}

function refreshLangActive() {
  const lang = (typeof getLang === "function") ? getLang() : "en";
  $("lang-en").classList.toggle("active", lang === "en");
  $("lang-ko").classList.toggle("active", lang === "ko");
}

async function switchLang(lang) {
  await setLang(lang);
  applyI18nDom(document);
  document.title = t("popup.title");
  refreshLangActive();
  // status / scan 버튼 라벨은 동적 — refreshStatus 로 재렌더
  await refreshStatus().catch(() => {});
}

async function init() {
  await initI18n();
  applyI18nDom(document);
  document.title = t("popup.title");
  refreshLangActive();

  $("lang-en").addEventListener("click", () => switchLang("en"));
  $("lang-ko").addEventListener("click", () => switchLang("ko"));

  const status = await refreshStatus();
  prepareModelIfNeeded(status).catch(e => {
    showStatus({ ...status, error: String(e?.message || e) });
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("url").textContent = tab?.url || "";

  $("resetThis").addEventListener("click", async () => {
    if (!tab?.url || !/^https?:/i.test(tab.url)) {
      $("result").innerHTML = `<div class="verdict v-warn">${t("popup.notScannable", tab?.url || "(none)")}</div>`;
      return;
    }
    let host = "";
    try { host = new URL(tab.url).hostname; } catch {}
    const ok = confirm(t("popup.confirmResetThis", host || (getLang() === "ko" ? "현재 페이지" : "current page")));
    if (!ok) return;
    $("resetThis").disabled = true;
    const orig = $("resetThis").textContent;
    $("resetThis").textContent = t("popup.resetting");
    try {
      const r = await chrome.runtime.sendMessage({ type: "resetHistoryForUrl", url: tab.url });
      if (r?.ok) {
        $("result").innerHTML =
          `<div class="verdict v-ok">${t("popup.resetDone", r.host || (getLang() === "ko" ? "(없음)" : "(none)"), r.denyRemoved ?? 0, r.sessionRemoved ?? 0)}</div>`;
      } else {
        $("result").innerHTML = `<div class="verdict v-warn">${t("popup.resetFailed", r?.error || (getLang() === "ko" ? "알 수 없음" : "unknown"))}</div>`;
      }
    } catch (e) {
      $("result").innerHTML = `<div class="verdict v-warn">${t("popup.error", String(e?.message || e))}</div>`;
    } finally {
      $("resetThis").textContent = orig;
      $("resetThis").disabled = false;
    }
  });

  $("reset").addEventListener("click", async () => {
    const ok = confirm(t("popup.confirmResetAll"));
    if (!ok) return;
    $("reset").disabled = true;
    const orig = $("reset").textContent;
    $("reset").textContent = t("popup.resetting");
    try {
      const r = await chrome.runtime.sendMessage({ type: "resetHistory" });
      if (r?.ok) {
        const c = r.cleared || {};
        $("result").innerHTML =
          `<div class="verdict v-ok">${t("popup.resetDoneAll", c.denylistEntries ?? 0, c.allowlistEntries ?? 0)}</div>`;
      } else {
        $("result").innerHTML = `<div class="verdict v-warn">${t("popup.resetFailed", r?.error || (getLang() === "ko" ? "알 수 없음" : "unknown"))}</div>`;
      }
    } catch (e) {
      $("result").innerHTML = `<div class="verdict v-warn">${t("popup.error", String(e?.message || e))}</div>`;
    } finally {
      $("reset").textContent = orig;
      $("reset").disabled = false;
    }
  });

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
      $("result").innerHTML = `<div class="verdict v-warn">${t("popup.error", String(e))}</div>`;
    } finally {
      if (stopTicker) stopTicker();
      const status = await refreshStatus().catch(() => ({ availability: latestAvailability }));
      $("scan").disabled = normalizeStatus(status).availability !== "available";
    }
  });
}
init();
