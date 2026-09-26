"""Wisconsin certified qualified data centers -> data/seed_states/wi_dor/ rows.

Source: Wisconsin Department of Revenue, "Qualified Data Center Exemption" FAQ, "Which qualified data
centers have been certified in Wisconsin?" (certification is by WEDC under sec. 238.40, Wis. Stats.):
https://www.revenue.wi.gov/Pages/FAQS/ExemptionforQualifiedDataCenter.aspx . The page (snapshotted
in data/raw/wi_dor/) lists business entity, certification date, geographic location(s) and a
description of the building(s).

Record -> rows (state_registry.py has the shared rules): one project per certified data center,
"<business entity> · <city>, WI", and one `certified` WI_DOR event dated at the certification date.
A location with a house number is an address: it is geocoded (Census) and the record attaches to a
mapped site only on a confirmed match. A street name alone ("90th Street") is not an address.

  python etl/import_wi_dor.py --html data/raw/wi_dor/qualified_data_center_faq_2026-09-26.html   # re-read the page
  python etl/import_wi_dor.py                                                                      # CSV -> seed rows
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime
from pathlib import Path

import state_registry as sr

SOURCE, STATE, DIRNAME = "WI_DOR", "WI", "wi_dor"
CSV = sr.RAW / "wi_dor_qualified_data_centers_2026-09-26.csv"
PAGE_URL = "https://www.revenue.wi.gov/Pages/FAQS/ExemptionforQualifiedDataCenter.aspx"
HEADER = ["business_entity", "certification_date", "location", "description", "city", "address", "lat", "lon", "list_as_of"]


def read_html(path: Path) -> list[dict]:
    from geocode import census

    t = path.read_text(encoding="utf-8")
    as_of = re.search(r"As of ([A-Z][a-z]+ \d{1,2}, \d{4})", html.unescape(re.sub(r"<[^>]+>", " ", t)))
    as_of = datetime.strptime(as_of.group(1), "%B %d, %Y").date().isoformat() if as_of else ""
    table = re.findall(r"<table.*?</table>", t, re.S)[0]
    rows = []
    for tr in re.findall(r"<tr.*?</tr>", table, re.S)[1:]:
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<br\s*/?>", " / ", re.sub(r"<(?!br)[^>]+>", "", c)))).strip(" /")
                 for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        entity, date, location, desc = cells
        street, city = [x.strip() for x in location.rsplit("/", 1)] if "/" in location else ("", location)
        city = re.sub(r",\s*WI$", "", city)
        # An address needs a house number: from the location, or the first one the description lists.
        # "90th Street" starts with an ordinal, not a house number.
        has_number = bool(re.match(r"^\d+\s", street))
        number = None if has_number else re.search(r"\b(\d{2,5})(?:,| and)", desc)
        address = street if has_number else (f"{number.group(1)} {street}" if number and street else "")
        rows.append({"business_entity": entity, "certification_date": datetime.strptime(date, "%m/%d/%Y").date().isoformat(),
                     "location": location, "description": desc, "city": city, "address": address, "lat": "", "lon": "",
                     "list_as_of": as_of})
    todo = [(i, r["address"], r["city"], None, STATE) for i, r in enumerate(rows) if r["address"]]
    for i, (lat, lon) in census(todo).items():
        rows[i]["lat"], rows[i]["lon"] = round(lat, 6), round(lon, 6)
    return rows


def main(page: Path | None) -> None:
    if page:
        rows = read_html(page)
        sr.write_csv(CSV, HEADER, rows)
        print(f"read {len(rows)} certified data centers from {page.name} -> {CSV.relative_to(sr.ROOT)}")
    rows = sr.read(CSV)
    known = sr.known_parents()
    sites = sr.mapped_sites(STATE)
    parents, entities, projects, events, review = {}, {}, [], [], []
    for r in rows:
        company = r["business_entity"].split(" / ")[0]
        name = f"{sr.display_name(company)} · {r['city']}, {STATE}"
        parent, parent_basis = sr.resolve_parent(company, known)
        entity = f"{company} (WI DOR)"
        entities[entity] = {"llc_name": entity, "parent_name": parent or "", "resolved_by": "STATE_REGISTRY" if parent else "",
                            "source_url": PAGE_URL if parent else ""}
        if parent:
            parents[parent] = sr.parent_color(parent)
        site, match_basis = sr.confirmed_site(parent, r["lat"], r["lon"], sites, r["address"])
        target = site["name"] if site else name
        if not site:
            projects.append({"name": name, "state": STATE, "county": "", "city": r["city"], "address": r["address"],
                             "lat": r["lat"], "lon": r["lon"], "llc_name": entity})
        payload = {"program": "Wisconsin qualified data center sales and use tax exemption", "company": r["business_entity"],
                   "certification_date": r["certification_date"], "location": r["location"], "description": r["description"],
                   "list_as_of": r["list_as_of"], "address_used": r["address"] or None,
                   "matched_site_basis": match_basis if site else None}
        events.append({"ts": r["certification_date"], "project_name": target, "source": SOURCE, "event_type": "certified",
                       "value_num": "", "payload_json": json.dumps(payload), "source_url": PAGE_URL})
        same_org = [s["name"] for s in sites if parent and s["parent"] == parent]
        review.append({"business_entity": r["business_entity"], "certification_date": r["certification_date"], "city": r["city"],
                       "organization": parent or "", "organization_basis": parent_basis,
                       "status": "attached_to_mapped_site" if site else "own_project", "project": target, "match_basis": match_basis,
                       "possible_mapped_duplicates": len(same_org), "mapped_sites_same_org": " | ".join(same_org[:10])})
    out = sr.write_outputs(DIRNAME, parents, entities, projects, events, review, "wi_dor_review.csv")
    print(f"{len(rows)} certified -> {len(projects)} projects, {len(events)} certified events -> {out.relative_to(sr.ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--html", type=Path, help="re-read the DOR FAQ page snapshot")
    main(ap.parse_args().html)
