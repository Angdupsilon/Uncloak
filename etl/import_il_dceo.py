"""Illinois DCEO Data Center Investment Program -> data/seed_states/il_dceo/ rows.

Source: DCEO's annual Data Center Investment Reports (20 ILCS 605/605-1025), "Reports Required by
Statute": https://dceo.illinois.gov/aboutdceo/reportsrequiredbystatute.html. Each report lists every
data center owner or operator with a signed MOU and tax-exemption certificate to date. The 2025
report (34 MOUs through 2025-12-31) is the cumulative list; the 2021-2024 reports were checked against
it (data/raw/README.md).

Record -> rows (state_registry.py has the shared rules):
  one project per MOU, "<company> · <city>, IL"; the report gives the city, not an address, except
  where its amendment section states one (ADDRESSES below, quoted). A stated address is geocoded
  (Census) and the record attaches to a mapped site only on a confirmed match.
  one `certified` IL_DCEO event per MOU, dated 31 December of the MOU year: the report gives the year
  only, so the event is never dated before the MOU could have been signed. The investment commitment,
  DCEO's estimated tax benefit (6.25% of the commitment, DCEO's own figure), new jobs and the
  underserved-area flag are kept in the payload as published.

  python etl/import_il_dceo.py --pdf data/raw/il_dceo_reports/2025-data-centers-annual-report.pdf   # re-read the report
  python etl/import_il_dceo.py                                                                         # CSV -> seed rows
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import state_registry as sr

SOURCE, STATE, DIRNAME = "IL_DCEO", "IL", "il_dceo"
CSV = sr.RAW / "il_dceo_data_centers_2026-09-26.csv"
REPORT_URL = ("https://dceo.illinois.gov/content/dam/soi/en/web/dceo/aboutdceo/reportsrequiredbystatute/"
              "2025-data-centers-annual-report.pdf")
PAGE_URL = "https://dceo.illinois.gov/aboutdceo/reportsrequiredbystatute.html"
# Brand abbreviations written in the published company text.
ALIASES = {"(QTS)": "Quality Technology Services", "T5@Chicago": "T5 Data Centers", "(CenterSquare": "Centersquare",
           "NTT Global": "NTT"}
# Facility addresses the 2025 report itself states (section 5, amendments approved in 2025).
ADDRESSES = {
    ("Digital Realty Trust, LP", "Franklin Park"): (
        "9401 West Grand Avenue",
        "existing data center campus that includes 9333, 9355, 9377, and 9401 West Grand Avenue and 2550 South Martens Street"),
    ("Elk Grove Village Property LLC (Phase 1)", "Elk Grove Village"): (
        "1650 Higgins Road",
        "The official address for the facility has been revised from 1701 Midway Court, Elk Grove Village, Illinois 60007 to 1650 Higgins Road"),
}
# Differences between reports for the same MOU (the 2025 figures are used).
REPORT_NOTES = {
    ("Digital Realty Trust, LP", "2021", "Elk Grove Village"): "2021 report lists the commitment as $280,608,348",
    ("Aligned Data Centers", "2021", "Northlake"): "2024 report lists the commitment as $252,000,000",
}
HEADER = ["company", "mou_year", "site_location", "investment_commitment_usd", "est_tax_benefits_usd", "new_jobs",
          "underserved", "report_page", "address_from_report", "address_quote", "lat", "lon", "note"]


def money(s: str) -> int:
    return int(re.sub(r"[^\d]", "", s))


def read_pdf(pdf: Path) -> list[dict]:
    import pdfplumber
    from geocode import census

    rows = []
    with pdfplumber.open(pdf) as doc:
        for page_no, page in enumerate(doc.pages, start=1):
            for table in page.extract_tables():
                for r in table:
                    cells = [(c or "").replace("\n", " ").strip() for c in r]
                    if len(cells) == 7 and re.fullmatch(r"20\d\d", cells[1]) and cells[3].startswith("$"):
                        company, year, city = cells[0], cells[1], cells[2]
                        addr, quote = ADDRESSES.get((company, city), ("", ""))
                        rows.append({"company": company, "mou_year": year, "site_location": city,
                                     "investment_commitment_usd": money(cells[3]), "est_tax_benefits_usd": money(cells[4]),
                                     "new_jobs": int(cells[5]), "underserved": cells[6], "report_page": page_no,
                                     "address_from_report": addr, "address_quote": quote, "lat": "", "lon": "",
                                     "note": REPORT_NOTES.get((company, year, city), "")})
    todo = [(i, r["address_from_report"], r["site_location"], None, STATE) for i, r in enumerate(rows) if r["address_from_report"]]
    for i, (lat, lon) in census(todo).items():
        rows[i]["lat"], rows[i]["lon"] = round(lat, 6), round(lon, 6)
    return rows


def main(pdf: Path | None) -> None:
    if pdf:
        rows = read_pdf(pdf)
        sr.write_csv(CSV, HEADER, rows)
        print(f"read {len(rows)} MOUs from {pdf.name} -> {CSV.relative_to(sr.ROOT)}")
    rows = sr.read(CSV)
    known = sr.known_parents()
    sites = sr.mapped_sites(STATE)
    names = [f"{sr.display_name(r['company'])} · {r['site_location']}, {STATE}" for r in rows]
    parents, entities, projects, events, review = {}, {}, [], [], []
    for r, name in zip(rows, names):
        if names.count(name) > 1:
            name = f"{name} (MOU {r['mou_year']})"
        parent, parent_basis = sr.resolve_parent(r["company"], known, ALIASES)
        entity = f"{r['company']} (IL DCEO)"
        entities[entity] = {"llc_name": entity, "parent_name": parent or "", "resolved_by": "STATE_REGISTRY" if parent else "",
                            "source_url": REPORT_URL if parent else ""}
        if parent:
            parents[parent] = sr.parent_color(parent)
        site, match_basis = sr.confirmed_site(parent, r["lat"], r["lon"], sites)
        target = site["name"] if site else name
        if not site:
            projects.append({"name": name, "state": STATE, "county": "", "city": r["site_location"],
                             "address": r["address_from_report"], "lat": r["lat"], "lon": r["lon"], "llc_name": entity})
        payload = {"program": "Illinois Data Center Investment Program", "company": r["company"], "mou_year": int(r["mou_year"]),
                   "date_precision": "year: dated 31 December of the MOU year", "site_location": r["site_location"],
                   "investment_commitment_usd": int(r["investment_commitment_usd"]),
                   "est_tax_benefits_usd": int(r["est_tax_benefits_usd"]), "est_tax_benefits_basis": "DCEO estimate, 6.25% of the commitment",
                   "new_jobs": int(r["new_jobs"]), "underserved_area": r["underserved"] == "Y",
                   "report": "Data Center Investment Program 2025 Annual Report", "report_page": int(r["report_page"]),
                   "report_list_url": PAGE_URL, "address_from_report": r["address_from_report"] or None,
                   "matched_site_basis": match_basis if site else None}
        if r["note"]:
            payload["report_note"] = r["note"]
        events.append({"ts": f"{r['mou_year']}-12-31", "project_name": target, "source": SOURCE, "event_type": "certified",
                       "value_num": "", "payload_json": json.dumps(payload), "source_url": REPORT_URL})
        same_org = [s["name"] for s in sites if parent and s["parent"] == parent]
        review.append({"company": r["company"], "mou_year": r["mou_year"], "city": r["site_location"],
                       "organization": parent or "", "organization_basis": parent_basis,
                       "status": "attached_to_mapped_site" if site else "own_project", "project": target,
                       "match_basis": match_basis, "possible_mapped_duplicates": len(same_org),
                       "mapped_sites_same_org": " | ".join(same_org[:10]) + (" | ..." if len(same_org) > 10 else "")})
    out = sr.write_outputs(DIRNAME, parents, entities, projects, events, review, "il_dceo_review.csv")
    print(f"{len(rows)} MOUs -> {len(projects)} projects, {len(events)} certified events "
          f"({sum(r['status'] == 'attached_to_mapped_site' for r in review)} on mapped sites), "
          f"{sum(1 for r in review if r['organization'])} with an organization -> {out.relative_to(sr.ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", type=Path, help="re-read the MOU table from a DCEO annual report PDF")
    main(ap.parse_args().pdf)
