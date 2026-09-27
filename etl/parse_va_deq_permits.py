"""Read manually downloaded Virginia DEQ data-center air-permit PDFs.

The DEQ download endpoint returns 403 to scripted requests.  This script never downloads a
document: it only reads PDFs a reviewer has already saved in
``data/raw/va_deq_permits_2026-09-26/``.  A document is attributed to a DEQ-list row only when
both its registration-number stem and its issue date identify one row.  It intentionally leaves
an uncertain fact blank and describes the reason in ``va_deq_permit_parse_review.csv``.

The details CSV is consumed by ``import_va_deq_air.py``.  ``detail_source`` records the permit
page for each fact; coordinates derived from a stated address additionally cite the Census
geocoder.  The parser does not retain permit addressee/contact names.

Usage:
  python etl/parse_va_deq_permits.py
  python etl/parse_va_deq_permits.py --no-geocode
"""
from __future__ import annotations

import argparse
import csv
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
PDF_DIR = RAW / "va_deq_permits_2026-09-26"
DETAILS = RAW / "va_deq_permit_details.csv"
REVIEW = RAW / "va_deq_permit_parse_review.csv"
DETAIL_HEADER = ["permit_no", "facility_address", "lat", "lon", "generator_count", "generator_mw_total", "detail_source", "reviewed_by"]
REVIEW_HEADER = ["filename", "registration_no_in_pdf", "issue_date_in_pdf", "permit_no", "status", "basis", "detail_source"]
CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/locations/addressbatch"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, header: list[str], rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=header, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def norm_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def page_texts(path: Path) -> list[str]:
    """Return the text of each PDF page, retaining page positions for citations."""
    with pdfplumber.open(path) as pdf:
        if not pdf.pages:
            raise ValueError("PDF has zero pages")
        return [page.extract_text() or "" for page in pdf.pages]


def registration(text: str) -> str:
    match = re.search(r"Registration\s*(?:Number|No\.?|#)?\s*[:#]?\s*(?:PRO-)?(\d{4,6})\b", text, re.I)
    return match.group(1) if match else ""


def permit_date(text: str) -> str:
    # DEQ uses both "April 24, 2024" and 07/02/2026 forms on its permit covers.
    for match in re.finditer(r"\b([A-Z][a-z]+\s+\d{1,2},\s*20\d{2})\b", text):
        try:
            return datetime.strptime(match.group(1).replace("  ", " "), "%B %d, %Y").date().isoformat()
        except ValueError:
            pass
    for match in re.finditer(r"\b(\d{1,2}/\d{1,2}/20\d{2})\b", text):
        try:
            return datetime.strptime(match.group(1), "%m/%d/%Y").date().isoformat()
        except ValueError:
            pass
    return ""


def page_refs(values: list[tuple[int, str]], label: str) -> str:
    pages = ", ".join(f"p. {n}" for n, _ in values)
    return f"{label}: DEQ permit {pages}" if pages else ""


COORD_RE = re.compile(r"\b([34]\d\.\d{4,})\s*[,;]\s*(-?7[5-9]\.\d{4,})\b")
STREET_RE = re.compile(
    r"\b(\d{1,6}\s+[A-Za-z0-9 .'-]{2,90}?(?:Road|Rd\.?|Street|St\.?|Drive|Dr\.?|Avenue|Ave\.?|"
    r"Boulevard|Blvd\.?|Lane|Ln\.?|Way|Parkway|Pkwy\.?|Court|Ct\.?|Circle|Circle|Highway|Hwy\.?))"
    r"\s*(?:,|\n)\s*([A-Za-z .'-]{2,60}),?\s*VA\s*(\d{5}(?:-\d{4})?)\b",
    re.I,
)


