# -*- coding: utf-8 -*-
"""P0-B Runtime Forensic Audit - Step 1: profile page snapshots."""
import json
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

# 1) pageType vocabulary
ptypes = Counter()
reasons = Counter()
for k, v in data.items():
    for p in v.get("pages", []):
        ptypes[p.get("pageType")] += 1
        reasons[p.get("reason")] += 1
print("PAGE TYPES:", dict(ptypes.most_common()))
print("REASONS:", dict(reasons.most_common()))
print()

# 2) Per-session timeline: order by firstSeen
sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))
for i, (sid, s) in enumerate(sessions, 1):
    evs = s.get("events", [])
    pgs = s.get("pages", [])
    t0 = s.get("firstSeen")
    dur = (s.get("lastSeen", 0) - t0) / 1000 if t0 else 0
    pt_seq = []
    for p in pgs:
        pt = p.get("pageType")
        if not pt_seq or pt_seq[-1] != pt:
            pt_seq.append(pt)
    print(f"RUN {i:02d} | {sid[:8]} | start={s.get('firstSeen')} dur={dur:.0f}s ev={len(evs)} snaps={len(pgs)}")
    print(f"      pageType flow: {' -> '.join(str(x) for x in pt_seq)}")

# 3) inputs/selects keys shape
ishapes = Counter()
selshapes = Counter()
for k, v in data.items():
    for p in v.get("pages", []):
        for inp in p.get("inputs", []) or []:
            ishapes[tuple(sorted(inp.keys()))] += 1
        for sel in p.get("selects", []) or []:
            selshapes[tuple(sorted(sel.keys()))] += 1
print()
print("INPUT SNAPSHOT KEYS:")
for s_, n in ishapes.most_common():
    print(" ", n, "x", s_)
print("SELECT SNAPSHOT KEYS:")
for s_, n in selshapes.most_common():
    print(" ", n, "x", s_)
