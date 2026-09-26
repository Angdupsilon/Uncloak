"""Export public TDLR TABS projects whose project or facility name contains "data center".

The TDLR site exposes a server-side DataTables search endpoint but no bulk-download
button for Architectural Barriers projects. This script queries that public endpoint,
deduplicates project/facility-name matches, and fetches the official detail page for
each result.

Usage:
  python etl/pull_tdlr_data_centers.py --output data/raw/tdlr_data_centers_YYYY-MM-DD.csv
"""
from __future__ import annotations

import argparse
import csv
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path

import httpx
from lxml import html

BASE = "https://www.tdlr.texas.gov"
SEARCH_URL = f"{BASE}/TABS/Search/SearchProjects"
DETAIL_URL = f"{BASE}/TABS/Search/Project/{{project_number}}"
USER_AGENT = "GridSight public-record research (contact via repository maintainer)"
PAGE_SIZE = 100
_THREAD = threading.local()


def client() -> httpx.Client:
    if not hasattr(_THREAD, "client"):
        _THREAD.client = httpx.Client(
            follow_redirects=True,
            timeout=30,
            headers={"User-Agent": USER_AGENT},
        )
    return _THREAD.client


def search(field: str) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        form = {
            "draw": "1",
            "start": str(start),
            "length": str(PAGE_SIZE),
            field: "data center",
            "order[0][column]": "3",
            "order[0][dir]": "desc",
        }
        response = client().post(SEARCH_URL, data=form)
        response.raise_for_status()
        payload = response.json()
        page = payload["data"]
        rows.extend(page)
        start += len(page)
        if not page or start >= int(payload["recordsFiltered"]):
            return rows


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def section_pairs(root, class_name: str) -> dict[str, list[str]]:
    nodes = root.xpath(f'//div[contains(concat(" ", normalize-space(@class), " "), " {class_name} ")]')
    if not nodes:
        return {}
    result: dict[str, list[str]] = {}
    for dl in nodes[0].xpath(".//dl"):
        key = None
        for child in dl:
            if child.tag == "dt":
                key = clean(child.text_content()).rstrip(":")
                result.setdefault(key, [])
            elif child.tag == "dd" and key:
                result[key].append(clean(child.text_content()))
    if not result:
        paragraphs = [clean(p.text_content()) for p in nodes[0].xpath(".//p")]
        if paragraphs:
            result["value"] = paragraphs
    return result


def first(pairs: dict[str, list[str]], key: str) -> str:
    values = pairs.get(key, [])
    return values[0] if values else ""


def joined(pairs: dict[str, list[str]], key: str) -> str:
    return "; ".join(v for v in pairs.get(key, []) if v)


def number(value: str) -> str:
    match = re.search(r"[\d,]+", value or "")
    return match.group(0).replace(",", "") if match else ""


def iso_date(value: str) -> str:
    if not value:
        return ""
    for fmt in ("%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return value


def fetch_detail(summary: dict) -> dict:
    project_number = summary["ProjectNumber"]
    url = DETAIL_URL.format(project_number=project_number)
    last_error = None
    for attempt in range(3):
        try:
            response = client().get(url)
            response.raise_for_status()
            root = html.fromstring(response.text)
            project = section_pairs(root, "project-details-project")
            owner = section_pairs(root, "project-details-owner")
            tenant = section_pairs(root, "project-details-tenant")
            designer = section_pairs(root, "project-details-designer")
            header_nodes = root.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " project-details-header ")]')
            header = clean(" ".join(header_nodes[0].itertext())) if header_nodes else ""
            reg_match = re.search(r"Registration Date:\s*([0-9/]+)", header)
            return {
                "project_number": project_number,
                "registration_date": iso_date(reg_match.group(1) if reg_match else summary.get("ProjectCreatedOn", "")[:10]),
                "project_name": first(project, "Project Name") or summary.get("ProjectName", ""),
                "facility_name": first(project, "Facility Name") or summary.get("FacilityName", ""),
                "location_address": joined(project, "Location Address"),
                "county": first(project, "Location County"),
                "start_date": iso_date(first(project, "Start Date")),
                "completion_date": iso_date(first(project, "Completion Date")),
                "estimated_cost_usd": number(first(project, "Estimated Cost")),
                "work_type": first(project, "Type of Work"),
                "funding_type": first(project, "Type of Funds"),
                "scope_of_work": first(project, "Scope of Work"),
                "square_footage": number(first(project, "Square Footage")),
                "private_funds_from_tenant": first(project, "Are the private funds provided by the tenant?"),
                "status": first(project, "Current Status"),
                "owner_name": first(owner, "Owner Name"),
                "owner_address": joined(owner, "Owner Address"),
                "tenant_name": first(tenant, "Tenant Name") or first(tenant, "value"),
                "design_firm_name": first(designer, "Design Firm Name"),
                "source_url": url,
                "retrieved": date.today().isoformat(),
            }
        except Exception as exc:  # retry transient public-site failures, report final failures
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{project_number}: {last_error}")


def main(output: Path, workers: int) -> None:
    matches: dict[str, dict] = {}
    for field in ("ProjectName", "FacilityName"):
        found = search(field)
        print(f"{field}: {len(found)} search matches", flush=True)
        for row in found:
            matches[row["ProjectNumber"]] = row
    print(f"{len(matches)} distinct projects; fetching details", flush=True)

    rows: list[dict] = []
    failures: list[str] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch_detail, row): number for number, row in matches.items()}
        for completed, future in enumerate(as_completed(futures), 1):
            try:
                rows.append(future.result())
            except Exception as exc:
                failures.append(str(exc))
            if completed % 25 == 0 or completed == len(futures):
                print(f"details: {completed}/{len(futures)}", flush=True)

    rows.sort(key=lambda row: (row["registration_date"], row["project_number"], row["project_name"]))
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows to {output}", flush=True)
    if failures:
        failure_path = output.with_suffix(".failures.txt")
        failure_path.write_text("\n".join(failures) + "\n")
        print(f"WARNING: {len(failures)} failures in {failure_path}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    main(args.output, max(1, min(args.workers, 8)))
