"""Model B (docs/us-expansion-plan.md, Phase 4): a site's IT load range from its floor area.

Fit: the Texas projects that have both TDLR floor area (square_footage events) and a registered
construction cost, whose cost-derived MW is cost ÷ config.MW_COST_PER_MW_USD (the same mw_est the
evidence pages show). The model is the distribution of MW per square foot across those projects; the
10th, 50th and 90th percentiles give low / mid / high.

Validation: leave-one-out on the training projects: refit without each one, predict it, and record the
median absolute percentage error of the mid value and how often the true value falls in the low-high
range. Both are stored with the method version and shown with every estimate.

Apply: every project that has no registered construction cost (so no cost-derived MW) but has a floor
area input: its TDLR floor area if it has one, otherwise the building footprint the IM3 atlas maps. A
footprint is ground coverage, not floor area, so a multi-storey building is underestimated; the input
used is recorded on each row.

Estimates go only to the `estimates` table, as ranges with this method's version and inputs. They never
feed project_scores and never replace a documented or cost-derived value.

Usage: python etl/models/floor_area_mw.py
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import config  # noqa: E402
from common import connect  # noqa: E402

METHOD = "floor_area_it_mw"
VERSION = "1.0.0"
QUANTILES = (0.1, 0.5, 0.9)
DESCRIPTION = ("IT load range from floor area: the 10th/50th/90th percentiles of MW per square foot across Texas "
               "projects with both TDLR floor area and a registered construction cost (MW = cost ÷ $ per MW).")

INPUTS_SQL = """
SELECT p.project_id, p.name, p.state,
       SUM(e.value_num) FILTER (WHERE e.event_type = 'square_footage' AND e.source = 'TDLR')      AS tdlr_sqft,
       SUM(e.value_num) FILTER (WHERE e.event_type = 'building_registered' AND e.source = 'TDLR') AS cost,
       (ARRAY_AGG(e.value_num ORDER BY e.ts DESC) FILTER (WHERE e.event_type = 'site_mapped' AND e.value_num > 0))[1] AS footprint,
       (ARRAY_AGG(e.source_url ORDER BY e.ts DESC) FILTER (WHERE e.event_type = 'site_mapped' AND e.value_num > 0))[1] AS footprint_url
FROM projects p JOIN evidence_events e USING (project_id)
GROUP BY p.project_id, p.name, p.state
"""


def quantiles(ratios: np.ndarray) -> tuple[float, float, float]:
    lo, mid, hi = np.quantile(ratios, QUANTILES)
    return float(lo), float(mid), float(hi)


def leave_one_out(train: pd.DataFrame) -> dict:
    errors, inside = [], []
    for i in range(len(train)):
        rest = np.delete(train["ratio"].to_numpy(), i)
        lo, mid, hi = (q * train["sqft"].iat[i] for q in quantiles(rest))
        actual = train["mw"].iat[i]
        errors.append(abs(mid - actual) / actual)
        inside.append(lo <= actual <= hi)
    return {"method": "leave-one-out", "n": len(train),
            "median_abs_pct_error": round(float(np.median(errors)) * 100, 1),
            "mean_abs_pct_error": round(float(np.mean(errors)) * 100, 1),
            "interval_coverage_pct": round(float(np.mean(inside)) * 100, 1),
            "nominal_interval_pct": round((QUANTILES[2] - QUANTILES[0]) * 100)}


def main() -> None:
    if not config.MW_COST_PER_MW_USD:
        print("  estimates: skipped (MW_COST_PER_MW_USD unset, so there is no cost-derived MW to fit on)")
        return
    today = datetime.now(timezone.utc).date()
    with connect() as conn, conn.cursor() as cur:
        cur.execute(INPUTS_SQL)
        df = pd.DataFrame(cur.fetchall(), columns=["project_id", "name", "state", "tdlr_sqft", "cost", "footprint", "footprint_url"])
        for c in ("tdlr_sqft", "cost", "footprint"):
            df[c] = pd.to_numeric(df[c])
        train = df[(df.state == "TX") & (df.tdlr_sqft > 0) & (df.cost > 0)].copy()
        train["sqft"] = train["tdlr_sqft"]
        train["mw"] = train["cost"] / config.MW_COST_PER_MW_USD
        train["ratio"] = train["mw"] / train["sqft"]
        if len(train) < 10:
            print(f"  estimates: skipped (only {len(train)} training projects)")
            return
        lo, mid, hi = quantiles(train["ratio"].to_numpy())
        validation = leave_one_out(train)
        params = {"quantiles": list(QUANTILES), "mw_per_sqft": {"low": lo, "mid": mid, "high": hi},
                  "mw_per_100k_sqft": {"low": round(lo * 1e5, 3), "mid": round(mid * 1e5, 3), "high": round(hi * 1e5, 3)},
                  "mw_cost_per_mw_usd": config.MW_COST_PER_MW_USD, "mw_cost_source": config.MW_COST_SOURCE,
                  "training_filter": "Texas projects with TDLR square_footage > 0 and TDLR building_registered cost > 0"}
        training = [{"project": r.name, "tdlr_sqft": float(r.sqft), "cost_usd": float(r.cost), "mw": round(float(r.mw), 3)}
                    for r in train.sort_values("name").itertuples()]
        cur.execute("DELETE FROM estimates WHERE method = %s", (METHOD,))
        cur.execute("DELETE FROM estimate_methods WHERE method = %s", (METHOD,))
        cur.execute("""INSERT INTO estimate_methods (method, method_version, fitted_at, description, params, validation, training)
                       VALUES (%s, %s, now(), %s, %s, %s, %s)""",
                    (METHOD, VERSION, DESCRIPTION, Jsonb(params), Jsonb(validation), Jsonb(training)))

        targets = df[~(df.cost > 0) & ((df.tdlr_sqft > 0) | (df.footprint > 0))]
        n = 0
        for r in targets.itertuples():
            if r.tdlr_sqft and r.tdlr_sqft > 0:
                sqft, kind, ref = float(r.tdlr_sqft), "TDLR floor area (sum of registrations)", None
            else:
                sqft, kind, ref = float(r.footprint), "IM3 atlas building footprint (ground coverage, not floor area)", r.footprint_url
            inputs = {"sqft": sqft, "sqft_source": kind, "sqft_source_url": ref, "training_n": len(train),
                      "mw_per_sqft": params["mw_per_sqft"]}
            cur.execute("""INSERT INTO estimates (subject_kind, project_id, metric, as_of, low, mid, high, unit, method,
                             method_version, inputs, notes)
                           VALUES ('project', %s, 'it_mw', %s, %s, %s, %s, 'MW', %s, %s, %s, %s)""",
                        (int(r.project_id), today, lo * sqft, mid * sqft, hi * sqft, METHOD, VERSION, Jsonb(inputs),
                         "Modeled from floor area; not a documented or requested load"))
            n += 1
    print(f"  estimates: {METHOD} v{VERSION} fit on {len(train)} Texas projects "
          f"(MW per 100k sq ft {params['mw_per_100k_sqft']['low']}/{params['mw_per_100k_sqft']['mid']}/{params['mw_per_100k_sqft']['high']}); "
          f"leave-one-out median error {validation['median_abs_pct_error']}%, "
          f"{validation['interval_coverage_pct']}% inside the {validation['nominal_interval_pct']}% range; {n} projects estimated")


if __name__ == "__main__":
    main()
