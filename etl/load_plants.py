"""Load power plants and their hourly output for the spare-capacity finder.

Reads <dir>/power_plants.csv and, when present, <dir>/plant_output.csv
(columns: ts, plant_id, output_mw; ts is the UTC start of the hour).

Real data (to be built): power_plants.csv from EIA-860/860M (connection size, owner,
location), plant_output.csv from EPA CAMPD hourly gross load for fossil units and
modeled profiles for solar and wind. Both cover Texas/ERCOT.

SAMPLE data: data/sample has no plant_output.csv. For SAMPLE plants only, this script
synthesizes a deterministic year of hourly output from simple technology profiles, so
the tab runs before real data exists. Those numbers are fake and flagged is_sample.

Loading a non-sample directory removes previously loaded SAMPLE plants.

Usage: python etl/load_plants.py --dir data/sample|data/seed [--end 2026-09-01]
"""
from __future__ import annotations

import argparse
import zlib
from pathlib import Path

import numpy as np
import pandas as pd

from common import clean, connect, to_float

TECHNOLOGIES = {"peaker", "gas_cc", "steam", "solar", "wind"}
OUTPUT_SOURCES = {"CAMPD", "EIA923_MODELED", "SAMPLE"}
LOCAL_TZ = "America/Chicago"


def to_bool(value) -> bool | None:
    value = clean(value)
    if value is None:
        return None
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def to_int(value) -> int | None:
    v = to_float(value)
    return None if v is None else int(v)


# ---------------------------------------------------------------------------
# SAMPLE output synthesis (fixtures only; never used for real plants)
# ---------------------------------------------------------------------------

def _peaker(rng, local: pd.DatetimeIndex, cap: float) -> np.ndarray:
    """Off most hours; runs on hot summer afternoons and a few cold winter mornings."""
    run_prob = {1: 0.10, 2: 0.10, 3: 0.03, 4: 0.03, 5: 0.10, 6: 0.30, 7: 0.45, 8: 0.50, 9: 0.28, 10: 0.08, 11: 0.03, 12: 0.08}
    appetite = rng.uniform(0.6, 1.4)  # some peakers are dispatched more than others
    days = local.normalize().unique()
    runs = {d: rng.random() < min(0.9, run_prob[d.month] * appetite) for d in days}
    level = {d: rng.uniform(0.55, 1.0) for d in days}
    out = np.zeros(len(local))
    for i, t in enumerate(local):
        d = t.normalize()
        if not runs[d]:
            continue
        summer = t.month in (5, 6, 7, 8, 9, 10)
        on = 14 <= t.hour <= 20 if summer else 6 <= t.hour <= 9
        if on:
            out[i] = cap * min(1.0, level[d] * rng.uniform(0.85, 1.05))
    return out


def _gas_cc(rng, local, cap):
    """Mid-merit: follows the daily load shape, higher in summer, one spring outage."""
    h, m = local.hour.to_numpy(), local.month.to_numpy()
    daily = 0.5 + 0.5 * np.sin((h - 9) / 24 * 2 * np.pi)
    seasonal = np.where(np.isin(m, [6, 7, 8, 9]), 0.12, np.where(np.isin(m, [3, 4, 11]), -0.12, 0.0))
    frac = 0.42 + 0.35 * daily + seasonal + rng.normal(0, 0.05, len(local))
    frac = np.clip(frac, 0.25, 0.97)
    start = rng.integers(0, 21)
    outage = (m == 4) & (local.day.to_numpy() >= start + 1) & (local.day.to_numpy() <= start + 10)
    return np.where(outage, 0.0, cap * frac)


