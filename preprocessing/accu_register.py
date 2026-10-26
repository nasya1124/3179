"""Summarise the Clean Energy Regulator ACCU Scheme project register for the
chapter 05 charts (cartogram and slope graph).

Run from this folder. Inputs (download first, not stored in this repo):
  register.csv   ACCU Scheme project register, CSV (as at 30 September 2026)
Outputs:
  credits_cumulative.csv   cumulative credits by state and financial year
  ../data/forest_credits_by_type_year.csv  credits issued each year, by kind of project
Then build the map files (npm install first):
  mapshaper ../maps/australian-states.topojson -simplify 30% keep-shapes
    -o format=topojson quantization=1e5 states_light.topojson
  node carto.mjs  states_light.topojson credits_cumulative.csv  ../data/forest_credits_cartogram.geojson
"""
import pandas as pd

STATES = ["New South Wales", "Queensland", "Western Australia", "Victoria",
          "South Australia", "Tasmania", "Northern Territory",
          "Australian Capital Territory"]
TYPES = ["Native forest regeneration", "Avoided clearing",
         "Native tree plantings", "Commercial plantations"]


def project_type(method):
    """Group the register's forest methods into four kinds of project."""
    m = str(method)
    if "Human-Induced Regeneration" in m or "Managed Regrowth" in m:
        return "Native forest regeneration"
    if "Plantings" in m or "Reforestation and Afforestation" in m:
        return "Native tree plantings"
    if "Plantation Forestry" in m or "Farm Forestry" in m:
        return "Commercial plantations"
    if "Avoided" in m:
        return "Avoided clearing"
    return None  # not a forest method


def number(series):
    return pd.to_numeric(series.astype(str).str.replace(",", ""), errors="coerce").fillna(0)


reg = pd.read_csv("register.csv", encoding_errors="replace")
reg["Category"] = reg["Method"].map(project_type)
active = reg[reg["Category"].notna() & (reg["Project revoked"] == "No")].copy()

# 1. Cumulative credits (KACCUs + NKACCUs) by state and financial year.
#    Single-state projects only; 2026-27 left out as it is incomplete.
single = active[active["Project location"].isin(STATES)]
rows = []
for state in STATES:
    total = dict.fromkeys(TYPES, 0.0)
    for start in range(2012, 2026):
        fy = f"{start}/{str(start + 1)[2:]}"
        for t in TYPES:
            sub = single[(single["Project location"] == state) & (single["Category"] == t)]
            total[t] += (number(sub[f"KACCUs Units Issued in Financial Year {fy}"]).sum()
                         + number(sub[f"NKACCUs Units Issued in Financial Year {fy}"]).sum())
        all_credits = sum(total.values())
        rows.append({
            "State": state, "Year": start + 1, "Financial_year": fy.replace("/", "–"),
            "Credits_m": round(all_credits / 1e6, 3),
            "Regeneration_m": round(total[TYPES[0]] / 1e6, 3),
            "Avoided_m": round(total[TYPES[1]] / 1e6, 3),
            "Plantings_m": round(total[TYPES[2]] / 1e6, 3),
            "Plantations_m": round(total[TYPES[3]] / 1e6, 3),
            "Main_type": max(total, key=total.get) if all_credits > 0 else None,
        })
pd.DataFrame(rows).to_csv("credits_cumulative.csv", index=False)

# 2. Credits issued each financial year, by kind of project, for the slope graph
#    graph. All active forest projects (multi-state ones included, as the
#    chart is national); plantings and plantations are combined as both are small.
by_type = active.copy()
by_type["Type"] = by_type["Category"].replace(
    {"Native tree plantings": "Plantings and plantations",
     "Commercial plantations": "Plantings and plantations"})
rows = []
for start in range(2012, 2026):
    fy = f"{start}/{str(start + 1)[2:]}"
    for t, g in by_type.groupby("Type"):
        credits = (number(g[f"KACCUs Units Issued in Financial Year {fy}"]).sum()
                   + number(g[f"NKACCUs Units Issued in Financial Year {fy}"]).sum())
        rows.append({"Year": start + 1, "Financial_year": fy.replace("/", "–"),
                     "Type": t, "Credits_m": round(credits / 1e6, 3)})
pd.DataFrame(rows).to_csv("../data/forest_credits_by_type_year.csv", index=False)
print(f"{len(active)} active forest projects summarised")
