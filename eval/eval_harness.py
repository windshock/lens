#!/usr/bin/env python3
"""eval_harness.py — 코퍼스 CSV를 받아 확장으로 일괄 스캔 → 결과 덤프.

Workflow:
  1) manifest.json version 자동 bump (V8 bytecode 캐시 우회)
  2) 메인 테스트 Chrome(:9222)이 띄워져 있는지 확인. 없으면 띄움.
  3) chrome.developerPrivate.reload(extId) 로 확장 재컴파일.
  4) 모델 availability 확인.
  5) phish.csv + benign.csv 의 모든 URL을 chrome.runtime.sendMessage(scan, bypassCache:true)로 순차 검사.
  6) verdict + behaviors 풀 덤프를 runs/<ts>.csv 로 저장.

Usage:
  python3 eval/eval_harness.py
  python3 eval/eval_harness.py --in eval/corpus/phish.csv eval/corpus/benign.csv
  python3 eval/eval_harness.py --max 20   # 빠른 테스트용
"""
import argparse, asyncio, csv, json, pathlib, subprocess, sys, time, urllib.request, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent
PROJ = ROOT.parent
MANIFEST = PROJ / "manifest.json"
EXT_ID = "lilblbkbdooanobbkoceejgonofclkng"
CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE = "/tmp/phisinggpt-chrome-dev"
CDP_PORT = 9222

# ───────────────────────── 유틸 ─────────────────────────

def bump_manifest_version():
    mf = json.loads(MANIFEST.read_text())
    parts = mf["version"].split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    mf["version"] = ".".join(parts)
    MANIFEST.write_text(json.dumps(mf, indent=2, ensure_ascii=False))
    print(f"  manifest version → {mf['version']}")
    return mf["version"]

