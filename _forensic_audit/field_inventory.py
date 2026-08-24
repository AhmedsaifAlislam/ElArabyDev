# -*- coding: utf-8 -*-
"""Step 2: inventory of fields per page type."""
import json
import sys
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

fields = defaultdict(Counter)   # pageType -> Counter("tag|label|name")
values_seen = defaultdict(set)  # pageType -> set of "field=value"

for sid, s in data.items():
    for p in s.get("pages", []):
        pt = p.get("pageType")
        for inp in p.get("inputs", []) or []:
            key = f"[{inp.get('tag')}] label={inp.get('label')} name={inp.get('name')}"
            fields[pt][key] += 1
            v = inp.get("value")
            if v not in (None, "",):
                values_seen[pt].add(f"{inp.get('label')} = {v!r}")
        for sel in p.get("selects", []) or []:
            key = f"SELECT label={sel.get('label')} name={sel.get('name')}"
            fields[pt][key] += 1
            sv = sel.get("selectedText")
            if sv:
                values_seen[pt].add(f"{sel.get('label')} => {sv!r} ({sel.get('selectedValue')})")

for pt in ("PAGE_1", "PAGE_2", "PAGE_3"):
    print(f"===== {pt}: {len(fields[pt])} distinct fields =====")
    for k, n in fields[pt].most_common(40):
        print(f"  {n:5d}  {k}")
    print()

print("########## DISTINCT NON-EMPTY VALUES PER PAGE ##########")
for pt in ("PAGE_1", "PAGE_2", "PAGE_3"):
    print(f"===== {pt} ({len(values_seen[pt])} distinct values) =====")
    for vline in sorted(values_seen[pt]):
        print("  ", vline)
    print()
