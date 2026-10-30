# -*- coding: utf-8 -*-
"""Step 4: decisive verification checks on raw JSON."""
import json
import sys
import re
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

print("=== [1] EVENT OBJECT KEYS (all distinct across every event) ===")
keys = Counter()
n_ev = 0
for sid, s in data.items():
    for e in s.get("events", []) or []:
        n_ev += 1
        for k in e.keys():
            keys[k] += 1
print("total events:", n_ev)
for k, c in keys.most_common():
    print(f"  {k}: {c}")

print("\n=== [2] SNAPSHOT (page) KEYS ===")
pkeys = Counter()
for sid, s in data.items():
    for p in s.get("pages", []) or []:
        for k in p.keys():
            pkeys[k] += 1
for k, c in pkeys.most_common():
    print(f"  {k}: {c}")

# sample one full page object minus big arrays
for sid, s in data.items():
    pgs = s.get("pages", [])
    if pgs:
        sample = {k: v for k, v in pgs[0].items() if k not in ("inputs", "selects")}
        print("sample page meta:", json.dumps(sample, ensure_ascii=False)[:400])
        break

print("\n=== [3] TECHNICIAN-RELATED STRINGS anywhere in snapshots ===")
hits = Counter()
pat = re.compile(r"(technician|tech_name|bookable|فنى|فني)", re.I)
for sid, s in data.items():
    for p in s.get("pages", []):
        blob = json.dumps(p, ensure_ascii=False)
        for m in pat.finditer(blob):
            frag = blob[max(0, m.start()-60):m.end()+60]
            hits[frag] += 1
if hits:
    for frag, c in list(hits.most_common(12)):
        print(f"  x{c}: ...{frag}...")
else:
    print("  NONE FOUND")

print("\n=== [4] WARRANTY MAPPING CONSISTENCY (code<->label) ===")
ok = bad = 0
badex = []
mapping = {"753240000": ("in", "داخل"), "753240001": ("out", "خارج")}
def check(label, val):
    global ok, bad
    if not label or not val:
        return
    v = str(val)
    if v not in mapping:
        return
    exp_in, exp_ar = mapping[v]
    lab = str(label).lower()
    good = (exp_in in lab) or (exp_ar in str(label))
    if good:
        ok += 1
    else:
        bad += 1
        if len(badex) < 10:
            badex.append((label, v))
for sid, s in data.items():
    for p in s.get("pages", []):
        for sel in p.get("selects", []) or []:
            nm = (sel.get("name") or "") + (sel.get("label") or "")
            if "warrantystatus" in nm.lower():
                check(sel.get("selectedText"), sel.get("selectedValue"))
print(f"  consistent={ok}  INCONSISTENT={bad}")
for b in badex:
    print("  MISMATCH:", b)

print("\n=== [5] PER-RUN: first P1 WS vs first P2 WS (+ select clicks near change) ===")
sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))
for i, (sid, s) in enumerate(sessions, 1):
    t0 = s.get("firstSeen")
    stream = []
    for p in s.get("pages", []):
        stream.append(("S", p))
    for e in s.get("events", []):
        stream.append(("C", e))
    stream.sort(key=lambda x: (x[1].get("ts", 0), 0 if x[0] == "S" else 1))
    p1ws = p2ws = None
    p2at = None
    selclicks = 0
    for kind, it in stream:
        if kind == "C":
            txt = str(it.get("text", ""))
            if txt.startswith("Select") and ("ضمان" in txt or "Warranty" in txt):
                selclicks += 1
            continue
        pt = it.get("pageType")
        for sel in it.get("selects", []) or []:
            nm = (sel.get("name") or "")
            if "ldv_warrantystatus" in nm and sel.get("selectedValue"):
                if pt == "PAGE_1" and p1ws is None:
                    p1ws = (sel.get("selectedText"), sel.get("selectedValue"))
                if pt == "PAGE_2" and p2ws is None:
                    p2ws = (sel.get("selectedText"), sel.get("selectedValue"))
                    p2at = round((it.get("ts", 0) - t0) / 1000.0, 1)
    print(f"RUN{i:02d} P1WS={p1ws} P2WS={p2ws}@{p2at}s wsSelClicks={selclicks}")

print("\n=== [6] URL field presence / order switching inside sessions ===")
hasurl = 0
urls = Counter()
for sid, s in data.items():
    for p in s.get("pages", []):
        u = p.get("url") or p.get("href")
        if u:
            hasurl += 1
            urls[u.split("?")[0][-60:]] += 1
print("pages with url:", hasurl)
for u, c in urls.most_common(8):
    print(f"  x{c} {u}")