def ensure_chrome():
    try:
        urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json/version", timeout=2)
        return None  # already running
    except Exception:
        pass
    print("  starting Chrome…")
    proc = subprocess.Popen([
        CHROME_BIN,
        f"--user-data-dir={PROFILE}",
        f"--remote-debugging-port={CDP_PORT}",
        "--no-first-run", "--no-default-browser-check",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        try:
            urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json/version", timeout=1)
            return proc
        except Exception: pass
        time.sleep(0.3)
    raise RuntimeError("Chrome failed to start")

def read_corpus(files):
    rows = []
    for fp in files:
        with open(fp) as f:
            for r in csv.DictReader(f):
                # alive=False / chrome_blocks=True 인 항목 제외
                if (r.get("alive","").lower() == "false"): continue
                if (r.get("chrome_blocks","").lower() == "true"): continue
                rows.append({"url": r["url"], "label": r["label"]})
    return rows

# ───────────────────────── CDP 헬퍼 ─────────────────────────

async def open_popup_tab():
    new_url = f"chrome-extension://{EXT_ID}/popup.html"
    encoded = urllib.parse.quote(new_url, safe="")
    req = urllib.request.Request(f"http://localhost:{CDP_PORT}/json/new?{encoded}", method="PUT")
    return json.loads(urllib.request.urlopen(req).read())

class Session:
    def __init__(self, ws):
        self.ws = ws; self.mid = 0
    async def call(self, method, params=None):
        self.mid += 1; cid = self.mid
        await self.ws.send(json.dumps({"id": cid, "method": method, "params": params or {}}))
        while True:
            r = json.loads(await self.ws.recv())
            if r.get("id") == cid: return r
    async def js(self, expr, timeout=180):
        self.mid += 1; cid = self.mid
        await self.ws.send(json.dumps({
            "id": cid, "method": "Runtime.evaluate",
            "params": {"expression": expr, "awaitPromise": True, "returnByValue": True, "userGesture": True}
        }))
        t0 = time.time()
        while time.time() - t0 < timeout:
            r = json.loads(await self.ws.recv())
            if r.get("id") == cid:
                res = r["result"]["result"]
                if res.get("subtype") == "error":
                    return {"__error__": res.get("description","")[:600]}
                return res.get("value")
        return {"__error__": f"timeout {timeout}s"}

async def reload_extension():
    """developerPrivate.reload로 확장 재컴파일."""
    import websockets
    req = urllib.request.Request(
        f"http://localhost:{CDP_PORT}/json/new?" + urllib.parse.quote("chrome://extensions/", safe=""),
        method="PUT")
    page = json.loads(urllib.request.urlopen(req).read())
    await asyncio.sleep(1.5)
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
        s = Session(ws)
        await s.call("Runtime.enable")
        await s.js(f"new Promise(r=>chrome.developerPrivate.reload({json.dumps(EXT_ID)},{{failQuietly:false}},r))")
    await asyncio.sleep(3)

# ───────────────────────── 실행 ─────────────────────────

async def run_diagnostics(s):
    """diagnostics 메시지로 모델/OCR 상태 확인."""
    diag = await s.js("chrome.runtime.sendMessage({type:'diagnostics'})", timeout=30)
    print(f"  diagnostics: {json.dumps(diag, ensure_ascii=False) if isinstance(diag, dict) else diag}")
    return diag

async def run_fixture_validation(s, manifest_path):
    """fixture manifest 기반 pass/fail 검증."""
    fixtures = json.loads(pathlib.Path(manifest_path).read_text())
    results = []
    for fx in fixtures:
        url = fx["url"]
        expected_phish = fx["expectedPhishing"]
        min_score = fx.get("minScore")
        max_score = fx.get("maxScore")
        msg = {"type": "scan", "url": url, "source": "fixture", "bypassCache": True}
        t0 = time.time()
        v = await s.js(f"chrome.runtime.sendMessage({json.dumps(msg)})", timeout=120)
        dt = time.time() - t0
        ok = isinstance(v, dict) and not v.get("__error__") and not v.get("error")
        pred_phish = bool(v.get("phishing")) if ok else None
        score = v.get("phishing_score") if ok else None
        passed = False
        if ok:
            passed = (pred_phish == expected_phish)
            if min_score is not None and (score is None or score < min_score):
                passed = False
            if max_score is not None and (score is None or score > max_score):
                passed = False
        results.append({
            "name": fx["name"], "url": url, "expectedPhishing": expected_phish,
            "predictedPhishing": pred_phish, "score": score,
            "passed": passed, "elapsed_s": round(dt, 1),
            "error": v.get("__error__", "")[:200] if isinstance(v, dict) else str(v)[:200]
        })
        tag = "PASS" if passed else "FAIL"
        print(f"  [{tag}] {fx['name']:30s} phish={pred_phish} score={score} ({dt:.1f}s)")
    return results

async def run(corpus_rows, out_path, sys_hash, version):
    import websockets
    page = await open_popup_tab()
    await asyncio.sleep(1.5)
    print(f"  popup opened")
    results = []
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
        s = Session(ws)
        await s.call("Runtime.enable")
        avail = await s.js("LanguageModel.availability()")
        print(f"  availability = {avail!r}")
        if avail != "available":
            raise RuntimeError(f"model not available: {avail}")

        for i, row in enumerate(corpus_rows, 1):
            url = row["url"]; gt = row["label"]
            t0 = time.time()
            msg = {"type": "scan", "url": url, "source": "eval", "bypassCache": True}
            v = await s.js(f"chrome.runtime.sendMessage({json.dumps(msg)})", timeout=120)
            dt = time.time() - t0
            ok = isinstance(v, dict) and not v.get("__error__") and not v.get("error")
            pred = bool(v.get("phishing")) if ok else None
            score = v.get("phishing_score") if ok else None
            brand = v.get("brand") if ok else None
            sus = v.get("suspicious_domain") if ok else None
            reason = (v.get("reason") if ok else (v.get("raw") if isinstance(v,dict) else str(v))) or ""
            err = ""
            if isinstance(v, dict):
                if v.get("__error__"): err = v["__error__"][:200]
                elif v.get("error"): err = f"{v.get('error')}|{(v.get('message','') or v.get('raw',''))[:200]}"
            results.append({
                "url": url, "label": gt, "predicted_phishing": pred,
                "phishing_score": score, "brand": brand, "suspicious_domain": sus,
                "reason": reason[:600], "elapsed_s": round(dt,1), "error": err
            })
            tag = "OK " if ok else "ERR"
            verdict_tag = "PHISH" if pred else ("BEN" if pred is False else "??")
            print(f"  [{i:3d}/{len(corpus_rows)}] {tag} {verdict_tag:5s} {score if score is not None else '-':>3} {dt:5.1f}s  {gt:6s}  {url[:80]}")

    # write CSV
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["url","label","predicted_phishing","phishing_score","brand","suspicious_domain","reason","elapsed_s","error"])
        w.writeheader(); w.writerows(results)
    print(f"\nwrote {out_path}")
    # also write a small run meta
    meta = {"ts": int(time.time()), "version": version, "sys_hash": sys_hash, "n": len(results)}
    out_path.with_suffix(".meta.json").write_text(json.dumps(meta, indent=2))

async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="inputs", nargs="+",
                   default=[str(ROOT/"corpus"/"phish.csv"), str(ROOT/"corpus"/"benign.csv")])
    p.add_argument("--out", default=None)
    p.add_argument("--max", type=int, default=None, help="앞에서 N개만(빠른 테스트)")
    p.add_argument("--no-bump", action="store_true", help="version bump 스킵")
    p.add_argument("--no-reload", action="store_true", help="extension reload 스킵")
    p.add_argument("--fixture", action="store_true", help="fixture manifest 기반 pass/fail 검증 실행")
    p.add_argument("--diagnostics", action="store_true", help="diagnostics 메시지로 모델/OCR 상태 확인")
    args = p.parse_args()

    print("=== eval harness ===")
    if not args.no_bump:
        version = bump_manifest_version()
    else:
        version = json.loads(MANIFEST.read_text())["version"]

    # SYS prompt hash for run identification
    bg = (PROJ / "background.js").read_text()
    import hashlib
    sys_hash = hashlib.sha1(bg.encode()).hexdigest()[:10]
    print(f"  sys_hash = {sys_hash}")

    proc = ensure_chrome()
    if proc: print("  Chrome started"); await asyncio.sleep(1)

    if not args.no_reload:
        print("\n=== reload extension ===")
        await reload_extension()

    # fixture/diagnostics 모드는 popup tab 하나로 충분
    if args.fixture or args.diagnostics:
        import websockets
        page = await open_popup_tab()
        await asyncio.sleep(1.5)
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
            s = Session(ws)
            await s.call("Runtime.enable")
            if args.diagnostics:
                print("\n=== diagnostics ===")
                diag = await run_diagnostics(s)
                if not isinstance(diag, dict) or diag.get("modelAvailability") != "available":
                    print("  ⚠ model not available!")
            if args.fixture:
                manifest_path = ROOT / "fixture_manifest.json"
                print(f"\n=== fixture validation ({manifest_path}) ===")
                fx_results = await run_fixture_validation(s, str(manifest_path))
                fx_out = ROOT / "runs" / f"{time.strftime('%Y%m%d-%H%M%S')}_fixture.json"
                fx_out.parent.mkdir(parents=True, exist_ok=True)
                fx_out.write_text(json.dumps(fx_results, indent=2, ensure_ascii=False))
                n_pass = sum(1 for r in fx_results if r["passed"])
                n_fail = len(fx_results) - n_pass
                print(f"\n  fixture: {n_pass}/{len(fx_results)} passed, {n_fail} failed → {fx_out}")
        return

    rows = read_corpus(args.inputs)
    if args.max: rows = rows[:args.max]
    print(f"\n=== run {len(rows)} URLs ===")

    out = pathlib.Path(args.out) if args.out else (ROOT/"runs"/f"{time.strftime('%Y%m%d-%H%M%S')}_{sys_hash}.csv")
    await run(rows, out, sys_hash, version)

if __name__ == "__main__":
    asyncio.run(main())
