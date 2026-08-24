# -*- coding: utf-8 -*-
"""Step 5: deep dive into RUN21 warranty flip + RUN09 anomaly."""
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

PATH = "session-captures-2026-08-24.json"
with open(PATH, encoding="utf-8") as f:
    data = json.load(f)

sessions = sorted(data.items(), key=lambda kv: kv[1].get("firstSeen", 0))


def dump_run(idx, note):
    sid, s = sessions[idx - 1]
    t0 = s.get("firstSeen")
    print(f"\n{'='*70}\nRUN{idx:02d}  id={sid[:12]}  orderId={s.get('orderId')}  [{note}]")
    print(f"firstSeen={t0} lastSeen={s.get('lastSeen')} span_min={round((s.get('lastSeen',0)-t0)/60000,1)}")
    stream = []
    for p in s.get("pages", []):
        stream.append(("SNAP", p))
    for e in s.get("events", []):
        stream.append(("CLICK", e))
    stream.sort(key=lambda x: (x[1].get("ts", 0), 0 if x[0] == "SNAP" else 1))

    def fmt_ws(p):
        out = []
        for sel in p.get("selects", []) or []:
            nm = sel.get("name") or ""
            if "warrantystatus" in nm.lower():
                short = "WS" if nm.lower().startswith("ldv_warrantystatus") else "TRWS"
                out.append(f"{short}={sel.get('selectedText')}({sel.get('selectedValue')})")
        return " ".join(out) if out else "-"

    prev_t = None
    for kind, it in stream:
        t = it.get("ts", 0)
        dt = f"+{round((t-t0)/1000,1)}s"
        gap = f"(gap {round((t-prev_t)/1000,1)}s)" if prev_t and (t - prev_t) > 30000 else ""
        prev_t = t
        if kind == "SNAP":
            print(f"[{dt}]{gap} SNAP pt={it.get('pageType')} step={it.get('stepId')} "
                  f"reason={str(it.get('reason'))[:28]} ins={len(it.get('inputs') or [])} "
                  f"sel={len(it.get('selects') or [])} | {fmt_ws(it)}")
        else:
            txt = str(it.get("text", ""))[:60]
            typ = str(it.get("type", ""))[:10]
            mark = " <<<< WS-RELATED" if (("ضمان" in txt or "Warranty" in txt) and str(it.get("tag","")).lower() in ("select","option")) or txt.startswith("Select") and ("ضمان" in txt or "Warranty" in txt) else ""
            print(f"[{dt}] CLICK seq={it.get('seq')} {typ} <{it.get('tag')}> \"{txt}\"{mark}")


dump_run(21, "WARRANTY FLIP P1=OUT -> P2=IN")
dump_run(9, "negative-ts anomaly")
