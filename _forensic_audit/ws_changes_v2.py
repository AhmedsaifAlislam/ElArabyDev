# -*- coding: utf-8 -*-
"""Step 8 v2: rigorous per-ELEMENT WS tracking (identity = id|name)."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))


def classify(nm):
    low = nm.lower()
    if "trwarrantystatus" in low:
        return "TRWS"
    if "ats_warrantystatus" in low:
        return "ATSW"
    if "warrantystatus" in low:
        return "WS"
    return None


print("=== PER-ELEMENT WARRANTY VALUE CHANGES (real changes only) ===")
for i, (sid, s) in enumerate(sessions, 1):
    t0 = s.get("firstSeen")
    stream = []
    for p in s.get("pages", []):
        stream.append((p.get("ts", 0), "S", p, None))
    for e in s.get("events", []):
        stream.append((e.get("ts", 0), "C", None, e))
    stream.sort(key=lambda x: (x[0], 0 if x[1] == "S" else 1))

    lastval = {}   # elemkey -> (text,value)
    lastpage = {}
    clicklog = []  # (ts, desc)
    out = []
    for t, kind, p, e in stream:
        if kind == "C":
            txt = str(e.get("text", ""))
            tl = txt.lower()
            if txt.startswith("Select") and ("ضمان" in txt or "warranty" in tl):
                clicklog.append((t, f"click[{txt[:45]}]"))
            continue
        pt = p.get("pageType")
        for sel in p.get("selects", []) or []:
            nm = sel.get("name") or ""
            cid = sel.get("id") or ""
            cat = classify(nm) or classify(cid)
            if not cat:
                continue
            key = f"{cat}:{cid[-30:]}|{nm[-40:]}"
            val = (sel.get("selectedText"), sel.get("selectedValue"))
            if key in lastval and lastval[key] != val:
                oldt, oldv = lastval[key]
                same_value_diff_lang = oldv == val[1]
                recent_click = any(t - ct <= 6000 for ct, _ in clicklog)
                kindmark = "LANG-RENDER" if same_value_diff_lang else (
                    "after-user-click" if recent_click else "*** SILENT ***")
                out.append((t, f"{cat} [{pt}] {oldt}({oldv}) -> {val[0]}({val[1]})  <{kindmark}>"))
            if key not in lastval or lastval[key] != val:
                lastval[key] = val
                lastpage[key] = pt
    if out:
        print(f"\nRUN{i:02d}:")
        for t, d in out:
            print(f"   +{round((t-t0)/1000,1)}s  {d}")
