# -*- coding: utf-8 -*-
"""Step 7: full snapshot diffs around RUN21 revert moment."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))
sid, s = sessions[20]  # RUN21
t0 = s["firstSeen"]


def sig(p):
    """compact signature of all fields"""
    ins = []
    for i in p.get("inputs", []) or []:
        if (i.get("id") or i.get("name")):
            ins.append(f"{i.get('tag','i')}:{(i.get('id') or i.get('name'))[-40:]}={str(i.get('value'))[:30]!r}")
    sels = []
    for sel in p.get("selects", []) or []:
        nm = (sel.get("id") or sel.get("name"))
        if nm:
            sels.append(f"sel:{nm[-40:]}={sel.get('selectedText')}")
    return ins, sels


pages = [p for p in s.get("pages", []) if abs(p.get("ts", 0) - (t0 + 18000)) < 60000]
pages.sort(key=lambda p: p.get("ts", 0))
prev = None
for p in pages:
    t = round((p["ts"] - t0) / 1000, 1)
    if t > 40:
        break
    ins, sels = sig(p)
    print(f"\n--- SNAP +{t}s pt={p.get('pageType')} reason={p.get('reason')} ---")
    if prev is None:
        for x in ins:
            print("   ", x)
        for x in sels:
            print("   ", x)
    else:
        pins, psels = sig(prev[0])
        pinmap = dict(x.split("=", 1) for x in pins)
        sinmap = dict(x.split("=", 1) for x in ins)
        changed = False
        for k in sorted(set(pinmap) | set(sinmap)):
            v_old, v_new = pinmap.get(k), sinmap.get(k)
            if v_old != v_new:
                changed = True
                print(f"    CHG {k}: {v_old!r} -> {v_new!r}")
        pselmap = dict(x.split("=", 1) for x in psels)
        sselmap = dict(x.split("=", 1) for x in sels)
        for k in sorted(set(pselmap) | set(sselmap)):
            if pselmap.get(k) != sselmap.get(k):
                changed = True
                print(f"    CHG {k}: {pselmap.get(k)!r} -> {sselmap.get(k)!r}")
        if not changed:
            print("    (no field changes)")
    prev = (p,)
