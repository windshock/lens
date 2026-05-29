(async () => {
  const $ = (id) => document.getElementById(id);
  // 각 체크는 i18n key 와 args 로 저장 — 언어 전환 시 t() 가 재변환하도록.
  const checks = [];
  const nextSteps = [];
  const raw = {};
  let finalVerdict = null; // { status, labelKey, subKey, subArgs }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "title") node.title = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  // 하드코딩 i18n 결과 안의 <code>…</code> 만 안전하게 element 로 파싱.
  // 입력 텍스트는 author-controlled (i18n.js STRINGS 만). innerHTML 미사용.
  function parseInlineCode(text) {
    const parts = [];
    const re = /<code>([^<]*)<\/code>/g;
    let last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) parts.push(text.slice(last, m.index));
      parts.push(el("code", {}, m[1]));
      last = m.index + m[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts.length ? parts : [text];
  }

  function addCheck(nameKey, status, detailKey, ...detailArgs) {
    checks.push({ nameKey, status, detailKey, detailArgs });
  }
  function addNext(key, ...args) {
    nextSteps.push({ key, args });
  }
  function setVerdictData(status, labelKey, subKey, ...subArgs) {
    finalVerdict = { status, labelKey, subKey, subArgs };
  }

  function renderVerdict() {
    const dotClass = { ok: "dot-ok", warn: "dot-warn", bad: "dot-bad", unknown: "dot-unknown", running: "dot-running" };
    const dot = $("verdict").querySelector(".dot");
    if (!finalVerdict) {
      dot.className = "dot dot-running";
      $("verdict-label").textContent = t("compat.verdict.running");
      $("verdict-sub").textContent = t("compat.verdict.sub.running");
      return;
    }
    dot.className = "dot " + dotClass[finalVerdict.status];
    $("verdict-label").textContent = t(finalVerdict.labelKey);
    $("verdict-sub").textContent = t(finalVerdict.subKey, ...finalVerdict.subArgs);
  }

  function renderChecks() {
    const tbody = $("checks");
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const dotClass = { ok: "dot-ok", warn: "dot-warn", bad: "dot-bad", unknown: "dot-unknown" };
    const icon = { ok: "✓", warn: "!", bad: "✗", unknown: "?" };
    for (const c of checks) {
      tbody.appendChild(el("tr", {},
        el("td", {}, el("span", { class: "dot " + dotClass[c.status], title: icon[c.status] })),
        el("td", {}, el("span", { class: "req-name" }, t(c.nameKey))),
        el("td", {}, el("span", { class: "req-detail" }, t(c.detailKey, ...c.detailArgs)))
      ));
    }
  }

  function renderNextSteps() {
    if (nextSteps.length === 0) {
      $("next-steps-card").hidden = true;
      return;
    }
    $("next-steps-card").hidden = false;
    const ul = $("next-steps");
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    for (const s of nextSteps) {
      ul.appendChild(el("li", {}, ...parseInlineCode(t(s.key, ...s.args))));
    }
  }

  function renderRaw() {
    $("raw").textContent = JSON.stringify(raw, null, 2);
  }

  function renderFooter() {
    const footer = $("footer");
    while (footer.firstChild) footer.removeChild(footer.firstChild);
    // t("compat.footer") 는 "{0} · ..." 형태. {0} 자리에 anchor 를 끼우기 위해
    // 텍스트를 둘로 쪼개서 안전하게 element 로 조립한다.
    const tpl = t("compat.footer", "__BRAND__");
    const parts = tpl.split("__BRAND__");
    if (parts[0]) footer.appendChild(document.createTextNode(parts[0]));
    footer.appendChild(el("a", { href: "./" }, "Windshock Lens"));
    if (parts[1]) footer.appendChild(document.createTextNode(parts[1]));
  }

  function renderAll() {
    applyI18nDom(document);
    document.title = t("compat.title");
    renderVerdict();
    renderChecks();
    renderNextSteps();
    renderRaw();
    renderFooter();
  }

  function refreshLangActive() {
    const lang = (typeof getLang === "function") ? getLang() : "en";
    $("lang-en").classList.toggle("active", lang === "en");
    $("lang-ko").classList.toggle("active", lang === "ko");
  }

  async function switchLang(lang) {
    await setLang(lang);
    refreshLangActive();
    renderAll();
  }

  // ── 초기화 ─────────────────────────────────────
  await initI18n();
  refreshLangActive();
  applyI18nDom(document);
  document.title = t("compat.title");
  renderFooter();

  $("lang-en").addEventListener("click", () => switchLang("en"));
  $("lang-ko").addEventListener("click", () => switchLang("ko"));

  // ── 1. API 존재 확인 ─────────────────────────────
  const hasAPI = typeof self.LanguageModel !== "undefined" && typeof self.LanguageModel.availability === "function";
  raw.hasLanguageModelAPI = hasAPI;
  if (hasAPI) {
    addCheck("compat.check.api", "ok", "compat.check.api.ok");
  } else {
    addCheck("compat.check.api", "bad", "compat.check.api.bad");
  }

  // ── 2. UA / OS / Chrome 버전 ─────────────────────
  let uaData = null;
  let chromeMajor = 0;
  let osPlatform = "";
  let osVersion = "";
  let isMobile = null;
  try {
    if (navigator.userAgentData?.getHighEntropyValues) {
      uaData = await navigator.userAgentData.getHighEntropyValues(["fullVersionList", "platform", "platformVersion", "mobile", "architecture"]);
      raw.userAgentData = uaData;
      const chromeEntry = (uaData.fullVersionList || []).find(b => /Chrome|Chromium/i.test(b.brand));
      chromeMajor = chromeEntry ? parseInt(String(chromeEntry.version).split(".")[0], 10) : 0;
      osPlatform = uaData.platform || "";
      osVersion = uaData.platformVersion || "";
      isMobile = !!uaData.mobile;
    }
  } catch (e) {
    raw.userAgentDataError = String(e);
  }
  if (!uaData) {
    raw.userAgent = navigator.userAgent;
    const m = navigator.userAgent.match(/Chrome\/(\d+)/);
    chromeMajor = m ? parseInt(m[1], 10) : 0;
  }

  if (chromeMajor >= 138) {
    addCheck("compat.check.chrome", "ok", "compat.check.chrome.ok", chromeMajor);
  } else if (chromeMajor > 0) {
    addCheck("compat.check.chrome", "bad", "compat.check.chrome.bad", chromeMajor);
    addNext("compat.next.chrome");
  } else {
    addCheck("compat.check.chrome", "unknown", "compat.check.chrome.unknown");
  }

  if (isMobile === true) {
    addCheck("compat.check.mobile", "bad", "compat.check.mobile.bad");
    addNext("compat.next.desktop");
  } else if (osPlatform) {
    const platformOk = /^(Windows|macOS|Linux|Chrome OS)$/i.test(osPlatform);
    const macOk = osPlatform === "macOS" && osVersion && parseInt(osVersion.split(".")[0], 10) >= 13;
    const macFail = osPlatform === "macOS" && osVersion && parseInt(osVersion.split(".")[0], 10) < 13;
    const display = osPlatform + (osVersion ? " " + osVersion : "");
    if (macFail) {
      addCheck("compat.check.os", "bad", "compat.check.os.macFail", osVersion);
      addNext("compat.next.macos");
    } else if (macOk) {
      addCheck("compat.check.os", "ok", "compat.check.os.ok", display);
    } else if (platformOk) {
      addCheck("compat.check.os", "ok", "compat.check.os.ok", display);
    } else {
      addCheck("compat.check.os", "warn", "compat.check.os.warn", osPlatform);
    }
  } else {
    addCheck("compat.check.os", "unknown", "compat.check.os.unknown");
  }

  // ── 3. CPU 코어 ─────────────────────────────────
  const cores = navigator.hardwareConcurrency || 0;
  raw.hardwareConcurrency = cores;
  if (cores >= 4) {
    addCheck("compat.check.cores", "ok", "compat.check.cores.ok", cores);
  } else if (cores > 0) {
    addCheck("compat.check.cores", "bad", "compat.check.cores.bad", cores);
  } else {
    addCheck("compat.check.cores", "unknown", "compat.check.cores.unknown");
  }

  // ── 4. RAM (deviceMemory, 16GB+ 는 8 로 클램프됨) ──
  const mem = navigator.deviceMemory || 0;
  raw.deviceMemory = mem;
  if (mem >= 8) {
    addCheck("compat.check.ram", "ok", "compat.check.ram.ok", mem);
  } else if (mem > 0) {
    addCheck("compat.check.ram", "warn", "compat.check.ram.warn", mem);
  } else {
    addCheck("compat.check.ram", "unknown", "compat.check.ram.unknown");
  }

  // ── 5. Save Data ───────────────────────────────
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  raw.saveData = saveData;
  if (saveData) {
    addCheck("compat.check.saveData", "bad", "compat.check.saveData.bad");
    addNext("compat.next.saveData");
  } else {
    addCheck("compat.check.saveData", "ok", "compat.check.saveData.ok");
  }

  // ── 6. WebGPU adapter (휴리스틱, VRAM 직접 못 봄) ──
  let gpuInfo = null;
  try {
    if (navigator.gpu?.requestAdapter) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        // requestAdapterInfo 는 deprecate, adapter.info 가 신규.
        gpuInfo = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
        raw.gpu = gpuInfo ? { vendor: gpuInfo.vendor, architecture: gpuInfo.architecture, device: gpuInfo.device, description: gpuInfo.description } : null;
      }
    }
  } catch (e) {
    raw.gpuError = String(e);
  }
  if (gpuInfo) {
    const vendor = (gpuInfo.vendor || "").toLowerCase();
    const arch = (gpuInfo.architecture || "").toLowerCase();
    const desc = (gpuInfo.description || "").toLowerCase();
    const summary = vendor + " " + (arch || desc || "(limited info)");
    const looksIntegrated = /intel.*(uhd|iris)|amd.*radeon (vega|graphics)|apple gpu/i.test(`${vendor} ${arch} ${desc}`);
    if (looksIntegrated) {
      addCheck("compat.check.gpu", "warn", "compat.check.gpu.integrated", summary);
    } else {
      addCheck("compat.check.gpu", "unknown", "compat.check.gpu.unknown", summary);
    }
  } else if (navigator.gpu) {
    addCheck("compat.check.gpu", "unknown", "compat.check.gpu.noAdapter");
  } else {
    addCheck("compat.check.gpu", "warn", "compat.check.gpu.unsupported");
  }

  // ── 7. 디스크 (origin quota 만 — 실제 free 공간 아님) ──
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      raw.storageEstimate = { quota: est.quota, usage: est.usage };
      const quotaGB = est.quota / (1024 ** 3);
      if (quotaGB >= 22) {
        addCheck("compat.check.disk", "ok", "compat.check.disk.ok", quotaGB.toFixed(0));
      } else if (quotaGB > 0) {
        addCheck("compat.check.disk", "warn", "compat.check.disk.warn", quotaGB.toFixed(1));
        addNext("compat.next.disk");
      } else {
        addCheck("compat.check.disk", "unknown", "compat.check.disk.unknownEmpty");
      }
    } else {
      addCheck("compat.check.disk", "unknown", "compat.check.disk.unsupported");
    }
  } catch (e) {
    addCheck("compat.check.disk", "unknown", "compat.check.disk.failed", String(e));
  }

  // ── 8. LanguageModel.availability() ─────────────
  let availability = "unavailable";
  if (hasAPI) {
    try {
      availability = await self.LanguageModel.availability();
    } catch (e) {
      raw.availabilityError = String(e);
    }
  }
  raw.availability = availability;

  if (!hasAPI) {
    setVerdictData("bad", "compat.verdict.noApi", "compat.verdict.noApi.sub");
  } else if (availability === "available") {
    setVerdictData("ok", "compat.verdict.available", "compat.verdict.available.sub");
  } else if (availability === "downloading") {
    setVerdictData("warn", "compat.verdict.downloading", "compat.verdict.downloading.sub");
  } else if (availability === "downloadable") {
    setVerdictData("warn", "compat.verdict.downloadable", "compat.verdict.downloadable.sub");
    $("download-controls").hidden = false;
  } else {
    const bads = checks.filter(c => c.status === "bad");
    if (bads.length > 0) {
      const badNames = bads.map(b => t(b.nameKey)).join(", ");
      setVerdictData("bad", "compat.verdict.unavail", "compat.verdict.unavail.sub", badNames);
    } else {
      setVerdictData("bad", "compat.verdict.unclear", "compat.verdict.unclear.sub");
      addNext("compat.next.internals");
      addNext("compat.next.policy");
      addNext("compat.next.diskFree");
      addNext("compat.next.vram");
    }
  }

  renderAll();

  // ── 9. 다운로드 트리거 ──────────────────────────
  $("download-btn").addEventListener("click", async () => {
    const btn = $("download-btn");
    btn.disabled = true;
    btn.textContent = t("compat.downloading");
    $("download-controls").querySelector(".progress").hidden = false;
    const bar = $("download-controls").querySelector(".progress-bar");
    const status = $("download-status");
    try {
      const session = await self.LanguageModel.create({
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            const pct = Math.round((e.loaded / (e.total || 1)) * 100);
            bar.style.width = pct + "%";
            const loaded = (e.loaded / (1024 ** 2)).toFixed(0);
            const total = ((e.total || 0) / (1024 ** 2)).toFixed(0);
            status.textContent = t("compat.downloadProgress", pct, loaded, total);
          });
        }
      });
      status.textContent = t("compat.downloadDone");
      bar.style.width = "100%";
      btn.textContent = t("compat.downloadFinishedBtn");
      btn.disabled = false;
      btn.onclick = () => location.reload();
      try { session.destroy?.(); } catch {}
    } catch (e) {
      status.textContent = t("compat.downloadFailed", String(e?.message || e));
      btn.disabled = false;
      btn.textContent = t("compat.downloadRetry");
    }
  });
})();
