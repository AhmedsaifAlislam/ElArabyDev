# -*- coding: utf-8 -*-
"""Step 8: all mid-session WS changes across all runs + chronology."""
import json
import sys
from datetime import datetime, timezone, timedelta

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

CAIRO = timezone(timedelta(hours=3))
sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))

print("=== CHRONOLOGY (Cairo time) ===")
for i, (sid, s) in enumerate(sessions, 1):
    t0 = s.get("firstSeen")
    dt = datetime.fromtimestamp(t0 / 1000, CAIRO).strftime("%m-%d %H:%M")
    span_min = round((s.get("lastSeen", t0) - t0) / 60000, 1)
    nsnaps = len(s.get("pages", []) or [])
    nclicks = len(s.get("events", []) or [])
    print(f"RUN{i:02d} {dt}  span={span_min:>6}min snaps={nsnaps:>3} clicks={nclicks:>3} id={sid[:8]}")

print("\n=== ALL MID-SESSION WS VALUE CHANGES (per run, merged stream) ===")
for i, (sid, s) in enumerate(sessions, 1):
    t0 = s.get("firstSeen")
    stream = []
    for p in s.get("pages", []):
        stream.append((p.get("ts", 0), "S", p, None))
    for e in s.get("events", []):
        stream.append((e.get("ts", 0), "C", None, e))
    stream.sort(key=lambda x: (x[0], 0 if x[1] == "S" else 1))
    lastval = {}  # name -> text
    changes = []
    for t, kind, p, e in stream:
        if kind == "C":
            txt = str(e.get("text", ""))
            if txt.startswith("Select") and ("ضمان" in txt or "Warranty" in txt.lower() or "warranty" in txt.lower()):
                changes.append((t, f"USER-CLICK on WS select"))
            continue
        for sel in p.get("selects", []) or []:
            nm = (sel.get("name") or "")
            low = nm.lower()
            if "trwarrantystatus" in low:
                key = "TRWS"
            elif low.startswith("ldv_warrantystatus"):
                key = "WS"
            elif "ats_warrantystatus" in low:
                key = "ATSW"
            else:
                continue
            val = f"{sel.get('selectedText')}({sel.get('selectedValue')})"
            if key in lastval and lastval[key] != val:
                # look back 6s for a user click on WS select
                recent = any(ct >= t - 6000 and "USER-CLICK" in c for ct, c in changes[-8:])
                tag = "after-user-click" if recent else ">>> SILENT WRITE <<<"
                changes.append((t, f"{key}: {lastval[key]} -> {val}  [{tag}]"))
            lastval[key] = val
    if changes:
        print(f"\nRUN{i:02d}:")
        for t, desc in changes:
            print(f"   +{round((t-t0)/1000,1)}s  {desc}")

print("\n=== WARRANTY DATE FIELD APPEARANCES/CLEARANCES ===")
for i, (sid, s) in enumerate(sessions, 1):
    t0 = s.get("firstSeen")
    prev = None
    for p in sorted(s.get("pages", []), key=lambda x: x.get("ts", 0)):
        for inp in p.get("inputs", []) or []:
            nm = (inp.get("id") or "") + (inp.get("name") or "")
            if "warrantydate" in nm.lower():
                v = inp.get("value")
                if prev is not None and v != prev:
                    print(f"RUN{i:02d} +{round((p.get('ts',0)-t0)/1000,1)}s date: {prev!r} -> {v!r}")
                prev = v
