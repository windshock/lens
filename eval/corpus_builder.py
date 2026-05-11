#!/usr/bin/env python3
"""corpus_builder.py — 평가용 코퍼스 생성.

Phishing.Database ACTIVE → 500개 무작위 → HEAD alive 체크 → 별도 Chrome으로
Safe Browsing interstitial 체크 → chrome-miss 통과한 N개를 phish.csv 로.

Tranco top-1m → N개 무작위 → HEAD alive → benign.csv.

격리된 Chrome 프로필 사용(/tmp/phisinggpt-corpus-check). 확장 안 띄움 —
오직 기본 Safe Browsing만 활성된 상태에서 interstitial 발생 여부만 본다.

Usage:
    python3 eval/corpus_builder.py --target 100
"""
import argparse, asyncio, csv, json, pathlib, random, sys, time, urllib.request, urllib.parse, socket, ssl

ROOT = pathlib.Path(__file__).resolve().parent
CORPUS = ROOT / "corpus"
CORPUS.mkdir(exist_ok=True)

PHISH_SRC = "https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-links-ACTIVE.txt"
TRANCO_SRC = "https://tranco-list.eu/top-1m.csv.zip"

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE = "/tmp/phisinggpt-corpus-check"
CDP_PORT = 9333  # 메인 테스트 Chrome(9222)과 분리

# ───────────────────────── 소스 수집 ─────────────────────────

def fetch_phishing_db(cache: pathlib.Path):
    if cache.exists() and cache.stat().st_mtime > time.time() - 12 * 3600:
        return cache.read_text().splitlines()
    print(f"  fetching {PHISH_SRC} …")
    raw = urllib.request.urlopen(PHISH_SRC, timeout=60).read().decode("utf-8", errors="replace")
    cache.write_text(raw)
    return raw.splitlines()

TWO_LEVEL_TLD = {"co.kr","or.kr","go.kr","ne.kr","co.jp","co.uk","com.au","co.nz","ac.uk","gov.uk","co.za","com.br","com.mx","co.in"}

# stale 판정: takedown / parking / default page / 빈 페이지.
# 한 번이라도 매치되면 corpus에서 제외.
import re as _re
_STALE_TITLE_RE = _re.compile(
    r"(web server'?s? default page|account suspended|404 not found|page not found|"
    r"site\s+not\s+found|coming soon|domain (parked|for sale|expired)|"
    r"this site can'?t be reached|index of /|under construction|"
    r"이 페이지를 찾을 수 없|お探しのページは見つかりませんでした|"
    r"^error$|^index$|^test$|^untitled$)", _re.IGNORECASE)
_STALE_BODY_RE = _re.compile(
    r"(there'?s? nothing here|url (not\s+(requested|found)|no\s+ha\s+sido\s+solicitada|has\s+not\s+been\s+requested|"
    r"você\s+está\s+tentando\s+acessar)|"
    r"web\s+disponible|domain (parked|for sale|expired)|default web page|"
    r"this domain (name )?is for sale|page (could not be|cannot be) found|"
    r"the requested URL was not found|nothing to see here|"
    r"이 사이트는 임시\s*점검|sitio web no encontrado|"
    r"hosting account is currently inactive|account has been suspended)",
    _re.IGNORECASE)

def is_stale_page(title: str, body: str, n_form: int, n_img: int) -> bool:
    """피싱이었지만 takedown 된 페이지로 보이는지."""
    t = (title or "").strip()
    b = (body or "").strip()
    # 1) 명확한 stale 제목
    if t and _STALE_TITLE_RE.search(t): return True
    # 2) 명확한 stale 본문 키워드
    if b and _STALE_BODY_RE.search(b): return True
    # 3) 내용 거의 없음 + 폼/이미지도 없음 → 콘텐츠 사라진 빈 페이지
    if len(b) < 80 and n_form == 0 and n_img <= 1: return True
    # 4) 본문이 단지 'mfdt' 같이 의미 없는 짧은 문자열 (blogspot 빈 글 같은)
    if len(b) < 30 and len(t) < 20 and n_form == 0: return True
    return False

