"""Minnesota DEED qualified data centers -> data/seed_states/mn_deed/ rows.

Source: Minnesota Department of Employment and Economic Development, "List of Designated Qualified
Data Centers" (the sales-tax refund program, Minn. Stat. 297A.68 subd. 42), linked from
https://mn.gov/deed/business/financing-business/tax-credits/data-center-credit/ . The list (a one-page
PDF titled "Data Center Sales Tax Refund Projects", dated 7/15/2026) gives each data center's name,
company, city, type (new or refurbished) and status.

Record -> rows (state_registry.py has the shared rules): one project per listed data center,
"<data center name> · <city>, MN", with the listed company as its registered entity, and one
`certified` MN_DEED event. The list publishes no certification dates, so each event is dated at the
list's own date: DEED listed the site as certified by then. It publishes no addresses, so no record
is attached to a mapped site; possible duplicates are listed in data/raw/mn_deed_review.csv.

  python etl/import_mn_deed.py --pdf data/raw/mn_deed/data-center-project-list_2026-07-15.pdf   # re-read the list
  python etl/import_mn_deed.py                                                                   # CSV -> seed rows
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import state_registry as sr

SOURCE, STATE, DIRNAME = "MN_DEED", "MN", "mn_deed"
CSV = sr.RAW / "mn_deed_qualified_data_centers_2026-09-26.csv"
LIST_URL = "https://mn.gov/deed/assets/data-center-project-list_tcm1045-531119.pdf"
PAGE_URL = "https://mn.gov/deed/business/financing-business/tax-credits/data-center-credit/"
LIST_DATE = "2026-07-15"
ALIASES: dict[str, str] = {}
HEADER = ["data_center_name", "company", "city", "type", "status", "list_date"]


def read_pdf(pdf: Path) -> list[dict]:
    import pdfplumber

    rows = []
    with pdfplumber.open(pdf) as doc:
        for table in doc.pages[0].extract_tables():
            for r in table:
                cells = [(c or "").replace("\n", " ").strip() for c in r]
                if len(cells) == 5 and cells[4] in {"Certified", "Pending", "Approved"} and cells[0]:
                    rows.append(dict(zip(HEADER, cells + [LIST_DATE])))
    return rows


def main(pdf: Path | None) -> None:
    if pdf:
        rows = read_pdf(pdf)
        sr.write_csv(CSV, HEADER, rows)
        print(f"read {len(rows)} data centers from {pdf.name} -> {CSV.relative_to(sr.ROOT)}")
    rows = [r for r in sr.read(CSV) if r["status"] == "Certified"]
    known = sr.known_parents()
    sites = sr.mapped_sites(STATE)
    parents, entities, projects, events, review = {}, {}, [], [], []
    for r in rows:
        name = f"{r['data_center_name']} · {r['city']}, {STATE}"
        parent, parent_basis = sr.resolve_parent(r["company"], known, ALIASES)
        entity = f"{r['company']} (MN DEED)"
        entities[entity] = {"llc_name": entity, "parent_name": parent or "", "resolved_by": "STATE_REGISTRY" if parent else "",
                            "source_url": LIST_URL if parent else ""}
        if parent:
            parents[parent] = sr.parent_color(parent)
        projects.append({"name": name, "state": STATE, "county": "", "city": r["city"], "address": "", "lat": "", "lon": "",
                         "llc_name": entity})
        payload = {"program": "Minnesota qualified data center sales tax exemption", "data_center_name": r["data_center_name"],
                   "company": r["company"], "city": r["city"], "type": r["type"], "status": r["status"],
                   "list_date": r["list_date"], "date_precision": "certification date not published; dated at the list's date",
                   "list_page_url": PAGE_URL}
        events.append({"ts": r["list_date"], "project_name": name, "source": SOURCE, "event_type": "certified",
                       "value_num": "", "payload_json": json.dumps(payload), "source_url": LIST_URL})
        same_org = [s["name"] for s in sites if parent and s["parent"] == parent]
        review.append({"data_center_name": r["data_center_name"], "company": r["company"], "city": r["city"],
                       "organization": parent or "", "organization_basis": parent_basis, "status": "own_project",
                       "match_basis": "the list states no address", "possible_mapped_duplicates": len(same_org),
                       "mapped_sites_same_org": " | ".join(same_org[:10])})
    out = sr.write_outputs(DIRNAME, parents, entities, projects, events, review, "mn_deed_review.csv")
    print(f"{len(rows)} certified data centers -> {len(projects)} projects, {len(events)} certified events, "
          f"{sum(1 for r in review if r['organization'])} with an organization -> {out.relative_to(sr.ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", type=Path, help="re-read DEED's list PDF")
    main(ap.parse_args().pdf)