def extract_location(pages: list[str]) -> tuple[str, str, str, list[str]]:
    """Return address, lat, lon and page-cited facts.

    An address is retained only when a full Virginia street/city/ZIP appears on a permit page.
    A recipient address can occur on a cover letter, so a street on a page is preferred only when
    the nearby text says "located at", "facility", or "stationary source permit".  Otherwise it
    is held for review rather than guessing that it is the facility.
    """
    coords: list[tuple[int, str]] = []
    address_hits: list[tuple[int, str]] = []
    review: list[str] = []
    for number, text in enumerate(pages, 1):
        for match in COORD_RE.finditer(text):
            lat, lon = match.groups()
            coords.append((number, f"{lat},{lon}"))
        for match in STREET_RE.finditer(text):
            address = f"{norm_space(match.group(1))}, {norm_space(match.group(2))}, VA {match.group(3)}"
            nearby = text[max(0, match.start() - 500):match.end() + 250].lower()
            if any(key in nearby for key in ("located at", "facility", "stationary source permit")):
                address_hits.append((number, address))

    unique_coords = {(value, page) for page, value in coords}
    if len({value for value, _ in unique_coords}) > 1:
        review.append("multiple coordinate pairs in permit; none selected")
        lat = lon = ""
    elif unique_coords:
        value, _page = next(iter(unique_coords))
        lat, lon = value.split(",")
    else:
        lat = lon = ""

    unique_addresses = {(value, page) for page, value in address_hits}
    addresses = {value for value, _ in unique_addresses}
    if len(addresses) > 1:
        review.append("multiple facility-address candidates in permit; none selected")
        address = ""
    elif addresses:
        address = next(iter(addresses))
    else:
        address = ""

    sources = []
    if address:
        sources.append(page_refs([(page, value) for value, page in unique_addresses], "facility_address"))
    if lat and lon:
        sources.append(page_refs([(page, value) for value, page in unique_coords], "coordinates"))
    return address, lat, lon, sources + review


def count_ranges(value: str) -> int | None:
    """Count a simple DEQ reference range (EG1-EG3 or 1 through 1,332)."""
    value = value.replace("–", "-").replace("—", "-")
    numbers = [int(n.replace(",", "")) for n in re.findall(r"\d{1,3}(?:,\d{3})*", value)]
    if "through" in value.lower() or "-" in value:
        if len(numbers) >= 2 and numbers[-1] >= numbers[0]:
            return numbers[-1] - numbers[0] + 1
    return None


def extract_equipment(pages: list[str]) -> tuple[str, str, list[str], list[str]]:
    """Extract only a complete, unambiguous table row with count and kW each.

    The DEQ packets contain both equipment tables and later references to those same units.  Only
    pages labelled Equipment List/Emission Units are considered.  A range is accepted only when
    its count and per-unit kW appear on the same table page.  Mixed-capacity rows (for example
    "2500 or 2250 kW") are held for review.
    """
    rows: list[tuple[int, int, float]] = []
    review: list[str] = []
    expected_total = None
    for text in pages:
        total_match = re.search(r"consisting of\s+(\d{1,5})\s+engine[- ]generator sets", text, re.I)
        if total_match:
            expected_total = int(total_match.group(1))
            break
    for number, text in enumerate(pages, 1):
        lower = text.lower()
        if not ("equipment list" in lower or "emission units" in lower):
            continue
        if re.search(r"\b[\d,]{3,5}\s*(?:e|m)?kw.{0,180}\bor\b.{0,180}[\d,]{3,5}\s*(?:e|m)?kw\b", lower, re.S):
            review.append(f"p. {number} has an alternative generator capacity")
            continue
        # DEQ's rows consistently put the table's unit count in parentheses: "Fifteen (15)"
        # or "1 through (1,332)".  Read that printed count rather than attempting to infer
        # counts from repeated later permit-condition references.
        for match in re.finditer(
            r"\(([\d,]{1,5})\)\s+(?:[\s\S]{0,420}?)"
            r"([\d,]{3,5})\s*(?:e|m)?kW(?:e)?\b",
            text,
            re.I | re.S,
        ):
            count = int(match.group(1).replace(",", ""))
            if count:
                rows.append((number, count, int(match.group(2).replace(",", "")) / 1000))

    # There is one extraction pattern.  Do not de-duplicate equal count/capacity pairs: a table
    # can legitimately have two distinct two-generator rows at the same 1.5 MW rating.
    unique = rows
    if not unique:
        return "", "", [], review + ["no complete unambiguous generator equipment row parsed"]
    if review:
        return "", "", [], review
    count = sum(r[1] for r in unique)
    # A multi-row table may have OCR-extracted only some rows.  It is complete only if its
    # separately stated facility total agrees.  A one-row table is complete only if no second
    # uncounted generator-set description appears on the page.
    table_pages = {page for page, _, _ in unique}
    if expected_total is not None and expected_total != count:
        return "", "", [], [f"parsed equipment count {count} disagrees with the permit's stated {expected_total} engine-generator sets"]
    declares_complete = any("equipment at this facility" in pages[page - 1].lower() and "consists" in pages[page - 1].lower()
                            for page in table_pages)
    if expected_total is None and len(unique) == 1:
        page = pages[next(iter(table_pages)) - 1].lower()
        if len(re.findall(r"(?:engine[- ]?generator|generator)[ -]?sets?", page)) > 1 or re.search(r"\b(?:eg|gen)\d+\b", page):
            return "", "", [], ["equipment table has an additional uncounted generator row"]
    if expected_total is None and len(unique) > 1 and not declares_complete:
        return "", "", [], ["multi-row equipment table has no independently stated total to check extraction completeness"]
    mw = sum(r[1] * r[2] for r in unique)
    evidence = "; ".join(f"p. {page}: {n} x {capacity:g} MW" for page, n, capacity in unique)
    return str(count), f"{mw:.6f}".rstrip("0").rstrip("."), [f"generator_count and generator_mw_total: DEQ permit {evidence}"], []