def registered_domain(host: str) -> str:
    """Apex(등록 도메인) 추출. co.kr/co.uk 등 2-level TLD 일부 처리."""
    if not host: return ""
    parts = host.lower().split(".")
    if len(parts) <= 2: return host.lower()
    if ".".join(parts[-2:]) in TWO_LEVEL_TLD and len(parts) >= 3:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])

def build_tranco_apex_whitelist(tranco_rows, top_n=10000):
    """Tranco top N의 apex 도메인 집합. Phishing.Database 노이즈 필터링용."""
    s = set()
    for line in tranco_rows[:top_n]:
        parts = line.strip().split(",")
        if len(parts) >= 2:
            s.add(registered_domain(parts[1].strip()))
    return s

def fetch_tranco(cache: pathlib.Path):
    if cache.exists() and cache.stat().st_mtime > time.time() - 7 * 24 * 3600:
        return cache.read_text().splitlines()
    print(f"  fetching {TRANCO_SRC} …")
    import io, zipfile
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(TRANCO_SRC, timeout=120).read()))
    name = z.namelist()[0]
    raw = z.read(name).decode("utf-8", errors="replace")
    cache.write_text(raw)
    return raw.splitlines()

# ───────────────────────── 1차 필터: HEAD alive ─────────────────────────

