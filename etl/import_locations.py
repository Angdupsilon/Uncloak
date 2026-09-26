"""Merge reviewed public-record locations into data/seed/projects.csv.

The location crosswalk is deliberately separate from the project seed because many
Comptroller registry rows contain no address.  Each enrichment row records its own
source, confidence, and basis so secondary-source leads are auditable and can later
be replaced by primary records without changing project identity.

Only rows with status ``verified`` or ``corroborated`` are applied.  Candidate and
partial locations remain in the crosswalk for research but never reach the map.

Usage:
  python etl/import_locations.py
  python etl/import_locations.py --locations path/to/locations.csv --projects path/to/projects.csv
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOCATIONS = ROOT / "data" / "raw" / "project_locations.csv"
DEFAULT_PROJECTS = ROOT / "data" / "seed" / "projects.csv"
APPLY_STATUSES = {"verified", "corroborated"}
TX_BOUNDS = (25.8, -106.7, 36.6, -93.5)


def clean(value: str | None) -> str:
    return (value or "").strip()


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def validate(locations: list[dict[str, str]], project_names: set[str]) -> None:
    seen: set[str] = set()
    errors: list[str] = []
    required = {"project_name", "address", "city", "county", "lat", "lon", "status", "source_url", "basis"}
    for line, row in enumerate(locations, 2):
        missing_columns = required - row.keys()
        if missing_columns:
            raise SystemExit(f"location CSV missing columns: {sorted(missing_columns)}")
        name = clean(row["project_name"])
        status = clean(row["status"]).lower()
        if not name:
            errors.append(f"row {line}: missing project_name")
        elif name in seen:
            errors.append(f"row {line}: duplicate project_name {name!r}")
        elif name not in project_names:
            errors.append(f"row {line}: unknown project_name {name!r}")
        seen.add(name)
        if status not in APPLY_STATUSES | {"candidate", "partial"}:
            errors.append(f"row {line}: invalid status {status!r}")
        if status in APPLY_STATUSES:
            if not clean(row["address"]):
                errors.append(f"row {line}: applied location has no address")
            try:
                lat, lon = float(row["lat"]), float(row["lon"])
                if not (TX_BOUNDS[0] <= lat <= TX_BOUNDS[2] and TX_BOUNDS[1] <= lon <= TX_BOUNDS[3]):
                    errors.append(f"row {line}: coordinates outside Texas ({lat}, {lon})")
            except ValueError:
                errors.append(f"row {line}: applied location needs numeric lat/lon")
            if not clean(row["source_url"]).startswith("https://"):
                errors.append(f"row {line}: applied location needs an HTTPS source")
    if errors:
        raise SystemExit("Invalid project locations:\n  " + "\n  ".join(errors))


def main(locations_path: Path = DEFAULT_LOCATIONS, projects_path: Path = DEFAULT_PROJECTS) -> tuple[int, int]:
    locations = read_rows(locations_path)
    projects = read_rows(projects_path)
    validate(locations, {clean(row["name"]) for row in projects})
    by_name = {clean(row["project_name"]): row for row in locations if clean(row["status"]).lower() in APPLY_STATUSES}

    filled = already = 0
    for project in projects:
        location = by_name.get(clean(project["name"]))
        if not location:
            continue
        # Never replace a primary/imported location automatically. Conflicts belong
        # in the reviewed crosswalk until a person resolves them.
        if clean(project.get("lat")) and clean(project.get("lon")):
            already += 1
            continue
        for field in ("address", "city", "county", "lat", "lon"):
            if clean(location.get(field)):
                project[field] = clean(location[field])
        filled += 1

    with projects_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["name", "county", "city", "address", "lat", "lon", "llc_name"])
        writer.writeheader()
        writer.writerows(projects)
    print(f"locations: filled {filled} projects; {already} already had coordinates; {len(projects) - filled - already} unchanged")
    return filled, already


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--locations", type=Path, default=DEFAULT_LOCATIONS)
    parser.add_argument("--projects", type=Path, default=DEFAULT_PROJECTS)
    args = parser.parse_args()
    main(args.locations, args.projects)