def _steam(rng, local, cap, fuel: str):
    h, m = local.hour.to_numpy(), local.month.to_numpy()
    if fuel.lower() == "coal":
        # Baseload with overnight turndown in shoulder seasons and a spring outage.
        shoulder = np.isin(m, [3, 4, 10, 11])
        night = (h < 7) | (h > 22)
        frac = np.where(shoulder & night, 0.45, 0.82) + rng.normal(0, 0.05, len(local))
        frac = np.clip(frac, 0.35, 0.95)
        outage = (m == 3) & (local.day.to_numpy() >= 8)
        return np.where(outage, 0.0, cap * frac)
    # Old gas steam: committed only through summer, off otherwise.
    summer = np.isin(m, [6, 7, 8])
    frac = np.clip(0.35 + 0.35 * np.sin((h - 9) / 24 * 2 * np.pi) + rng.normal(0, 0.05, len(local)), 0.25, 0.85)
    return np.where(summer, cap * frac, 0.0)


def _solar(rng, local, cap):
    """Zero at night; a daylight arc that is longer in summer, with cloudy days."""
    doy = local.dayofyear.to_numpy()
    hour = local.hour.to_numpy() + 0.5
    half_day = 6.0 + 1.1 * np.sin((doy - 80) / 365 * 2 * np.pi)  # ~4.9 h (winter) to ~7.1 h (summer)
    solar_noon = 13.3  # daylight saving shifts local noon later
    x = (hour - (solar_noon - half_day)) / (2 * half_day)
    arc = np.where((x > 0) & (x < 1), np.sin(np.pi * np.clip(x, 0, 1)) ** 1.3, 0.0)
    days = local.normalize()
    uniq = days.unique()
    cloud = dict(zip(uniq, np.clip(rng.beta(5, 1.6, len(uniq)), 0.15, 1.0)))
    cloud_arr = np.array([cloud[d] for d in days])
    seasonal = 0.85 + 0.12 * np.sin((doy - 80) / 365 * 2 * np.pi)
    return cap * np.clip(arc * cloud_arr * seasonal * 1.08, 0, 0.98)  # inverter clipping below the limit


def _wind(rng, local, cap):
    """Autocorrelated wind speed through a power curve; stronger at night and in spring."""
    n = len(local)
    z = np.empty(n)
    z[0] = 0.0
    shocks = rng.normal(0, 0.28, n)
    for i in range(1, n):
        z[i] = 0.96 * z[i - 1] + shocks[i]
    h, m = local.hour.to_numpy(), local.month.to_numpy()
    diurnal = 0.9 * np.cos((h - 2) / 24 * 2 * np.pi)
    seasonal = np.where(np.isin(m, [3, 4, 5]), 0.8, np.where(np.isin(m, [7, 8]), -0.5, 0.0))
    speed = 7.5 + 2.0 * z + diurnal + seasonal
    curve = np.clip((speed - 3.5) / (12.0 - 3.5), 0, 1) ** 1.6
    curve = np.where(speed > 24, 0, curve)
    return cap * curve * 0.97


def synthesize(plant: dict, end_utc: pd.Timestamp) -> pd.DataFrame:
    idx = pd.date_range(end=end_utc - pd.Timedelta(hours=1), periods=8760, freq="h", tz="UTC")
    local = idx.tz_convert(LOCAL_TZ)
    rng = np.random.default_rng(zlib.crc32(plant["plant_id"].encode()))
    cap, tech = plant["connection_mw"], plant["technology"]
    if tech == "peaker":
        mw = _peaker(rng, local, cap)
    elif tech == "gas_cc":
        mw = _gas_cc(rng, local, cap)
    elif tech == "steam":
        mw = _steam(rng, local, cap, plant.get("fuel") or "")
    elif tech == "solar":
        mw = _solar(rng, local, cap)
    else:
        mw = _wind(rng, local, cap)
    return pd.DataFrame({"ts": idx, "plant_id": plant["plant_id"], "output_mw": np.round(np.clip(mw, 0, cap), 2)})


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------