def head_alive(url, timeout=4.0):
    try:
        req = urllib.request.Request(url, method="HEAD",
            headers={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"})
        ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            return 200 <= r.status < 400
    except urllib.error.HTTPError as e:
        # 405 (HEAD 불허) 같은 경우 GET 시도
        if e.code in (405, 403):
            try:
                req = urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0"})
                ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
                with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                    return True
            except Exception: return False
        return False
    except (urllib.error.URLError, socket.timeout, ConnectionError, ValueError, OSError):
        return False

# ───────────────────────── 2차 필터: Chrome interstitial ─────────────────────────

async def launch_chrome():
    import subprocess
    # 깔끔한 프로필
    import shutil; shutil.rmtree(PROFILE, ignore_errors=True)
    pathlib.Path(PROFILE).mkdir(exist_ok=True)
    proc = subprocess.Popen([
        CHROME_BIN,
        f"--user-data-dir={PROFILE}",
        f"--remote-debugging-port={CDP_PORT}",
        "--no-first-run", "--no-default-browser-check",
        # Safe Browsing은 기본 활성. headless면 일부 동작 다를 수 있어 GUI로 둠.
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    # 디버그 포트 대기
    for _ in range(40):
        try:
            urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json/version", timeout=1)
            return proc
        except Exception: pass
        await asyncio.sleep(0.3)
    raise RuntimeError("Chrome failed to start")

async def kill_chrome(proc):
    try: proc.terminate(); proc.wait(timeout=5)
    except Exception:
        try: proc.kill()
        except Exception: pass

async def check_interstitial(url, hard_timeout=10.0):
    """url을 새 탭에서 열고 Safe Browsing interstitial 여부 반환. 새 ws 매 호출 시 새로 만든다(이전 ws 누수 회피).
    전체 함수에 hard wall-clock cap. Returns: 'blocks' | 'misses' | 'error'"""
    import websockets
    page_id = None
    async def close_tab():
        if page_id:
            try: urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json/close/{page_id}", timeout=3).read()
            except Exception: pass

    async def _inner():
        nonlocal page_id
        # 1) PUT /json/new — 새 탭 생성
        try:
            req = urllib.request.Request(
                f"http://localhost:{CDP_PORT}/json/new?" + urllib.parse.quote(url, safe=""),
                method="PUT")
            page = json.loads(urllib.request.urlopen(req, timeout=4).read())
        except Exception as e:
            return ("error", f"new:{str(e)[:60]}")
        page_id_local = page["id"]; page_ws = page["webSocketDebuggerUrl"]
        # outer scope에 노출(close_tab에서 사용)
        nonlocal_holder["page_id"] = page_id_local

        # 2) 페이지 ws 연결 — open_timeout으로 짧게
        try:
            pws = await asyncio.wait_for(websockets.connect(page_ws, max_size=None, open_timeout=3), timeout=4)
        except Exception as e:
            return ("error", f"ws-connect:{str(e)[:60]}")

        try:
            async with pws:
                pmid=[0]
                async def pcall(m,p=None):
                    pmid[0]+=1; cid=pmid[0]
                    await pws.send(json.dumps({"id":cid,"method":m,"params":p or {}}))
                    while True:
                        r=json.loads(await pws.recv())
                        if r.get("id")==cid: return r
                # Runtime만으로 충분
                await asyncio.wait_for(pcall("Runtime.enable"), timeout=2)
                # 페이지 안정 대기 — 그래도 hard timeout에 cap됨
                await asyncio.sleep(2.0)
                r = await asyncio.wait_for(pcall("Runtime.evaluate", {
                    "expression": "JSON.stringify({"
                      "u: location.href,"
                      "t: (document.title||'').slice(0,120),"
                      "i: !!document.querySelector('.interstitial-wrapper, #main-frame-error, security-interstitial-app, body.interstitial')"
                      "|| /deceptive site|dangerous|phishing|misleading|safe browsing|보안 위험/i.test((document.body && document.body.innerText || '').slice(0,500)),"
                      "e: /^chrome(-error)?:/.test(location.href),"
                      "b: (document.body && document.body.innerText || '').replace(/\\s+/g,' ').slice(0,500),"
                      "nForm: document.querySelectorAll('form, input, button').length,"
                      "nImg: document.querySelectorAll('img').length"
                      "})",
                    "returnByValue": True
                }), timeout=3)
                res = r.get("result",{}).get("result",{})
                if res.get("subtype") == "error":
                    return ("error", res.get("description","")[:80])
                data = json.loads(res.get("value","{}") or "{}")
                if data.get("i") or data.get("e"):
                    return ("blocks", data.get("t",""))
                if is_stale_page(data.get("t",""), data.get("b",""), data.get("nForm",0), data.get("nImg",0)):
                    return ("stale", data.get("t","")[:80] or data.get("b","")[:80])
                return ("misses", data.get("t",""))
        except asyncio.TimeoutError:
            return ("error", "inner-timeout")
        except (websockets.ConnectionClosedError, ConnectionResetError) as e:
            return ("error", f"ws:{str(e)[:60]}")

    nonlocal_holder = {"page_id": None}
    try:
        result = await asyncio.wait_for(_inner(), timeout=hard_timeout)
        page_id = nonlocal_holder["page_id"]
        return result
    except asyncio.TimeoutError:
        page_id = nonlocal_holder["page_id"]
        return ("error", f"hard-timeout-{hard_timeout}s")
    finally:
        await close_tab()

async def build_phish(target: int, raw_pool: list):
    """raw_pool에서 1차(alive)+2차(chrome-misses) 통과한 URL을 target개 모은다."""
    proc = await launch_chrome()
    print(f"  Chrome corpus-check launched, port {CDP_PORT}", flush=True)
    rows = []
    stats = {"raw":0, "alive":0, "blocks":0, "misses":0, "stale":0, "error":0}
    try:
        i = 0
        while len(rows) < target and i < len(raw_pool):
            url = raw_pool[i].strip(); i += 1
            if not url or not url.startswith(("http://","https://")): continue
            stats["raw"] += 1
            if not head_alive(url):
                continue
            stats["alive"] += 1
            verdict, detail = await check_interstitial(url, hard_timeout=10.0)
            stats[verdict] = stats.get(verdict,0) + 1
            if verdict == "misses":
                rows.append({"url": url, "label": "phish", "chrome_blocks": False, "alive": True, "note": detail})
                print(f"  [{len(rows):3d}/{target}] miss  raw={stats['raw']:4d} alive={stats['alive']} blk={stats['blocks']} stale={stats['stale']} err={stats.get('error',0)}  {url[:90]}", flush=True)
            elif verdict == "stale":
                if stats["stale"] % 20 == 0:
                    print(f"        ... stale={stats['stale']}  blocks={stats['blocks']}  misses={stats['misses']}", flush=True)
            elif verdict == "blocks":
                if stats["blocks"] % 25 == 0:
                    print(f"        ... blocks={stats['blocks']}  misses={stats['misses']}  stale={stats['stale']}", flush=True)
            await asyncio.sleep(0.1)
    finally:
        await kill_chrome(proc)
    print(f"\n  stats: {stats}", flush=True)
    return rows

def build_benign(target: int, tranco_rows: list):
    """Tranco top-1m에서 무작위 샘플 → HEAD alive 통과 target개."""
    pool = tranco_rows[:5000]  # top 5000 안에서 무작위
    random.shuffle(pool)
    rows = []
    for line in pool:
        if len(rows) >= target: break
        parts = line.strip().split(",")
        if len(parts) < 2: continue
        domain = parts[1].strip()
        url = "https://" + domain
        if head_alive(url, timeout=4.0):
            rows.append({"url": url, "label": "benign", "chrome_blocks": False, "alive": True, "note": ""})
            if len(rows) % 10 == 0:
                print(f"  benign {len(rows)}/{target}")
        else:
            # try http
            url2 = "http://" + domain
            if head_alive(url2, timeout=3.0):
                rows.append({"url": url2, "label": "benign", "chrome_blocks": False, "alive": True, "note": ""})
    return rows

# ───────────────────────── main ─────────────────────────

def write_csv(path, rows):
    with path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["url","label","chrome_blocks","alive","note"])
        w.writeheader(); w.writerows(rows)
    print(f"  wrote {len(rows)} → {path}")

async def main():
    p = argparse.ArgumentParser()
    p.add_argument("--target", type=int, default=100, help="phish/benign 각각 목표 건수")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()
    random.seed(args.seed)

    # Tranco 먼저 로드 — apex 화이트리스트 만들어 phish 노이즈 제거에 사용
    print("=== Tranco top-1m 수집 ===")
    tranco_raw = fetch_tranco(CORPUS / ".tranco.cache.csv")
    print(f"  pool: {len(tranco_raw)} rows")
    apex_whitelist = build_tranco_apex_whitelist(tranco_raw, top_n=10000)
    print(f"  apex whitelist (Tranco top-10k): {len(apex_whitelist)} domains")

    print("\n=== Phishing.Database 수집 ===")
    phish_raw = fetch_phishing_db(CORPUS / ".phishing_db.cache.txt")
    phish_pool_all = [u for u in phish_raw if u.startswith(("http://","https://"))]
    # (1) 호스트 단위 dedup, (2) Tranco apex 화이트리스트 매칭 제외(false positive)
    seen_hosts = set(); phish_pool = []
    skipped_apex = 0
    for u in phish_pool_all:
        try: h = urllib.parse.urlparse(u).hostname
        except Exception: continue
        if not h or h in seen_hosts: continue
        seen_hosts.add(h)
        if registered_domain(h) in apex_whitelist:
            skipped_apex += 1
            continue
        phish_pool.append(u)
    random.shuffle(phish_pool)
    print(f"  pool: {len(phish_pool_all)} URLs → {len(seen_hosts)} unique hosts → {len(phish_pool)} after apex filter (skipped {skipped_apex} legit-looking)")

    print(f"\n=== Phish 코퍼스 빌드 (target={args.target}) ===")
    phish_rows = await build_phish(args.target, phish_pool)
    write_csv(CORPUS / "phish.csv", phish_rows)

    print(f"\n=== Benign 코퍼스 빌드 (target={args.target}) ===")
    benign_rows = build_benign(args.target, tranco_raw)
    write_csv(CORPUS / "benign.csv", benign_rows)

    print(f"\n완료. {CORPUS}/phish.csv ({len(phish_rows)}) + {CORPUS}/benign.csv ({len(benign_rows)})")

if __name__ == "__main__":
    asyncio.run(main())
