"""Indiana IEDC data-center sales-tax exemption contracts -> data/seed_states/in_iedc/ rows.

Source: the Indiana Economic Development Corporation Transparency Portal, "Search for Tax Credits,
Grants, and Loan Contracts" with Fund Type DATA (the data center sales tax exemption):
https://transparencyportal.iedc.in.gov/searchtaxgrantloancontracts . The portal's own search API
response is snapshotted in data/raw/in_iedc_data_contracts_<retrieved>.json with the request that
produced it.

Record -> rows (state_registry.py has the shared rules): one project per executed contract,
"<recipient> · <city>, IN", in the county IEDC lists, and one `certified` IN_IEDC event dated at the
contract date. The contract document (a scanned PDF on the portal) is the event's source link. A
contract IEDC hasn't executed ("pendingAcceptedOffer") is listed for review but not loaded. IEDC
gives no address, so no contract is attached to a mapped site.

Usage: python etl/import_in_iedc.py [--file data/raw/in_iedc_data_contracts_2026-09-26.json]
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import state_registry as sr

SOURCE, STATE, DIRNAME = "IN_IEDC", "IN", "in_iedc"
PORTAL = "https://transparencyportal.iedc.in.gov/searchtaxgrantloancontracts"
PDF_URL = "https://transparencyportal.iedc.in.gov/iedc-transparency-api/api/contract/{id}/pdf"
EXECUTED = {"executed", "postTermReportingPeriod"}
# The portal's county keys are camelCase; these two differ from the Census spelling.
COUNTY_NAMES = {"laPorte": "LaPorte", "stJoseph": "St. Joseph"}


def county(key: str) -> str:
    return COUNTY_NAMES.get(key, key[:1].upper() + key[1:])


def main(file: Path) -> None:
    snap = json.loads(file.read_text())
    contracts = snap["response"]["results"]
    known = sr.known_parents()
    sites = sr.mapped_sites(STATE)
    parents, entities, projects, events, review = {}, {}, [], [], []
    names = [f"{sr.display_name(c['companyName'])} · {c['city']}, {STATE}" for c in contracts]
    for c, name in zip(contracts, names):
        if names.count(name) > 1:
            name = f"{name} (IEDC {c['projectId']})"
        parent, parent_basis = sr.resolve_parent(c["companyName"], known)
        executed = c.get("contractStatus") in EXECUTED and c.get("contractDate")
        same_org = [s["name"] for s in sites if parent and s["parent"] == parent]
        review.append({"project_id": c["projectId"], "recipient": c["companyName"], "city": c["city"], "county": county(c["county"]),
                       "contract_date": c.get("contractDate") or "", "status": c.get("contractStatus"),
                       "organization": parent or "", "organization_basis": parent_basis,
                       "loaded": "own_project" if executed else "not loaded: contract not executed",
                       "match_basis": "IEDC publishes no address", "possible_mapped_duplicates": len(same_org),
                       "mapped_sites_same_org": " | ".join(same_org[:10])})
        if not executed:
            continue
        entity = f"{c['companyName']} (IN IEDC)"
        entities[entity] = {"llc_name": entity, "parent_name": parent or "", "resolved_by": "STATE_REGISTRY" if parent else "",
                            "source_url": PORTAL if parent else ""}
        if parent:
            parents[parent] = sr.parent_color(parent)
        projects.append({"name": name, "state": STATE, "county": county(c["county"]), "city": c["city"], "address": "",
                         "lat": "", "lon": "", "llc_name": entity})
        payload = {"program": "Indiana data center sales tax exemption (IEDC fund type DATA)", "company": c["companyName"],
                   "iedc_project_id": c["projectId"], "contract_date": c["contractDate"], "contract_status": c["contractStatus"],
                   "expected_investment_usd": c.get("expectedInvestment"), "actual_investment_usd": c.get("actualInvestment"),
                   "certified_to_date_usd": c.get("certifiedToDate"), "contract_end_jobs": c.get("contractEndJobs"),
                   "city": c["city"], "county": county(c["county"]), "portal_url": PORTAL,
                   "retrieved": snap.get("retrieved"), "document": "scanned contract PDF (no text layer)" if c.get("hasPdf") else None}
        events.append({"ts": c["contractDate"], "project_name": name, "source": SOURCE, "event_type": "certified", "value_num": "",
                       "payload_json": json.dumps(payload), "source_url": PDF_URL.format(id=c["id"]) if c.get("hasPdf") else PORTAL})
    out = sr.write_outputs(DIRNAME, parents, entities, projects, events, review, "in_iedc_review.csv")
    print(f"{len(contracts)} DATA contracts -> {len(projects)} projects (executed), {len(events)} certified events, "
          f"{sum(1 for r in review if r['organization'])} with an organization -> {out.relative_to(sr.ROOT)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file", type=Path, default=sorted(sr.RAW.glob("in_iedc_data_contracts_*.json"))[-1])
    main(ap.parse_args().file)