def read_plants(directory: Path) -> list[dict]:
    path = directory / "power_plants.csv"
    if not path.exists():
        raise SystemExit(f"{path} not found")
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    plants = []
    for _, r in df.iterrows():
        plant_id, name, tech = clean(r["plant_id"]), clean(r["name"]), clean(r["technology"])
        cap, source = to_float(r["connection_mw"]), clean(r["output_source"])
        if not plant_id or not name or cap is None or cap <= 0 or not clean(r["source_url"]):
            print(f"  WARN skipping plant row with missing required fields: {dict(r)}")
            continue
        if tech not in TECHNOLOGIES:
            raise SystemExit(f"{plant_id}: unknown technology {tech!r} (expected one of {sorted(TECHNOLOGIES)})")
        if source not in OUTPUT_SOURCES:
            raise SystemExit(f"{plant_id}: unknown output_source {source!r}")
        plants.append({
            "plant_id": plant_id, "name": name, "owner": clean(r["owner"]), "technology": tech,
            "fuel": clean(r["fuel"]), "connection_mw": cap, "region": clean(r["region"]) or "ERCOT",
            "county": clean(r["county"]), "lat": to_float(r["lat"]), "lon": to_float(r["lon"]),
            "operating_year": to_int(r["operating_year"]), "retirement_year": to_int(r["retirement_year"]),
            "open_acres": to_float(r["open_acres"]), "fiber_within_2mi": to_bool(r["fiber_within_2mi"]),
            "water_nearby": to_bool(r["water_nearby"]), "output_source": source,
            "source_url": clean(r["source_url"]), "is_sample": bool(to_bool(r["is_sample"])),
        })
    return plants


def main(directory: Path, end: str) -> None:
    plants = read_plants(directory)
    sample_dir = directory.resolve().name == "sample"
    if not sample_dir and any(p["is_sample"] for p in plants):
        raise SystemExit("is_sample rows are only allowed in data/sample")
    output_path = directory / "plant_output.csv"

    if output_path.exists():
        output = pd.read_csv(output_path, dtype={"plant_id": str})
        output["ts"] = pd.to_datetime(output["ts"], utc=True)
    else:
        end_utc = pd.Timestamp(end, tz=LOCAL_TZ).tz_convert("UTC")
        frames = [synthesize(p, end_utc) for p in plants if p["is_sample"]]
        if not frames:
            print("  (no plant_output.csv and no SAMPLE plants: loading plants without output)")
        output = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=["ts", "plant_id", "output_mw"])

    with connect() as conn, conn.cursor() as cur:
        if not sample_dir:
            cur.execute("DELETE FROM power_plants WHERE is_sample")
            if cur.rowcount:
                print(f"  removed {cur.rowcount} SAMPLE plants")
        cols = list(plants[0].keys()) if plants else []
        for p in plants:
            cur.execute(
                f"""INSERT INTO power_plants ({", ".join(cols)}) VALUES ({", ".join(["%s"] * len(cols))})
                    ON CONFLICT (plant_id) DO UPDATE SET {", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != "plant_id")}""",
                [p[c] for c in cols])
        ids = sorted(output["plant_id"].unique().tolist())
        if ids:
            cur.execute("DELETE FROM plant_output WHERE plant_id = ANY(%s)", (ids,))
            with cur.copy("COPY plant_output (ts, plant_id, output_mw) FROM STDIN") as cp:
                for ts, pid, mw in output[["ts", "plant_id", "output_mw"]].itertuples(index=False):
                    cp.write_row((ts.to_pydatetime(), pid, float(mw)))
        conn.commit()
        print(f"  power_plants: {len(plants)} rows · plant_output: {len(output):,} hourly rows for {len(ids)} plants")

    # Continuous aggregates cannot be refreshed inside a transaction.
    with connect(autocommit=True) as conn:
        conn.execute("CALL refresh_continuous_aggregate('plant_output_daily', NULL, NULL)")
    print("  plant_output_daily refreshed")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dir", type=Path, required=True)
    ap.add_argument("--end", default="2026-09-01", help="SAMPLE only: synthesize the 8,760 hours before this local date")
    args = ap.parse_args()
    main(args.dir, args.end)
