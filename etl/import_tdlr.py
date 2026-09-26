"""Convert the TDLR (Architectural Barriers / TABS) data-center export into data/seed rows.

Inputs:
  data/raw/tdlr_data_centers_<date>.csv   verified export (see data/raw/README.md)
  data/raw/tdlr_registry_matches.csv      reviewed links from TDLR project numbers to
                                          Comptroller registry sites (status confirmed/probable)
Output: rows merged into data/seed/{parents,entities,projects,evidence_events}.csv.
Run etl/import_comptroller.py first; this script adds to the registry projects.

What gets loaded:
  1. Every TDLR record with a *confirmed* registry match -> evidence on that registry site,
     and the site gets its address from the largest matched record.
  2. New sites for TDLR records that are not confirmed matches but are clearly large data-center
     builds: new construction or additions, >= NEW_SITE_MIN_COST, registered on/after
     NEW_SITE_SINCE, not in EXCLUDE. Records are grouped into a site by (owner, city); other
     TDLR records at the same street address join that site. Probable registry matches are
     loaded this way too, flagged with `possible_registry_match` so the team can merge them.
  Everything else (small or old renovations) stays in the raw file only.

Events per TDLR record: building_registered (value = estimated cost), square_footage (if
published), tenant_named (only when the tenant field names an organisation), and
inspection_done when TDLR shows "Inspection Complete". TDLR does not publish the inspection
date, so that event is dated on the retrieval date and says so in its payload.

Privacy: contact people, phone numbers and owner mailing addresses are never loaded. A tenant
field that is only a person's name is skipped; "Person (Company)" keeps only the company.

Usage: python etl/import_tdlr.py --file data/raw/tdlr_data_centers_2026-09-26.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path

import pandas as pd

from import_comptroller import KNOWN_COMPANIES, OTHER_PARENT_COLOR, display_name, merge_csv

ROOT = Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed"
MATCHES = ROOT / "data" / "raw" / "tdlr_registry_matches.csv"

NEW_SITE_MIN_COST = 20_000_000
NEW_SITE_SINCE = "2020-01-01"
NEW_SITE_WORK_TYPES = {"New Construction", "Additions to Existing Building"}
# Records that pass the filter but are not data centers (reason from the TDLR scope of work).
EXCLUDE = {
    "TABS2021015470": "UTSA School of Data Science: scope says 'New academic building'",
    "TABS2021016220": "Pedernales Electric Cooperative 24-hour control center, not a data-center load",
}
ORIGIN = "tdlr_import"

_ORG = re.compile(
    r"\b(llc|l\.l\.c|inc|corp|corporation|company|co\.|lp|l\.p|ltd|trust|partners|holdings|group|realty|"
    r"university|college|isd|district|city of|county|cooperative|bank|services|properties|data|center|"
    r"technolog|systems|enterprises|investments?|development|infrastructure|platforms|associates|"
    r"digital|equities|leasing|finance|network|communications|energy|power)\b",
    re.IGNORECASE,
)


def is_org(name: str) -> bool:
    return bool(name) and (bool(_ORG.search(name)) or known_company(name) is not None)


def tenant_org(raw: str) -> str | None:
    """'Kaylen Bushell (Open AI)' -> 'Open AI'; 'C1 Richardson LLC' -> itself; a bare person -> None."""
    raw = (raw or "").strip()
    if not raw or raw.lower() == "not assigned":
        return None
    m = re.search(r"\(([^)]+)\)\s*$", raw)
    if m:
        return m.group(1).strip()
    return raw if is_org(raw) else None


def clean_owner(raw: str) -> str | None:
    """Drop care-of and contact-person annotations; None if the owner looks like a person."""
    s = re.split(r"\s+(?:c/o|aka)\s+|\s+[-/]\s*[A-Z][a-z]+ [A-Z][a-z]+$|\s*\([^)]*\)$", (raw or "").strip(), flags=re.I)[0]
    s = s.strip(" ,-/")
    return s if is_org(s) else None


def known_company(*names: str | None) -> str | None:
    for n in names:
        for pattern, parent, _ in KNOWN_COMPANIES:
            if n and re.search(pattern.replace(r"\bopenai\b", r"\bopen\s?ai\b"), n, re.I):
                return parent
    return None


def norm_addr(a: str) -> str:
    a = re.split(r",", str(a))[0].lower()
    a = re.sub(r"\b(suite|ste|unit|bldg|building)\b.*$", "", a)
    for full, abbr in (("road", "rd"), ("drive", "dr"), ("street", "st"), ("boulevard", "blvd"), ("parkway", "pkwy"),
                       ("county road", "cr"), ("co rd", "cr"), ("co. rd.", "cr"), ("highway", "hwy")):
        a = re.sub(rf"\b{re.escape(full)}\b\.?", abbr, a)
    return re.sub(r"[^a-z0-9]+", " ", a).strip()


def title(s: str) -> str:
    """Title-case ALL-CAPS names but keep codes like SAT40, TX11 or DC01 as they are."""
    if not s.isupper():
        return s
    return " ".join(w if any(ch.isdigit() for ch in w) or len(w) <= 2 else w.capitalize() for w in s.split(" "))


def site_name(names: list[str], city: str) -> str:
    stems = []
    for n in names:
        n = re.sub(r"\s*[-–]?\s*(building|bldg|phase)\s*[a-z0-9]+$", "", n.strip(), flags=re.I)
        n = re.sub(r"\s+\d+[a-z]$", "", n, flags=re.I)  # 'Project Pumpkin 1A' -> 'Project Pumpkin'
        n = title(n.strip(" -"))
        if n and n not in stems:
            stems.append(n)
    return f"{' / '.join(stems[:3])} ({title(city)})"


def events_for(r: pd.Series, retrieved: str) -> list[dict]:
    ts = r["Registration Date"][:10]
    payload = {
        "tdlr_project_number": r["Project Number"],
        "project_name": r["Project Name"],
        "facility_name": r["Facility Name"] or None,
        "work_type": r["Work Type"],
        "status": r["Status"],
        "start_date": (r["Start Date"] or "")[:10] or None,
        "completion_date": (r["Completion Date"] or "")[:10] or None,
        "owner": clean_owner(r["Owner Name"]),
        "scope_of_work": (r["Scope of Work"] or "")[:400] or None,
        "retrieved": retrieved,
        "_origin": ORIGIN,
    }
    base = {"project_name": None, "source": "TDLR", "source_url": r["Source URL"]}
    out = [{**base, "ts": ts, "event_type": "building_registered", "value_num": r["Estimated Cost (USD)"],
            "payload_json": json.dumps(payload)}]
    if (r["Square Footage"] or "").strip():
        out.append({**base, "ts": ts, "event_type": "square_footage", "value_num": r["Square Footage"],
                    "payload_json": json.dumps({"tdlr_project_number": r["Project Number"], "_origin": ORIGIN})})
    t = tenant_org(r["Tenant Name"])
    if t:
        out.append({**base, "ts": ts, "event_type": "tenant_named", "value_num": "",
                    "payload_json": json.dumps({"tenant": t, "tdlr_project_number": r["Project Number"], "_origin": ORIGIN})})
    if r["Status"] == "Inspection Complete":
        out.append({**base, "ts": retrieved, "event_type": "inspection_done", "value_num": "",
                    "payload_json": json.dumps({"tdlr_project_number": r["Project Number"], "observed_status": r["Status"],
                                                "note": "TDLR does not publish the inspection date; dated when the status was observed",
                                                "_origin": ORIGIN})})
    return out


def main(file: Path, seed: Path = SEED, matches: Path = MATCHES) -> None:
    td = pd.read_csv(file, dtype=str, keep_default_na=False)
    retrieved = td["Retrieved"].iloc[0][:10]
    mt = pd.read_csv(matches, dtype=str)
    confirmed = dict(zip(mt[mt.status == "confirmed"].tdlr_project_number, mt[mt.status == "confirmed"].registry_site))
    probable = dict(zip(mt[mt.status == "probable"].tdlr_project_number, mt[mt.status == "probable"].registry_site))

    projects = {r["name"]: r for r in csv.DictReader((seed / "projects.csv").open())}
    entities = {r["llc_name"]: r for r in csv.DictReader((seed / "entities.csv").open())}
    missing = sorted({s for s in confirmed.values() if s not in projects})
    if missing:
        raise SystemExit(f"confirmed matches point at unknown registry sites: {missing} (run import_comptroller.py first)")

    td["_cost"] = pd.to_numeric(td["Estimated Cost (USD)"], errors="coerce").fillna(0)
    site_of: dict[str, str] = {}  # TDLR project number -> GridSight project name
    new_sites: dict[str, dict] = {}
    notes: list[str] = []

    # 1) confirmed registry matches
    for pn, site in confirmed.items():
        site_of[pn] = site

    # 2) new sites
    q = td[~td["Project Number"].isin(confirmed) & ~td["Project Number"].isin(EXCLUDE)
           & td["Work Type"].isin(NEW_SITE_WORK_TYPES) & (td["_cost"] >= NEW_SITE_MIN_COST)
           & (td["Registration Date"] >= NEW_SITE_SINCE)]
    groups: dict[tuple, list] = {}
    for _, r in q.iterrows():
        owner = clean_owner(r["Owner Name"]) or r["Owner Name"]
        groups.setdefault((display_name(owner).lower(), r["City"].strip().lower()), []).append(r)
    addr_to_site: dict[tuple, str] = {}
    for (_, _), rows in groups.items():
        rows = sorted(rows, key=lambda r: r["Registration Date"])
        place = rows[0]["City"] if rows[0]["City"] != "Unknown" else f"{rows[0]['County']} County"
        name = site_name([r["Project Name"] for r in rows], place)
        big = max(rows, key=lambda r: r["_cost"])
        owner = clean_owner(big["Owner Name"]) or display_name(big["Owner Name"])
        tenants = [tenant_org(r["Tenant Name"]) for r in rows]
        parent = known_company(*tenants) or known_company(owner)
        resolved_by = "TDLR_TENANT" if known_company(*tenants) else ("TDLR_OWNER" if parent else "")
        possible = sorted({probable[r["Project Number"]] for r in rows if r["Project Number"] in probable})
        new_sites[name] = {"owner": owner, "parent": parent, "resolved_by": resolved_by, "big": big, "possible": possible}
        for r in rows:
            site_of[r["Project Number"]] = name
            addr_to_site[(norm_addr(r["Address"]), r["City"].strip().lower())] = name
        if possible:
            notes.append(f"new site {name!r} may be registry site(s) {possible} (probable match; not merged)")
    # other records at the same street address join the new site
    for _, r in td.iterrows():
        pn = r["Project Number"]
        key = (norm_addr(r["Address"]), r["City"].strip().lower())
        if pn not in site_of and pn not in EXCLUDE and key in addr_to_site:
            site_of[pn] = addr_to_site[key]
            notes.append(f"{pn} ({r['Project Name']}) joins {addr_to_site[key]!r}: same address")

    # locations: largest record per site
    by_site: dict[str, list] = {}
    for _, r in td.iterrows():
        if r["Project Number"] in site_of:
            by_site.setdefault(site_of[r["Project Number"]], []).append(r)
    project_rows, entity_rows, parent_rows, event_rows = [], [], {}, []
    for site, rows in by_site.items():
        big = max(rows, key=lambda r: r["_cost"])
        # Location: the address used most often across the site's records, newest on ties
        # (one record can carry an owner-office address by mistake).
        counts = pd.Series([norm_addr(r["Address"]) for r in rows]).value_counts()
        top = [r for r in rows if counts[norm_addr(r["Address"])] == counts.max()]
        at = max(top, key=lambda r: r["Registration Date"])
        if len(counts) > 1:
            notes.append(f"{site!r}: records use {len(counts)} addresses; using {at['Address']!r}")
        addr = re.split(r",\s*[A-Za-z .]+,?\s*TX\b", at["Address"], flags=re.I)[0].strip()
        addr = re.sub(r"\s+(building|bldg|suite|ste|unit)\b.*$", "", addr, flags=re.I)
        loc = {"county": at["County"], "city": title(at["City"]) if at["City"] != "Unknown" else "", "address": addr, "lat": "", "lon": ""}
        if site in new_sites:
            s = new_sites[site]
            project_rows.append({"name": site, **loc, "llc_name": s["owner"]})
            entity_rows.append({"llc_name": s["owner"], "parent_name": s["parent"] or "", "resolved_by": s["resolved_by"],
                                "source_url": s["big"]["Source URL"]})
            if s["parent"]:
                parent_rows[s["parent"]] = next((c for _, p, c in KNOWN_COMPANIES if p == s["parent"]), OTHER_PARENT_COLOR)
        else:
            project_rows.append({**projects[site], **loc})
            # A TDLR tenant that is a known end-user company overrides the registry parent.
            t = known_company(*[tenant_org(r["Tenant Name"]) for r in rows])
            llc = projects[site]["llc_name"]
            if t and llc in entities and entities[llc]["parent_name"] != t:
                notes.append(f"{site!r}: parent {entities[llc]['parent_name']!r} -> {t!r} (TDLR tenant)")
                entity_rows.append({**entities[llc], "parent_name": t, "resolved_by": "TDLR_TENANT", "source_url": big["Source URL"]})
                parent_rows[t] = next((c for _, p, c in KNOWN_COMPANIES if p == t), OTHER_PARENT_COLOR)
        for r in rows:
            for e in events_for(r, retrieved):
                e["project_name"] = site
                event_rows.append(e)

    new_names = set(new_sites)
    updated_names = {p["name"] for p in project_rows}
    ent_names = {e["llc_name"] for e in entity_rows}
    existing_parents = {r["name"]: r for r in csv.DictReader((seed / "parents.csv").open())}
    pr = [{"name": p, "color_hex": existing_parents.get(p, {}).get("color_hex") or c} for p, c in parent_rows.items()]
    print("parents:  kept %d, wrote %d" % merge_csv(seed / "parents.csv", ["name", "color_hex"], pr, lambda r: r["name"] in parent_rows))
    print("entities: kept %d, wrote %d" % merge_csv(seed / "entities.csv", ["llc_name", "parent_name", "resolved_by", "source_url"],
                                                   entity_rows, lambda r: r["llc_name"] in ent_names))
    print("projects: kept %d, wrote %d" % merge_csv(seed / "projects.csv", ["name", "county", "city", "address", "lat", "lon", "llc_name"],
                                                   project_rows, lambda r: r["name"] in updated_names))
    print("events:   kept %d, wrote %d" % merge_csv(
        seed / "evidence_events.csv", ["ts", "project_name", "source", "event_type", "value_num", "payload_json", "source_url"],
        event_rows, lambda r: r["source"] == "TDLR" and f'"_origin": "{ORIGIN}"' in r["payload_json"]))

    n_conf = sum(1 for s in site_of.values() if s not in new_names)
    print(f"\n{len(site_of)} of {len(td)} TDLR records loaded: {n_conf} on {len(by_site) - len(new_sites)} registry sites, "
          f"{len(site_of) - n_conf} on {len(new_sites)} new sites; {len(td) - len(site_of)} left in the raw file only")
    for n in notes:
        print("  NOTE", n)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", required=True, type=Path)
    ap.add_argument("--matches", type=Path, default=MATCHES)
    a = ap.parse_args()
    main(a.file, SEED, a.matches)
