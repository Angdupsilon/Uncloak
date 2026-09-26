"""Build real ERCOT power-plant seeds from EIA-860M and EPA CAMPD.

Writes, for `load_plants.py --dir data/seed`:
  <out>/power_plants.csv         one row per plant (same columns as data/sample)
  <out>/plant_output.csv.gz      ts,plant_id,output_mw (UTC hour start)

Plants: EIA-860M "Operating" sheet (monthly generator inventory; no key needed).
  Kept: Texas generators in the ERCOT balancing authority (ERCO), status OP, grid-facing
  sectors (electric utility and IPP; industrial and commercial plants mostly serve their
  own load and are dropped). Generators are classified by prime mover:
    GT, IC        -> peaker     (simple-cycle turbines and engines on fossil fuel)
    CT, CA, CS    -> gas_cc     (combined-cycle parts)
    ST + fossil   -> steam      (coal, lignite, gas and oil boilers)
  connection_mw is the summed nameplate MW of the plant's fossil generators, which are the
  generators CAMPD measures. Co-located batteries, solar or wind at the same plant are left
  out of both the connection and the output so the spare figure stays like-for-like.
  "owner" is the EIA-860M operating entity.

Output: EPA CAMPD apportioned hourly emissions data, gross load (MW) x operating time,
  summed over the facility's units. CAMPD facility IDs are EIA plant codes. CAMPD dates and
  hours are local standard time; ERCOT is Central, so UTC = local standard + 6 h all year.
  Plants with no CAMPD hours in the window are dropped (they are not Part 75 reporters).
  Solar and wind are not built here: CAMPD does not cover them and the modeled profiles
  (output_source EIA923_MODELED) are not implemented yet.

Sources, in order of preference:
  --eia860m-xlsx FILE   a downloaded EIA-860M workbook, e.g. july_generator2026.xlsx
                        (https://www.eia.gov/electricity/data/eia860m/). Without it, the
                        latest monthly file is downloaded.
  --campd-csv FILE ...  CAMPD hourly emissions CSVs (https://campd.epa.gov/data/bulk-data-files).
                        Without them, the CAMPD streaming API is queried per facility and
                        quarter; set EPA_API_KEY (a free api.data.gov key). Responses are
                        cached under data/raw/cache/campd so reruns are cheap.

Usage:
  python etl/pull_power_plants.py --out data/seed [--start 2025-07-01 --end 2026-06-30]
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, timedelta
from pathlib import Path

import httpx
import pandas as pd
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
CACHE = ROOT / "data" / "raw" / "cache"
USER_AGENT = "GridSight public-record research (contact via repository maintainer)"

EIA860M_URL = "https://www.eia.gov/electricity/data/eia860m/xls/{month}_generator{year}.xlsx"
EIA860M_ARCHIVE_URL = "https://www.eia.gov/electricity/data/eia860m/archive/xls/{month}_generator{year}.xlsx"
EIA_PLANT_URL = "https://www.eia.gov/electricity/data/browser/#/plant/{plant_id}"
CAMPD_HOURLY_URL = "https://api.epa.gov/easey/streaming-services/emissions/apportioned/hourly"

MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august",
          "september", "october", "november", "december"]
ERCOT_BA = "ERCO"
CENTRAL_STANDARD_OFFSET = pd.Timedelta(hours=6)  # UTC = CST + 6 h
GRID_SECTORS = ("electric utility", "ipp")         # prefixes of the EIA-860M sector name

FOSSIL_FUELS = {"NG", "BIT", "SUB", "LIG", "RC", "WC", "PC", "DFO", "RFO", "KER", "JF", "WO",
                "OG", "BFG", "PG", "SGC", "SC"}
FUEL_LABELS = {"NG": "Natural gas", "BIT": "Coal", "SUB": "Coal", "LIG": "Coal", "RC": "Coal",
               "WC": "Coal", "SC": "Coal", "PC": "Petroleum coke", "DFO": "Oil", "RFO": "Oil",
               "KER": "Oil", "JF": "Oil", "WO": "Oil", "OG": "Other gas", "BFG": "Other gas",
               "PG": "Other gas", "SGC": "Other gas"}
PLANT_COLUMNS = ["plant_id", "name", "owner", "technology", "fuel", "connection_mw", "region",
                 "county", "lat", "lon", "operating_year", "retirement_year", "open_acres",
                 "fiber_within_2mi", "water_nearby", "output_source", "source_url", "is_sample"]


def norm(key: str) -> str:
    """Header key for matching: 'Plant ID', 'plantId' and 'plant_id' all become 'plantid'."""
    return re.sub(r"[^a-z0-9]", "", str(key).lower())


def http() -> httpx.Client:
    return httpx.Client(follow_redirects=True, timeout=120, headers={"User-Agent": USER_AGENT})


# ---------------------------------------------------------------------------
# EIA-860M generators
# ---------------------------------------------------------------------------

EIA_COLUMNS = {
    "plantid": "plant_id", "plantname": "plant_name", "entityname": "entity_name",
    "plantstate": "state", "county": "county", "balancingauthoritycode": "ba",
    "sector": "sector", "generatorid": "generator_id", "nameplatecapacitymw": "nameplate_mw",
    "technology": "technology_desc", "energysourcecode": "energy_source",
    "primemovercode": "prime_mover", "operatingyear": "operating_year",
    "plannedretirementyear": "retirement_year", "status": "status",
    "latitude": "lat", "longitude": "lon",
}


def download_eia860m(today: date) -> Path:
    """Fetch the newest EIA-860M workbook (EIA posts each month's file ~4 weeks later)."""
    CACHE.mkdir(parents=True, exist_ok=True)
    with http() as client:
        y, m = today.year, today.month
        for _ in range(8):
            name = f"{MONTHS[m - 1]}_generator{y}.xlsx"
            path = CACHE / name
            if path.exists():
                return path
            for template in (EIA860M_URL, EIA860M_ARCHIVE_URL):
                url = template.format(month=MONTHS[m - 1], year=y)
                r = client.get(url)
                if r.status_code == 200 and r.content[:2] == b"PK":  # xlsx is a zip
                    path.write_bytes(r.content)
                    print(f"  EIA-860M: {url}")
                    return path
            y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    raise SystemExit("could not download an EIA-860M workbook; pass --eia860m-xlsx")


def read_eia860m(path: Path) -> pd.DataFrame:
    """The 'Operating' sheet, header row located by its 'Plant ID' cell."""
    raw = pd.read_excel(path, sheet_name="Operating", header=None, dtype=str)
    top = raw.head(20)
    header_rows = top.index[top.apply(lambda r: r.map(norm).eq("plantid").any(), axis=1)]
    if not len(header_rows):
        raise SystemExit(f"{path}: no 'Plant ID' header row on the Operating sheet")
    h = header_rows[0]
    df = raw.iloc[h + 1:].copy()
    df.columns = [norm(c) for c in raw.iloc[h]]
    missing = sorted(set(EIA_COLUMNS) - set(df.columns))
    if missing:
        raise SystemExit(f"{path}: Operating sheet is missing columns {missing}")
    df = df[list(EIA_COLUMNS)].rename(columns=EIA_COLUMNS)
    df = df[df["plant_id"].notna() & df["plant_id"].str.strip().str.fullmatch(r"\d+(\.0)?")]
    df["plant_id"] = df["plant_id"].str.strip().str.replace(r"\.0$", "", regex=True)
    for c in ("nameplate_mw", "lat", "lon", "operating_year", "retirement_year"):
        df[c] = pd.to_numeric(df[c].str.strip() if df[c].dtype == object else df[c], errors="coerce")
    for c in ("state", "ba", "energy_source", "prime_mover", "status", "sector"):
        df[c] = df[c].fillna("").str.strip()
    return df


def classify(prime_mover: str, energy_source: str) -> str | None:
    pm, es = prime_mover.upper(), energy_source.upper()
    if es not in FOSSIL_FUELS:
        return None
    if pm in {"GT", "IC"}:
        return "peaker"
    if pm in {"CT", "CA", "CS"}:
        return "gas_cc"
    if pm == "ST":
        return "steam"
    return None


def is_operating(status: str) -> bool:
    # Workbook cells read "(OP) Operating"; some vintages carry just "OP".
    s = status.upper()
    return s == "OP" or s.startswith("(OP)")


def build_plants(gens: pd.DataFrame) -> pd.DataFrame:
    g = gens[(gens["state"].str.upper() == "TX") & (gens["ba"].str.upper() == ERCOT_BA)]
    g = g[g["status"].map(is_operating)]
    g = g[g["sector"].str.lower().str.startswith(GRID_SECTORS)]
    g = g.assign(category=[classify(pm, es) for pm, es in zip(g["prime_mover"], g["energy_source"])])
    g = g[g["category"].notna() & (g["nameplate_mw"] > 0)]

    rows = []
    for plant_id, pg in g.groupby("plant_id", sort=True):
        by_cat = pg.groupby("category")["nameplate_mw"].sum()
        tech = by_cat.idxmax()
        lead = pg[pg["category"] == tech].sort_values("nameplate_mw", ascending=False).iloc[0]
        retire = pg["retirement_year"]
        rows.append({
            "plant_id": plant_id,
            "name": str(lead["plant_name"]).strip(),
            "owner": str(lead["entity_name"]).strip() if pd.notna(lead["entity_name"]) else None,
            "technology": tech,
            "fuel": FUEL_LABELS.get(lead["energy_source"].upper()),
            "connection_mw": round(float(pg["nameplate_mw"].sum()), 1),
            "region": "ERCOT",
            "county": str(lead["county"]).strip() if pd.notna(lead["county"]) else None,
            "lat": lead["lat"] if pd.notna(lead["lat"]) else None,
            "lon": lead["lon"] if pd.notna(lead["lon"]) else None,
            "operating_year": int(pg["operating_year"].min()) if pg["operating_year"].notna().any() else None,
            # A plant retires when its last fossil generator does; partial retirements are not shown.
            "retirement_year": int(retire.max()) if retire.notna().all() else None,
            "open_acres": None, "fiber_within_2mi": None, "water_nearby": None,
            "output_source": "CAMPD",
            "source_url": EIA_PLANT_URL.format(plant_id=plant_id),
            "is_sample": False,
        })
    return pd.DataFrame(rows, columns=PLANT_COLUMNS)


# ---------------------------------------------------------------------------
# CAMPD hourly gross load
# ---------------------------------------------------------------------------

CAMPD_ALIASES = {
    "facilityid": "facility_id", "orisplantcode": "facility_id",
    "unitid": "unit_id", "date": "date", "hour": "hour",
    "optime": "op_time", "operatingtime": "op_time",
    "grossload": "gross_load", "grossloadmw": "gross_load",
}


def plant_hours(records: pd.DataFrame) -> pd.DataFrame:
    """Unit-hour CAMPD rows -> plant-hour output_mw at the UTC hour start.

    output_mw = gross load x operating time: CAMPD reports gross load as the average MW over
    the part of the hour the unit ran. A plant-hour exists when at least one unit reported it.
    """
    df = records.rename(columns={c: CAMPD_ALIASES[norm(c)] for c in records.columns if norm(c) in CAMPD_ALIASES})
    need = {"facility_id", "date", "hour", "gross_load"}
    if not need <= set(df.columns):
        raise ValueError(f"CAMPD data is missing columns {sorted(need - set(df.columns))}; got {list(records.columns)}")
    load = pd.to_numeric(df["gross_load"], errors="coerce").fillna(0.0).clip(lower=0)
    if "op_time" in df.columns:
        op = pd.to_numeric(df["op_time"], errors="coerce").fillna(0.0).clip(0, 1)
        load = load * op
    local_std = pd.to_datetime(df["date"].astype(str).str[:10]) + pd.to_timedelta(pd.to_numeric(df["hour"]).astype(int), unit="h")
    out = pd.DataFrame({
        "ts": (local_std + CENTRAL_STANDARD_OFFSET).dt.tz_localize("UTC"),
        "plant_id": df["facility_id"].astype(str).str.replace(r"\.0$", "", regex=True).str.strip(),
        "output_mw": load,
    })
    return out.groupby(["plant_id", "ts"], as_index=False)["output_mw"].sum()


def quarters(start: date, end: date) -> list[tuple[date, date]]:
    chunks, cur = [], start
    while cur <= end:
        q_end_month = ((cur.month - 1) // 3 + 1) * 3
        nxt = date(cur.year + (q_end_month == 12), q_end_month % 12 + 1, 1)
        chunks.append((cur, min(end, nxt - timedelta(days=1))))
        cur = nxt
    return chunks


def fetch_campd(plant_id: str, begin: date, end: date, api_key: str, client: httpx.Client) -> pd.DataFrame:
    cache = CACHE / "campd" / f"{plant_id}_{begin}_{end}.csv.gz"
    if cache.exists():
        cached = pd.read_csv(cache, dtype={"plant_id": str})
        cached["ts"] = pd.to_datetime(cached["ts"], utc=True)
        return cached
    params = {"api_key": api_key, "facilityId": plant_id,
              "beginDate": begin.isoformat(), "endDate": end.isoformat()}
    for attempt in range(6):
        r = client.get(CAMPD_HOURLY_URL, params=params)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(min(120, 5 * 2 ** attempt))
            continue
        if r.status_code >= 400:
            raise SystemExit(f"CAMPD {r.status_code} for facility {plant_id} {begin}..{end}: {r.text[:300]}")
        break
    else:
        raise SystemExit(f"CAMPD kept failing for facility {plant_id} {begin}..{end}")
    data = r.json()
    hours = plant_hours(pd.DataFrame(data)) if data else pd.DataFrame(columns=["plant_id", "ts", "output_mw"])
    cache.parent.mkdir(parents=True, exist_ok=True)
    hours.to_csv(cache, index=False)
    return hours


def campd_from_api(plant_ids: list[str], start: date, end: date, workers: int) -> pd.DataFrame:
    api_key = os.getenv("EPA_API_KEY", "").strip()
    if not api_key:
        print("  WARN EPA_API_KEY unset: using DEMO_KEY, which allows only a few requests per hour")
        api_key = "DEMO_KEY"
    jobs = [(pid, b, e) for pid in plant_ids for b, e in quarters(start, end)]
    print(f"  CAMPD API: {len(plant_ids)} facilities x {len(quarters(start, end))} quarters = {len(jobs)} requests")
    frames = []
    with http() as client, ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(fetch_campd, pid, b, e, api_key, client) for pid, b, e in jobs]
        for i, f in enumerate(as_completed(futures), 1):
            frames.append(f.result())
            if i % 100 == 0:
                print(f"    {i}/{len(jobs)}")
    frames = [f for f in frames if len(f)]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=["plant_id", "ts", "output_mw"])