def identify_document(pages: list[str], by_stem: dict[str, list[dict[str, str]]]) -> tuple[str, str, str]:
    first = "\n".join(pages[:5])
    stem = registration(first)
    issued = permit_date(first)
    candidates = by_stem.get(stem, [])
    if not stem:
        return "", stem, "permit PDF has no readable registration number"
    if not issued:
        return "", stem, "permit PDF has no readable issue date"
    exact = [row for row in candidates if row["issue_date"] == issued]
    if len(exact) == 1:
        return exact[0]["registration_no"], stem, ""
    if not candidates:
        return "", stem, "registration number is not in the DEQ list"
    return "", stem, "registration number/date do not identify exactly one DEQ-list row"


def geocode(rows: list[dict[str, object]]) -> list[str]:
    """Geocode stated addresses using the Census batch endpoint, never a place centroid."""
    from geocode import census

    todo = []
    row_index: dict[int, dict[str, object]] = {}
    for index, row in enumerate(rows):
        if row["facility_address"] and not row["lat"]:
            address = str(row["facility_address"])
            street, city, _state_zip = address.split(", ", 2)
            todo.append((index, street, city, None, "VA"))
            row_index[index] = row
    found = census(todo)
    failures = []
    for index, row in row_index.items():
        if index not in found:
            failures.append(f"{row['permit_no']}: Census gave no exact address-level match")
            continue
        lat, lon = found[index]
        row["lat"], row["lon"] = f"{lat:.6f}", f"{lon:.6f}"
        row["detail_source"] = "; ".join(filter(None, [str(row["detail_source"]), f"coordinates: U.S. Census Geocoder exact address match ({CENSUS_GEOCODER})"]))
    return failures


