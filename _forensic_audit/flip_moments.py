# -*- coding: utf-8 -*-
"""Step 6: raw event inspection at flip moments + event type census."""
import json
import sys
from collections import Counter

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

print("=== EVENT TYPE CENSUS ===")
tc = Counter()
for s in data.values():
    for e in s.get("events", []):
        tc[e.get("type")] += 1
print(dict(tc))

sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))


def window(idx, center_ts, span_before=8000, span_after=6000):
    sid, s = sessions[idx - 1]
    print(f"\n===== RUN{idx:02d} raw stream {span_before/1000:.0f}s before -> {span_after/1000:.0f}s after t={center_ts} =====")
    items = []
    for p in s.get("pages", []):
        ws = []
        for sel in p.get("selects", []) or []:
            nm = (sel.get("name") or "") + "|" + (sel.get("id") or "")
            if "warrantystatus" in nm.lower():
                core = "WS" if "trwarranty" not in nm.lower() else "TRWS"
                ws.append(f"{core}={sel.get('selectedText')}({sel.get('selectedValue')})")
        items.append((p.get("ts"), "SNAP", f"pt={p.get('pageType')} reason={p.get('reason')} | {' '.join(ws)}"))
    for e in s.get("events", []):
        items.append((e.get("ts"), "EV",
                      f"type={e.get('type')} tag={e.get('tag')} seq={e.get('seq')} text={str(e.get('text'))[:70]!r}"))
    items.sort(key=lambda x: x[0])
    for t, kind, desc in items:
        if center_ts - span_before <= t <= center_ts + span_after:
            mark = ">>" if kind == "EV" else "  "
            print(f"{mark} +{round((t - s.get('firstSeen'))/1000, 2)}s [{kind}] {desc}")


# RUN21 idx21: flip moment ~ firstSeen+10503.8s ; find exact snap ts
sid21, s21 = sessions[20]
t21 = s21["firstSeen"] + 10503800
window(21, t21, 12000, 5000)

# RUN09 idx9: flip ~ firstSeen+15045.4s
sid9, s9 = sessions[8]
t9 = s9["firstSeen"] + 15045400
window(9, t9, 10000, 4000)

# RUN21 early revert: IN at +3.1s -> OUT at +18.0s
window(21, s21["firstSeen"] + 18000, 18000, 3000)