def campd_from_csv(paths: list[Path], plant_ids: set[str]) -> pd.DataFrame:
    frames = []
    for path in paths:
        for chunk in pd.read_csv(path, dtype=str, chunksize=500_000):
            chunk = chunk.rename(columns={c: CAMPD_ALIASES[norm(c)] for c in chunk.columns if norm(c) in CAMPD_ALIASES})
            if "facility_id" not in chunk.columns:
                raise SystemExit(f"{path}: no Facility ID column")
            chunk["facility_id"] = chunk["facility_id"].str.replace(r"\.0$", "", regex=True).str.strip()
            chunk = chunk[chunk["facility_id"].isin(plant_ids)]
            frames.append(chunk[[c for c in ("facility_id", "unit_id", "date", "hour", "op_time", "gross_load") if c in chunk.columns]])
        print(f"  CAMPD file: {path}")
    units = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if units.empty:
        return pd.DataFrame(columns=["plant_id", "ts", "output_mw"])
    # Overlapping downloads repeat unit-hours; count each once.
    keys = [c for c in ("facility_id", "unit_id", "date", "hour") if c in units.columns]
    return plant_hours(units.drop_duplicates(keys, keep="last"))


# ---------------------------------------------------------------------------

def default_window(today: date) -> tuple[date, date]:
    """The four calendar quarters ending with the latest quarter CAMPD has published.

    Hourly data are due 30 days after each quarter and appear some weeks later, so the
    latest usable quarter is the last one that ended at least 60 days ago."""
    after_cutoff = today - timedelta(days=59)
    end = date(after_cutoff.year, ((after_cutoff.month - 1) // 3) * 3 + 1, 1) - timedelta(days=1)
    return date(end.year - 1, end.month, end.day) + timedelta(days=1), end


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "seed")
    ap.add_argument("--eia860m-xlsx", type=Path)
    ap.add_argument("--campd-csv", type=Path, nargs="+")
    ap.add_argument("--start", type=date.fromisoformat, help="first local day (default: 4 quarters back)")
    ap.add_argument("--end", type=date.fromisoformat, help="last local day (default: latest published quarter)")
    ap.add_argument(
        "--workers", type=int, default=1,
        help="parallel CAMPD API requests (the API allows one in flight per key; more just get 429s)",
    )
    args = ap.parse_args()

    start, end = default_window(date.today())
    start, end = args.start or start, args.end or end
    if start > end:
        raise SystemExit("--start is after --end")
    print(f"window: {start} .. {end} (local days)")

    xlsx = args.eia860m_xlsx or download_eia860m(date.today())
    plants = build_plants(read_eia860m(xlsx))
    print(f"  EIA-860M ({xlsx.name}): {len(plants)} operating ERCOT fossil plants")
    if plants.empty:
        raise SystemExit("no plants matched; check the workbook")
    ids = plants["plant_id"].tolist()

    if args.campd_csv:
        hours = campd_from_csv(args.campd_csv, set(ids))
    else:
        hours = campd_from_api(ids, start, end, args.workers)
    lo = pd.Timestamp(start) + CENTRAL_STANDARD_OFFSET
    hi = pd.Timestamp(end + timedelta(days=1)) + CENTRAL_STANDARD_OFFSET
    hours = hours[(hours["ts"] >= lo.tz_localize("UTC")) & (hours["ts"] < hi.tz_localize("UTC"))]

    have = set(hours["plant_id"].unique())
    dropped = plants[~plants["plant_id"].isin(have)]
    plants = plants[plants["plant_id"].isin(have)].reset_index(drop=True)
    if len(dropped):
        mw = dropped["connection_mw"].sum()
        print(f"  {len(dropped)} plants ({mw:,.0f} MW) have no CAMPD hours in the window and are left out")
    if plants.empty:
        raise SystemExit("no plant has CAMPD output in the window")

    expected = int((hi - lo) / pd.Timedelta(hours=1))
    counts = hours.groupby("plant_id").size()
    partial = counts[counts < 0.9 * expected]
    if len(partial):
        print(f"  NOTE {len(partial)} plants report under 90% of the {expected:,} hours "
              "(seasonal reporters or units added/retired mid-window); stats use reported hours only")
    by_month = hours.assign(m=(hours["ts"] - CENTRAL_STANDARD_OFFSET).dt.strftime("%Y-%m")).groupby("m")["plant_id"].nunique()
    thin = by_month[by_month < 0.8 * by_month.max()]
    if len(thin):
        print(f"  WARN months with few reporting plants (not yet published?): {thin.to_dict()}")
    over = hours.merge(plants[["plant_id", "connection_mw"]])
    over = over[over["output_mw"] > over["connection_mw"] * 1.05]
    if len(over):
        print(f"  NOTE {len(over):,} plant-hours exceed nameplate by >5% (gross load includes station service)")

    args.out.mkdir(parents=True, exist_ok=True)
    plants = plants.astype({"operating_year": "Int64", "retirement_year": "Int64"})
    plants.to_csv(args.out / "power_plants.csv", index=False)
    hours = hours.sort_values(["plant_id", "ts"])
    with gzip.open(args.out / "plant_output.csv.gz", "wt", newline="") as fh:
        pd.DataFrame({
            "ts": hours["ts"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "plant_id": hours["plant_id"],
            "output_mw": hours["output_mw"].round(2),
        }).to_csv(fh, index=False)
    tech = plants.groupby("technology")["connection_mw"].agg(["count", "sum"]).round(0)
    print(f"  wrote {args.out / 'power_plants.csv'} ({len(plants)} plants, {plants['connection_mw'].sum():,.0f} MW)")
    print(f"  wrote {args.out / 'plant_output.csv.gz'} ({len(hours):,} plant-hours)")
    print(json.dumps({t: {"plants": int(r["count"]), "mw": float(r["sum"])} for t, r in tech.iterrows()}, indent=2))


if __name__ == "__main__":
    sys.exit(main())
