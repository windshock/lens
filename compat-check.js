(async () => {
  const $ = (id) => document.getElementById(id);
  const checks = [];
  const nextSteps = [];
  const raw = {};

  function addCheck(name, status, detail) {
    // status: "ok" | "warn" | "bad" | "unknown"
    checks.push({ name, status, detail });
  }

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

  // 하드코딩 텍스트 안의 <code>…</code> 만 안전하게 element 로 파싱. innerHTML 미사용.
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

  function renderChecks() {
    const tbody = $("checks");
    while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
    const dotClass = { ok: "dot-ok", warn: "dot-warn", bad: "dot-bad", unknown: "dot-unknown" };
    const icon = { ok: "✓", warn: "!", bad: "✗", unknown: "?" };
    for (const c of checks) {
      tbody.appendChild(el("tr", {},
        el("td", {}, el("span", { class: "dot " + dotClass[c.status], title: icon[c.status] })),
        el("td", {}, el("span", { class: "req-name" }, c.name)),
        el("td", {}, el("span", { class: "req-detail" }, c.detail))
      ));
    }
  }

  function renderNextSteps() {
    if (nextSteps.length === 0) return;
    $("next-steps-card").hidden = false;
    const ul = $("next-steps");
    while (ul.firstChild) ul.removeChild(ul.firstChild);
    for (const s of nextSteps) {
      ul.appendChild(el("li", {}, ...parseInlineCode(s)));
    }
  }

  function renderRaw() {
    $("raw").textContent = JSON.stringify(raw, null, 2);
  }

  function setVerdict(status, label, sub) {
    const dot = $("verdict").querySelector(".dot");
    dot.className = "dot " + ({ ok: "dot-ok", warn: "dot-warn", bad: "dot-bad", unknown: "dot-unknown", running: "dot-running" }[status]);
    $("verdict-label").textContent = label;
    $("verdict-sub").textContent = sub;
  }

  // ── 1. API 존재 확인 ─────────────────────────────
  const hasAPI = typeof self.LanguageModel !== "undefined" && typeof self.LanguageModel.availability === "function";
  raw.hasLanguageModelAPI = hasAPI;
  if (hasAPI) {
    addCheck("LanguageModel API", "ok", "self.LanguageModel.availability() 호출 가능.");
  } else {
    addCheck("LanguageModel API", "bad", "self.LanguageModel 이 정의되지 않음 — Chrome 138+ 가 아니거나 플래그가 꺼져 있을 수 있음.");
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
    addCheck("Chrome 138+", "ok", `현재 버전: ${chromeMajor}`);
  } else if (chromeMajor > 0) {
    addCheck("Chrome 138+", "bad", `현재 버전: ${chromeMajor} — Chrome 138 이상으로 업데이트 필요.`);
    nextSteps.push('Chrome 을 최신 stable 로 업데이트하세요: <code>chrome://settings/help</code>');
  } else {
    addCheck("Chrome 138+", "unknown", "Chrome 버전을 식별할 수 없음. 다른 브라우저(Edge/Brave 등)일 수 있습니다.");
  }

  if (isMobile === true) {
    addCheck("데스크톱 OS", "bad", "모바일 기기로 식별됨 — 모바일 Chrome 은 Built-in AI 비지원.");
    nextSteps.push("Windows / macOS / Linux 데스크톱 또는 Chromebook Plus 에서 실행하세요.");
  } else if (osPlatform) {
    const platformOk = /^(Windows|macOS|Linux|Chrome OS)$/i.test(osPlatform);
    const macOk = osPlatform === "macOS" && osVersion && parseInt(osVersion.split(".")[0], 10) >= 13;
    const macFail = osPlatform === "macOS" && osVersion && parseInt(osVersion.split(".")[0], 10) < 13;
    if (macFail) {
      addCheck("OS 요건", "bad", `macOS ${osVersion} — macOS 13 (Ventura) 이상이 필요합니다.`);
      nextSteps.push("macOS 를 13 (Ventura) 이상으로 업그레이드하세요.");
    } else if (macOk) {
      addCheck("OS 요건", "ok", `${osPlatform} ${osVersion}`);
    } else if (platformOk) {
      addCheck("OS 요건", "ok", `${osPlatform}${osVersion ? " " + osVersion : ""}`);
    } else {
      addCheck("OS 요건", "warn", `${osPlatform} — 지원 OS 목록(Win/macOS/Linux/ChromeOS) 확인 필요.`);
    }
  } else {
    addCheck("OS 요건", "unknown", "OS 정보를 읽을 수 없음.");
  }

  // ── 3. CPU 코어 ─────────────────────────────────
  const cores = navigator.hardwareConcurrency || 0;
  raw.hardwareConcurrency = cores;
  if (cores >= 4) {
    addCheck("CPU 코어 ≥ 4", "ok", `${cores} 코어`);
  } else if (cores > 0) {
    addCheck("CPU 코어 ≥ 4", "bad", `${cores} 코어 — CPU 모드는 4코어 이상 필요.`);
  } else {
    addCheck("CPU 코어 ≥ 4", "unknown", "코어 수를 읽을 수 없음.");
  }

  // ── 4. RAM (deviceMemory, 16GB+ 는 8 로 클램프됨) ──
  const mem = navigator.deviceMemory || 0;
  raw.deviceMemory = mem;
  if (mem >= 8) {
    addCheck("RAM (대략)", "ok", `${mem}GB 이상 (deviceMemory API 는 16GB+ 도 8 로 보고 — privacy clamp).`);
  } else if (mem > 0) {
    addCheck("RAM (대략)", "warn", `${mem}GB 보고됨 — CPU 모드는 16GB 권장. GPU 모드면 무관.`);
  } else {
    addCheck("RAM (대략)", "unknown", "deviceMemory 미보고.");
  }

  // ── 5. Save Data ───────────────────────────────
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  raw.saveData = saveData;
  if (saveData) {
    addCheck("Save Data 비활성", "bad", "Save Data 가 켜져 있음 — 대용량 모델 다운로드 차단.");
    nextSteps.push("Chrome 설정 → 성능 → Data Saver 를 끄거나, 네트워크 설정에서 비종량제로 분류하세요.");
  } else {
    addCheck("Save Data 비활성", "ok", "Save Data 꺼짐.");
  }

  // ── 6. WebGPU adapter (휴리스틱, VRAM 직접 못 봄) ──
  let gpuInfo = null;
  try {
    if (navigator.gpu?.requestAdapter) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        // requestAdapterInfo 가 deprecate 되었고 adapter.info 가 신규.
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
    // 통합 GPU 키워드 — VRAM 4GB 미달 가능성 높음
    const looksIntegrated = /intel.*(uhd|iris)|amd.*radeon (vega|graphics)|apple gpu/i.test(`${vendor} ${arch} ${desc}`);
    if (looksIntegrated) {
      addCheck("GPU VRAM > 4GB (추정)", "warn", `통합 GPU 로 추정 (${vendor} ${arch || desc}) — VRAM 4GB 미달 가능. 실제 사양은 OS 도구로 확인 필요.`);
    } else {
      addCheck("GPU VRAM > 4GB (추정)", "unknown", `WebGPU 어댑터: ${vendor} ${arch || desc || "(정보 제한)"} — VRAM 은 직접 노출되지 않음.`);
    }
  } else if (navigator.gpu) {
    addCheck("GPU VRAM > 4GB (추정)", "unknown", "WebGPU 어댑터를 얻을 수 없음.");
  } else {
    addCheck("GPU VRAM > 4GB (추정)", "warn", "WebGPU 미지원 — GPU 모드 사용 불가, CPU 모드 (16GB RAM + 4코어) 필요.");
  }

  // ── 7. 디스크 (origin quota 만 — 실제 free 공간 아님) ──
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      raw.storageEstimate = { quota: est.quota, usage: est.usage };
      const quotaGB = est.quota / (1024 ** 3);
      if (quotaGB >= 22) {
        addCheck("디스크 22GB+ (간접)", "ok", `브라우저 quota: ${quotaGB.toFixed(0)}GB — 실제 디스크 free 공간은 OS 도구로 확인 필요.`);
      } else if (quotaGB > 0) {
        addCheck("디스크 22GB+ (간접)", "warn", `브라우저 quota: ${quotaGB.toFixed(1)}GB — 22GB 미달. 디스크가 거의 차있을 가능성.`);
        nextSteps.push("디스크 여유 공간 22GB+ 가 필요합니다. Chrome 프로필이 있는 볼륨 기준으로 확인하세요.");
      } else {
        addCheck("디스크 22GB+ (간접)", "unknown", "quota 정보 미보고.");
      }
    } else {
      addCheck("디스크 22GB+ (간접)", "unknown", "navigator.storage.estimate 미지원.");
    }
  } catch (e) {
    addCheck("디스크 22GB+ (간접)", "unknown", "추정 실패: " + String(e));
  }

  renderChecks();

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
    setVerdict("bad", "API 미지원", "이 브라우저에는 LanguageModel API 가 없습니다. Chrome 138+ stable 로 업데이트하세요.");
  } else if (availability === "available") {
    setVerdict("ok", "사용 가능", "Gemini Nano 가 이 PC 에 설치되어 있고 즉시 사용 가능합니다.");
  } else if (availability === "downloading") {
    setVerdict("warn", "다운로드 중", "Chrome 이 백그라운드에서 모델을 받고 있습니다. 1~2GB, 수십분 걸릴 수 있어요. chrome://on-device-internals 에서 진행률 확인.");
  } else if (availability === "downloadable") {
    setVerdict("warn", "조건 충족 — 다운로드 필요", "하드웨어 조건은 만족합니다. 아래 버튼으로 다운로드를 시작할 수 있습니다.");
    $("download-controls").hidden = false;
  } else {
    // unavailable
    const bads = checks.filter(c => c.status === "bad");
    if (bads.length > 0) {
      setVerdict("bad", "사용 불가", `다음 요건이 미달입니다: ${bads.map(b => b.name).join(", ")}.`);
    } else {
      setVerdict("bad", "사용 불가 — 원인 불명확", "탐지 가능한 HW/SW 요건은 통과했습니다. 아래 '다음 단계' 의 비공개 원인(엔터프라이즈 정책 / 디스크 free / VRAM 등)을 확인하세요.");
      nextSteps.push('Chrome 의 정확한 모델 상태: <code>chrome://on-device-internals</code> (last download error 까지 표시)');
      nextSteps.push('엔터프라이즈 정책 차단 여부: <code>chrome://policy</code> 에서 <code>GenAILocalFoundationalModelSettings</code> 또는 <code>OptimizationGuideOnDeviceModelEnabled</code> 확인');
      nextSteps.push("실제 디스크 free 공간 22GB+ 확인 (Finder 정보 / 작업 관리자 / df -h).");
      nextSteps.push("GPU VRAM 4GB+ 확인 (Windows: 작업 관리자 → 성능 → GPU / macOS: 활성 상태 보기 / chrome://gpu).");
    }
  }

  renderNextSteps();
  renderRaw();

  // ── 9. 다운로드 트리거 ──────────────────────────
  $("download-btn").addEventListener("click", async () => {
    const btn = $("download-btn");
    btn.disabled = true;
    btn.textContent = "다운로드 시작 중…";
    $("download-controls").querySelector(".progress").hidden = false;
    const bar = $("download-controls").querySelector(".progress-bar");
    const status = $("download-status");
    try {
      const session = await self.LanguageModel.create({
        monitor(m) {
          m.addEventListener("downloadprogress", (e) => {
            const pct = Math.round((e.loaded / (e.total || 1)) * 100);
            bar.style.width = pct + "%";
            status.textContent = `${pct}% (${(e.loaded / (1024 ** 2)).toFixed(0)} / ${((e.total || 0) / (1024 ** 2)).toFixed(0)} MB)`;
          });
        }
      });
      status.textContent = "다운로드 완료. 세션 생성 성공.";
      bar.style.width = "100%";
      btn.textContent = "완료 — 페이지 새로고침";
      btn.disabled = false;
      btn.onclick = () => location.reload();
      try { session.destroy?.(); } catch {}
    } catch (e) {
      status.textContent = "다운로드 실패: " + String(e?.message || e);
      btn.disabled = false;
      btn.textContent = "재시도";
    }
  });
})();