def main(pdf_dir: Path, list_file: Path, no_geocode: bool, limit: int | None = None, start: int = 0, append: bool = False) -> None:
    permits = read_csv(list_file)
    by_stem: dict[str, list[dict[str, str]]] = defaultdict(list)
    for permit in permits:
        by_stem[permit["registration_no"].split("-", 1)[0]].append(permit)

    details: list[dict[str, object]] = []
    reviews: list[dict[str, object]] = []
    seen: set[str] = set()
    paths = sorted(pdf_dir.glob("*.pdf"))
    paths = paths[start:]
    if limit is not None:
        paths = paths[:limit]
    for index, path in enumerate(paths, 1):
        try:
            pages = page_texts(path)
        except Exception as exc:  # Corrupt/zero-page user downloads remain reviewable, never omitted.
            reviews.append({"filename": path.name, "registration_no_in_pdf": "", "issue_date_in_pdf": "", "permit_no": "",
                            "status": "unreadable", "basis": str(exc), "detail_source": ""})
            continue
        permit_no, stem, identification_error = identify_document(pages, by_stem)
        issued = permit_date("\n".join(pages[:5]))
        if not permit_no:
            reviews.append({"filename": path.name, "registration_no_in_pdf": stem, "issue_date_in_pdf": issued, "permit_no": "",
                            "status": "needs_document_identification", "basis": identification_error, "detail_source": ""})
            continue
        if permit_no in seen:
            reviews.append({"filename": path.name, "registration_no_in_pdf": stem, "issue_date_in_pdf": issued, "permit_no": permit_no,
                            "status": "duplicate_document", "basis": "another downloaded PDF already identifies this DEQ-list permit", "detail_source": ""})
            continue
        seen.add(permit_no)
        address, lat, lon, location_sources = extract_location(pages)
        count, mw, equipment_sources, equipment_review = extract_equipment(pages)
        source_bits = [*location_sources, *equipment_sources]
        details.append({"permit_no": permit_no, "facility_address": address, "lat": lat, "lon": lon,
                        "generator_count": count, "generator_mw_total": mw,
                        "detail_source": "; ".join(source_bits),
                        "reviewed_by": "automated parser v1; source-text extraction (human review pending)"})
        basis = "; ".join(equipment_review or ([x for x in location_sources if "multiple" in x] or ["parsed"]))
        reviews.append({"filename": path.name, "registration_no_in_pdf": stem, "issue_date_in_pdf": issued, "permit_no": permit_no,
                        "status": "needs_equipment_review" if equipment_review else "parsed", "basis": basis,
                        "detail_source": "; ".join(source_bits)})
        if index % 10 == 0:
            print(f"  parsed {index}/{len(paths)} PDFs", flush=True)

    if not no_geocode:
        failures = geocode(details)
        for message in failures:
            permit_no = message.split(":", 1)[0]
            for review in reviews:
                if review["permit_no"] == permit_no:
                    review["basis"] = "; ".join(filter(None, [str(review["basis"]), message.split(": ", 1)[1]]))
    if append and DETAILS.exists():
        details = read_csv(DETAILS) + details
    if append and REVIEW.exists():
        reviews = read_csv(REVIEW) + reviews
    write_csv(DETAILS, DETAIL_HEADER, sorted(details, key=lambda r: str(r["permit_no"])))
    write_csv(REVIEW, REVIEW_HEADER, reviews)
    print(f"{len(paths)} PDFs; {len(details)} identified permit details; {len(reviews)} review rows")
    print(f"-> {DETAILS.relative_to(ROOT)}; review: {REVIEW.relative_to(ROOT)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dir", type=Path, default=PDF_DIR)
    parser.add_argument("--file", type=Path, default=sorted(RAW.glob("va_deq_air_permits_*.csv"))[-1])
    parser.add_argument("--no-geocode", action="store_true", help="leave coordinates blank even when a permit states an address")
    parser.add_argument("--limit", type=int, help="read only the first N sorted PDFs (for parser validation)")
    parser.add_argument("--start", type=int, default=0, help="zero-based sorted-PDF offset (for resumable local parsing)")
    parser.add_argument("--append", action="store_true", help="append this batch to existing detail and review CSVs")
    parser.add_argument("--geocode-existing", action="store_true", help="geocode only already extracted stated addresses")
    args = parser.parse_args()
    if args.geocode_existing:
        extracted = read_csv(DETAILS)
        requested = sum(bool(row.get("facility_address")) and not bool(row.get("lat")) for row in extracted)
        failures = geocode(extracted)
        write_csv(DETAILS, DETAIL_HEADER, extracted)
        print(f"geocoded existing details: {requested - len(failures)} address matches; {len(failures)} unavailable")
    else:
        main(args.dir, args.file, args.no_geocode, args.limit, args.start, args.append)
