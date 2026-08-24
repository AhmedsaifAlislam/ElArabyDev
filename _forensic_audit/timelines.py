# -*- coding: utf-8 -*-
"""Step 3: per-run forensic timeline merging snapshots + clicks.

Tracks warranty status / spare parts / models / serials / defect codes /
technician-related fields with their ACTUAL runtime values per snapshot,
plus click events, so deviations can be confirmed (or refuted) in time order.
"""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"

# Field matchers: (substring-of-name-or-label, short-tag)
TRACK_SELECTS = [
    ("ldv_warrantystatus", "WS"),
    ("ldv_trwarrantystatus", "TR_WS"),
    ("ats_sparepartsstatus", "SP"),
    ("new_inoutasc", "INOUT"),
    ("ldv_workordertype", "WOT"),
    ("ats_inventorystatus", "INV"),
    ("ats_warrantystatus", "PART_WS"),
]
TRACK_INPUTS = [
    ("customerid_name", "CUST"),
    ("ldv_actualmodel_name", "MODEL1"),
    ("ldv_actualmodel2_name", "MODEL2"),
    ("ldv_serialnumber1", "SER2"),
    ("ldv_serialnumber", "SER1"),
    ("ats_producttypebrand_name", "BRAND"),
    ("ldv_productgroup_name", "GRP"),
    ("ldv_producttype_name", "TYPE"),
    ("ats_bookingstatus_name", "BOOK"),
    ("ticketnumber", "TICKET"),
    ("ats_workordertype_name", "WOT"),
    ("ats_modeldefectmajor_name", "DEFMAJ"),
    ("ats_defectcodedefectmajor_name", "DEFCODE"),
    ("ats_modeldefectspid_name", "SPID"),
    ("ats_quantity", "QTY"),
    ("ats_modelid_name", "PMODEL"),
    ("ats_actualmodel_name", "PACT"),
    ("ldv_technicalsupportnotes", "TSN"),
]

def fmt_sel(sel):
    st = sel.get("selectedText")
    sv = sel.get("selectedValue")
    if st in (None, "") and sv in (None, ""):
        return None
    return f"{st}|{sv}"

def collect(page):
    out = []
    name_seen = set()
    for sel in page.get("selects", []) or []:
        nm = (sel.get("name") or "") + "|" + (sel.get("label") or "")
        for sub, tag in TRACK_SELECTS:
            if sub in nm and nm not in name_seen:
                name_seen.add(nm)
                v = fmt_sel(sel)
                if v:
                    out.append((tag, v))
                break
    for inp in page.get("inputs", []) or []:
        nm = (inp.get("name") or "") + "|" + (inp.get("label") or "")
        for sub, tag in TRACK_INPUTS:
            if sub in nm and nm not in name_seen:
                name_seen.add(nm)
                v = inp.get("value")
                if v not in (None, ""):
                    vv = str(v).replace("\n", " ")
                    out.append((tag, vv[:48]))
                break
    return out

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))

lines = []
for i, (sid, s) in enumerate(sessions, 1):
    t0 = s.get("firstSeen")
    evs = list(s.get("events", []))
    pgs = list(s.get("pages", []))
    stream = []
    for p in pgs:
        stream.append(("SNAP", p))
    for e in evs:
        stream.append(("CLICK", e))

    def sort_ts(item):
        return item[1].get("ts", 0)

    stream.sort(key=lambda x: (sort_ts(x), 0 if x[0] == "SNAP" else 1))

    lines.append("=" * 100)
    lines.append(f"RUN {i:02d} id={sid} start={t0} orderId={s.get('orderId')}")
    prev_vals = {}
    for kind, item in stream:
        t = (item.get("ts", 0) - t0) / 1000.0
        if kind == "CLICK":
            txt = str(item.get("text", ""))[:40].replace("\n", " ")
            lines.append(f"  [{t:9.1f}s] CLICK {item.get('tag','')} '{txt}' seq={item.get('seq')}")
            continue
        pt = item.get("pageType")
        reason = item.get("reason")
        vals = collect(item)
        # build compact delta-only representation
        cur = {}
        for tag, v in vals:
            cur[tag] = v
        changed = {k: v for k, v in cur.items() if prev_vals.get(k) != v}
        if changed:
            ch = " ".join(f"{k}={v}" for k, v in changed.items())
            lines.append(f"  [{t:9.1f}s] SNAP {pt} ({reason}) Δ {ch}")
        elif not prev_vals:
            lines.append(f"  [{t:9.1f}s] SNAP {pt} ({reason}) (no tracked values)")
        prev_vals.update(changed)
    lines.append("")

out_path = "_forensic_audit/out_timelines.txt"
with open(out_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print("written", out_path, "lines:", len(lines))
