#!/usr/bin/env python3
"""analyze.py — eval_harness 결과 CSV 분석.

  python3 eval/analyze.py [run.csv]                      # 최신 run 자동
  python3 eval/analyze.py [run.csv] --baseline [prev.csv]
"""
import argparse, csv, pathlib, re, sys, urllib.parse
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parent
RUNS = ROOT / "runs"

FREE_HOSTING_RE = re.compile(
    r"\.(workers\.dev|pages\.dev|vercel\.app|netlify\.app|netlify\.com|replit\.dev|repl\.co|github\.io|gitlab\.io|"
    r"weebly\.com|webflow\.io|web\.app|firebaseapp\.com|surge\.sh|onrender\.com|glitch\.me|wixsite\.com|"
    r"wordpress\.com|blogspot\.com|tiiny\.site|herokuapp\.com|fly\.dev|deno\.dev|render\.com|"
    r"ngrok\.io|ngrok-free\.app|trycloudflare\.com|amplifyapp\.com)$", re.IGNORECASE)
IP_HOST_RE = re.compile(r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$")
IDN_RE = re.compile(r"xn--")

def category_host(url):
    try:
        h = urllib.parse.urlparse(url).hostname or ""
    except Exception:
        return "unknown"
    if not h: return "unknown"
    if IP_HOST_RE.match(h): return "ip"
    if IDN_RE.search(h): return "idn"
    if FREE_HOSTING_RE.search(h): return "free-hosting"
    return "regular"

def load(path):
    with open(path) as f:
        return list(csv.DictReader(f))

def tobool(s):
    return str(s).strip().lower() in ("true","1","yes")

def confusion(rows, on_subset=None):
    tp = fp = fn = tn = 0
    err = 0
    for r in rows:
        if on_subset and not on_subset(r): continue
        if r.get("error"):
            err += 1; continue
        gt = r["label"] == "phish"
        pred_s = r.get("predicted_phishing","")
        if pred_s == "": err += 1; continue
        pred = tobool(pred_s)
        if gt and pred: tp += 1
        elif gt and not pred: fn += 1
        elif (not gt) and pred: fp += 1
        else: tn += 1
    return tp, fp, fn, tn, err

def metrics(tp, fp, fn, tn):
    p = tp / (tp+fp) if tp+fp else 0
    r = tp / (tp+fn) if tp+fn else 0
    f1 = 2*p*r/(p+r) if p+r else 0
    acc = (tp+tn) / (tp+fp+fn+tn) if (tp+fp+fn+tn) else 0
    return p, r, f1, acc

def fmt_row(name, tp, fp, fn, tn, err):
    p, r, f1, acc = metrics(tp, fp, fn, tn)
    n = tp+fp+fn+tn+err
    return f"{name:<22} n={n:>4}  TP={tp:>3} FP={fp:>3} FN={fn:>3} TN={tn:>3} err={err:>2}  P={p:.2f} R={r:.2f} F1={f1:.2f} Acc={acc:.2f}"

def summarize(rows, title):
    print(f"\n=== {title} (n={len(rows)}) ===")
    print(fmt_row("OVERALL", *confusion(rows)))

    # by host category
    print("\n[host category]")
    for cat in ["free-hosting","regular","ip","idn","unknown"]:
        sub = [r for r in rows if category_host(r["url"]) == cat]
        if sub:
            print("  " + fmt_row(cat, *confusion(sub)))

    # brand detected vs not
    print("\n[brand detected]")
    print("  " + fmt_row("brand=NULL",      *confusion(rows, lambda r: not (r.get("brand") or "").strip())))
    print("  " + fmt_row("brand≠null",      *confusion(rows, lambda r:  bool((r.get("brand") or "").strip()) )))

    # suspicious_domain
    print("\n[suspicious_domain]")
    print("  " + fmt_row("sus_dom=true",    *confusion(rows, lambda r: tobool(r.get("suspicious_domain","")))))
    print("  " + fmt_row("sus_dom=false",   *confusion(rows, lambda r: not tobool(r.get("suspicious_domain","")))))

def list_failures(rows, kind, limit=20):
    print(f"\n=== {kind} cases (up to {limit}) ===")
    n = 0
    for r in rows:
        if r.get("error"): continue
        gt = r["label"] == "phish"
        pred = tobool(r.get("predicted_phishing",""))
        if kind == "FN" and gt and not pred:
            pass
        elif kind == "FP" and (not gt) and pred:
            pass
        else:
            continue
        n += 1
        print(f"\n  [{kind} {n}] {r['url']}")
        print(f"     score={r.get('phishing_score')} brand={r.get('brand')!r} sus_dom={r.get('suspicious_domain')}")
        print(f"     reason: {(r.get('reason') or '')[:300]}")
        if n >= limit: break

def diff(curr, prev):
    by_url_c = {r["url"]: r for r in curr}
    by_url_p = {r["url"]: r for r in prev}
    common = set(by_url_c) & set(by_url_p)
    flipped_to_phish = []
    flipped_to_benign = []
    for u in common:
        if by_url_c[u].get("error") or by_url_p[u].get("error"): continue
        cp = tobool(by_url_c[u].get("predicted_phishing",""))
        pp = tobool(by_url_p[u].get("predicted_phishing",""))
        if cp and not pp:
            flipped_to_phish.append((u, by_url_c[u], by_url_p[u]))
        elif pp and not cp:
            flipped_to_benign.append((u, by_url_c[u], by_url_p[u]))
    print(f"\n=== DIFF vs baseline (n_common={len(common)}) ===")
    print(f"  flipped → phishing : {len(flipped_to_phish)}")
    for u, c, p in flipped_to_phish[:10]:
        print(f"    {u[:80]}  ({p['label']}, was score={p.get('phishing_score')} → now {c.get('phishing_score')})")
    print(f"  flipped → benign   : {len(flipped_to_benign)}")
    for u, c, p in flipped_to_benign[:10]:
        print(f"    {u[:80]}  ({p['label']}, was score={p.get('phishing_score')} → now {c.get('phishing_score')})")

    tp_c,fp_c,fn_c,tn_c,_ = confusion(curr)
    tp_p,fp_p,fn_p,tn_p,_ = confusion(prev)
    p_c,r_c,f1_c,_ = metrics(tp_c,fp_c,fn_c,tn_c)
    p_p,r_p,f1_p,_ = metrics(tp_p,fp_p,fn_p,tn_p)
    print(f"\n  F1: {f1_p:.3f} → {f1_c:.3f}  ({f1_c-f1_p:+.3f})")
    print(f"  Precision: {p_p:.3f} → {p_c:.3f}  ({p_c-p_p:+.3f})")
    print(f"  Recall:    {r_p:.3f} → {r_c:.3f}  ({r_c-r_p:+.3f})")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run", nargs="?", default=None)
    ap.add_argument("--baseline", default=None)
    ap.add_argument("--show", choices=["FN","FP","both","none"], default="both")
    ap.add_argument("--limit", type=int, default=15)
    args = ap.parse_args()

    if args.run is None:
        runs = sorted(RUNS.glob("*.csv"))
        if not runs: sys.exit("no runs/*.csv")
        run_path = runs[-1]
    else:
        run_path = pathlib.Path(args.run)
    print(f"# Run: {run_path}")

    curr = load(run_path)
    summarize(curr, run_path.name)

    if args.show in ("FN","both"): list_failures(curr, "FN", args.limit)
    if args.show in ("FP","both"): list_failures(curr, "FP", args.limit)

    if args.baseline:
        prev = load(args.baseline)
        diff(curr, prev)

if __name__ == "__main__":
    main()
