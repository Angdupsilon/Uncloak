"""Integrity checks for the GridSight database (read-only).

Connects with DATABASE_URL_RO (falls back to DATABASE_URL) and checks structure, Timescale
objects, read-only permissions, referential integrity, allowed values, duplicates, privacy,
scores recomputed from raw evidence, the weekly continuous aggregate, ERCOT rows, and parity
with data/seed. Exits 1 if any check fails.

Usage: python etl/check_integrity.py
"""
import math
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402  (loads the repo-root .env)
from common import STATE_FIPS  # noqa: E402
from score import backfill_dates, score_events  # noqa: E402

conn = psycopg.connect(os.getenv("DATABASE_URL_RO") or config.database_url(), autocommit=True)
conn.execute("SET TIME ZONE 'UTC'")
q = lambda sql, *a: conn.execute(sql, a or None).fetchall()
one = lambda sql, *a: conn.execute(sql, a or None).fetchone()[0]
results = []
def check(area, name, ok, detail=""):
    results.append((area, name, "PASS" if ok else "FAIL", detail))

# ---------- schema ----------
expected_tables = {"parents","entities","projects","evidence_events","project_scores","dc_load_reports","scoring_config",
                   "sites","project_sites","project_status_history","entity_parent_history",
                   "capacity_observations","ercot_project_links","source_refreshes","grid_regions","site_regions"}
tables = {r[0] for r in q("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")}
check("schema","GridSight tables present", expected_tables <= tables, f"missing={sorted(expected_tables-tables)}")
check("schema","no unexpected tables", tables <= expected_tables, f"extra={sorted(tables-expected_tables)}")
cols = {r[0] for r in q("select column_name from information_schema.columns where table_name='projects'")}
check("schema","projects has GridSight columns", {"project_id","entity_id","is_sample","lat","lon"} <= cols, str(sorted(cols)))
hts = {r[0] for r in q("select hypertable_name from timescaledb_information.hypertables")}
check("timescale","hypertables", hts == {"evidence_events","project_scores","dc_load_reports"}, str(sorted(hts)))
cagg = q("select view_name, materialized_only from timescaledb_information.continuous_aggregates")
check("timescale","continuous aggregate weekly_project_state", [c[0] for c in cagg] == ["weekly_project_state"], str(cagg))
check("timescale","view weekly_realistic_demand", one("select count(*) from information_schema.views where table_name='weekly_realistic_demand'") == 1)
idx = {r[0] for r in q("select indexname from pg_indexes where schemaname='public'")}
check("schema","unique name indexes", {"entities_llc_name_key","projects_name_key"} <= idx)
fks = {(r[0], r[1]) for r in q("""select conrelid::regclass::text, confrelid::regclass::text from pg_constraint
      where contype='f' and connamespace='public'::regnamespace""")}
need_fk = {("entities","parents"),("projects","entities"),("evidence_events","projects"),("project_scores","projects"),
           ("project_sites","projects"),("project_sites","sites"),("project_status_history","projects"),
           ("capacity_observations","projects"),("ercot_project_links","projects"),
           ("site_regions","sites"),("site_regions","grid_regions")}
check("schema","foreign keys declared", need_fk <= fks, f"missing={sorted(need_fk-fks)}")

# ---------- read-only role ----------
check("security","connected as gridsight_ro", one("select current_user") == "gridsight_ro")
check("security","statement_timeout = 3s", one("select current_setting('statement_timeout')") == "3s")
writable = [t for t in expected_tables if one("select has_table_privilege(current_user, %s, 'INSERT,UPDATE,DELETE,TRUNCATE')", "public."+t)]
check("security","read-only role cannot write any table", not writable, str(writable))
readable = [t for t in list(expected_tables)+["weekly_project_state","weekly_realistic_demand","ercot_queue"] if not one("select has_table_privilege(current_user, %s, 'SELECT')", "public."+t)]
check("security","read-only role can read all tables/views", not readable, str(readable))

# ---------- referential integrity ----------
for name, sql in [
  ("events -> projects", "select count(*) from evidence_events e left join projects p using (project_id) where p.project_id is null"),
  ("scores -> projects", "select count(*) from project_scores s left join projects p using (project_id) where p.project_id is null"),
  ("projects -> entities", "select count(*) from projects p left join entities e using (entity_id) where p.entity_id is not null and e.entity_id is null"),
  ("entities -> parents", "select count(*) from entities e left join parents pa using (parent_id) where e.parent_id is not null and pa.parent_id is null")]:
    n = one(sql); check("referential", name, n == 0, f"orphans={n}")
n = one("select count(*) from entities e where not exists (select 1 from projects p where p.entity_id=e.entity_id)")
check("referential","entities used by a project", n == 0, f"unused entities={n}")
unused_parents = [r[0] for r in q("select name from parents pa where not exists (select 1 from entities e where e.parent_id=pa.parent_id)")]
check("referential","parents used by an entity", not unused_parents, f"unused={unused_parents}")

# ---------- value rules ----------
bad = q("select e.event_type, e.source, p.state, count(*) from evidence_events e join projects p using (project_id) group by 1,2,3 order by 1,2,3")
check("values","event_type allowed", all(et in config.EVENT_SOURCES for et,_,_,_ in bad), str(bad))
check("values","source allowed", all(s in config.SOURCES for _,s,_,_ in bad))
mism = [(et,s,st,n) for et,s,st,n in bad if not config.source_allowed(et, s, st)]
check("values","event_type/source pairing matches spec for the project's state", not mism, str(mism))
n = one("select count(*) from evidence_events where event_type in ('building_registered','square_footage') and (value_num is null or value_num <= 0)")
check("values","costs / sq ft present and positive", n == 0, f"bad rows={n}")
n = one("select count(*) from evidence_events where event_type='tenant_named' and coalesce(payload->>'tenant','')=''")
check("values","tenant_named has tenant", n == 0, f"bad={n}")
n = one("select count(*) from evidence_events where ts > now() + interval '1 day'")
check("values","no future-dated evidence", n == 0, f"future={n}")
n = one("select count(*) from evidence_events where ts < '2000-01-01'")
check("values","no implausibly old evidence (<2000)", n == 0, f"n={n} (earliest {one('select min(ts)::date from evidence_events')})")
n = one("select count(*) from evidence_events where source_url is null or source_url !~ '^https://'")
check("values","every event has an https source link", n == 0, f"missing={n}")
n = one("select count(*) from projects where state = 'TX' and lat is not null and not (lat between 25.8 and 36.6 and lon between -106.7 and -93.5)")
check("values","Texas coordinates inside Texas bounding box", n == 0, f"outside={n}")
# Continental US, Alaska, Hawaii and Puerto Rico (a per-state box would be stricter).
n = one("""select count(*) from projects where state <> 'TX' and lat is not null and not (
          (lat between 24.3 and 49.5 and lon between -125 and -66.8) or (lat between 51 and 71.5 and lon between -180 and -129)
          or (lat between 18.8 and 22.4 and lon between -160.5 and -154.6) or (lat between 17.8 and 18.6 and lon between -67.4 and -65.2))""")
check("values","other coordinates inside the U.S.", n == 0, f"outside={n}")
n = one("select count(*) from projects where state !~ '^[A-Z]{2}$'")
check("values","every project has a 2-letter state", n == 0, f"bad={n}")
n = one("select count(*) from projects where (lat is null) <> (lon is null)")
check("values","lat/lon both set or both null", n == 0)
check("values","no SAMPLE projects", one("select count(*) from projects where is_sample or name ilike 'SAMPLE%'") == 0)
check("values","no SAMPLE ERCOT rows", one("select count(*) from ercot_queue where source_url='SAMPLE'") == 0)
n = one("select count(*) from projects p left join project_sites ps using(project_id) where ps.project_id is null")
check("values","every project linked to a canonical site", n == 0, f"unlinked={n}")
n = one("select count(*) from sites where (lat is null) <> (lon is null) or location_confidence not between 0 and 1")
check("values","site location provenance values valid", n == 0, f"bad={n}")
n = one("select count(*) from sites where lat is not null and location_source_url is null")
check("values","mapped canonical sites have a location source", n == 0, f"missing={n}")
n = one("select count(*) from capacity_observations where capacity_type <> 'modeled' and source_url !~ '^https://'")
check("values","sourced capacities have an https source", n == 0, f"bad={n}")
n = one("select count(*) from entities where (parent_id is null) <> (resolved_by is null)")
check("values","parent and resolved_by set together", n == 0, f"inconsistent={n}")
rb = q("select resolved_by, count(*) from entities group by 1 order by 1")
check("values","resolved_by values allowed", all(r is None or r in config.RESOLVED_BY for r,_ in rb), str(rb))
# ---------- grid-operator tags (lookup only) ----------
bad = [r for r in q("select site_id, state, county_fips from sites where county_fips is not null") if STATE_FIPS.get(r[1]) != r[2][:2]]
check("regions","site county FIPS inside the site's state", not bad, str(bad[:5]))
n = one("select count(*) from sites where (county_fips is null) <> (county_method is null) or county_method not in ('spatial_join','record_county')")
check("regions","county method set with every county FIPS", n == 0, f"bad={n}")
bad = q("select site_id, sum(confidence) from site_regions group by 1 having abs(sum(confidence) - 1) > 1e-9")
check("regions","each tagged site's operator confidences sum to 1 (1/n each)", not bad, str(bad[:5]))
n = one("select count(*) from site_regions r where abs(r.confidence * (select count(*) from site_regions x where x.site_id = r.site_id) - 1) > 1e-9")
check("regions","confidence = 1/n for n operators", n == 0, f"bad={n}")
n = one("select count(*) from site_regions r join sites s using (site_id) where s.county_fips is null")
check("regions","operator tags only on sites with a county", n == 0, f"bad={n}")
n = one("select count(*) from site_regions where source_url !~ '^https://' or method !~ '^eia861_[0-9]{4}_county_(fips|name)$'")
check("regions","operator tags cite EIA-861", n == 0, f"bad={n}")
n = one("select count(*) from sites where lat is not null and county_fips is null")
check("regions","located sites without a county (held for review / outside a county)", True, f"{n}")

pii = one(r"""select count(*) from evidence_events where payload::text ~
             '(\(\d{3}\) ?\d{3}-\d{4}|\m\d{3}-\d{3}-\d{4}\M|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,})'""")
check("privacy","no phone numbers or email addresses in payloads", pii == 0, f"hits={pii}")

# ---------- duplicates ----------
d = one("""select count(*) from (select project_id, ts, event_type, value_num, payload - '_origin' p, count(*) from evidence_events
          group by 1,2,3,4,5 having count(*)>1) x""")
check("duplicates","no duplicate evidence events", d == 0, f"dup groups={d}")
d = one("""select count(*) from (select payload->>'tdlr_project_number' n, count(*) from evidence_events
          where event_type='building_registered' and payload ? 'tdlr_project_number' group by 1 having count(*)>1) x""")
check("duplicates","each TDLR project registered once", d == 0, f"dups={d}")
d = one("""select count(*) from (select payload->>'owner_registration' r, payload->>'occupant_registration' o, count(*) from evidence_events
          where event_type='certified' and source='COMPTROLLER' group by 1,2 having count(*)>1) x""")
check("duplicates","each Comptroller registration once", d == 0, f"dups={d}")
d = one("""select count(*) from (select source, payload->>'company', payload->>'data_center_name', payload->>'mou_year',
          payload->>'site_location', payload->>'iedc_project_id', payload->>'certification_date', count(*) from evidence_events
          where event_type='certified' and source <> 'COMPTROLLER' group by 1,2,3,4,5,6,7 having count(*)>1) x""")
check("duplicates","each state-registry record once", d == 0, f"dups={d}")
bad = [(src, st, n) for src, st, n in q("select e.source, p.state, count(*) from evidence_events e join projects p using (project_id) group by 1,2")
       if config.SOURCE_STATE.get(src) not in (None, st)]
check("values","state records sit on projects in that state", not bad, str(bad))
d = one("select count(*) from (select project_id, ts, count(*) from project_scores group by 1,2 having count(*)>1) x")
check("duplicates","one score per project per date", d == 0, f"dups={d}")
d = one("select count(*) from (select ts, count(*) from ercot_queue group by 1 having count(*)>1) x")
check("duplicates","one ERCOT row per date", d == 0)

# ---------- scores vs recomputation ----------
cfg = conn.execute("select factors, mw_cost_per_mw_usd, mw_cost_source, backfill_start, computed_at from scoring_config").fetchone()
check("scoring","scoring_config matches etl/config.py",
      cfg and [f["key"] for f in cfg[0]] == [f["key"] for f in config.FACTORS] and [f["points"] for f in cfg[0]] == [f["points"] for f in config.FACTORS]
      and cfg[1] == config.MW_COST_PER_MW_USD, f"db $/MW={cfg and cfg[1]} config={config.MW_COST_PER_MW_USD}")
ev = pd.DataFrame(q("select ts, project_id, event_type, value_num from evidence_events"), columns=["ts","project_id","event_type","value_num"])
ev["ts"] = pd.to_datetime(ev["ts"], utc=True)
sc = pd.DataFrame(q("select ts, project_id, score, probability, mw_est, factors from project_scores"), columns=["ts","project_id","score","probability","mw_est","factors"])
sc["ts"] = pd.to_datetime(sc["ts"], utc=True)
mism = []; checked = 0
for (pid, ts), row in sc.set_index(["project_id","ts"]).iterrows():
    upto = ev[(ev.project_id == pid) & (ev.ts < ts + pd.Timedelta(days=1))]
    s = score_events(upto); checked += 1
    mw_ok = (s["mw_est"] is None and pd.isna(row.mw_est)) or (s["mw_est"] is not None and row.mw_est is not None and math.isclose(s["mw_est"], row.mw_est, rel_tol=1e-9))
    if s["score"] != row.score or not math.isclose(s["probability"], row.probability) or not mw_ok or s["factors"] != row.factors:
        mism.append((pid, str(ts.date()), s["score"], row.score))
check("scoring", f"all {checked} stored scores match recomputation from events", not mism, str(mism[:5]))
check("scoring","score range 0..100 and probability = score/100",
      one("select count(*) from project_scores where score not between 0 and 100 or abs(probability - score/100.0) > 1e-9") == 0)
today = datetime.now(timezone.utc).date()
exp_dates = set(pd.Timestamp(d, tz="UTC") for d in backfill_dates(config.BACKFILL_START, today))
got_dates = set(sc["ts"].unique())
check("scoring","backfill covers every Monday + today", exp_dates <= got_dates, f"missing={len(exp_dates-got_dates)} extra={len(got_dates-exp_dates)} latest={max(got_dates).date()}")
first_ev = ev.groupby("project_id").ts.min()
gaps = 0
for pid, t0 in first_ev.items():
    want = {d for d in exp_dates if d + pd.Timedelta(days=1) > t0}
    have = set(sc[sc.project_id == pid].ts)
    gaps += len(want - have)
check("scoring","no gaps in weekly scores after a project's first event", gaps == 0, f"missing rows={gaps}")
no_ev = [r[0] for r in q("select name from projects p where not exists (select 1 from evidence_events e where e.project_id=p.project_id)")]
check("scoring","projects without evidence (not scored)", True, f"{len(no_ev)}: {no_ev}")

# ---------- continuous aggregate ----------
latest_week = one("select max(week) from weekly_project_state")
latest_score = one("select max(ts) from project_scores")
check("timescale","aggregate refreshed through latest scores", latest_week is not None and latest_score - latest_week < timedelta(days=7), f"week={latest_week} scores={latest_score}")
agg = conn.execute("select realistic_gw, found_gw, projects from weekly_realistic_demand where week=%s", (latest_week,)).fetchone()
raw = conn.execute("""select sum(p*coalesce(mw,0))/1000.0, sum(coalesce(mw,0))/1000.0, count(*) from (
        select distinct on (s.project_id) s.project_id, s.probability p, s.mw_est mw from project_scores s
        join projects pr on pr.project_id = s.project_id and pr.state = 'TX'
        where s.ts >= %s and s.ts < %s + interval '7 days'
          and exists (select 1 from evidence_events x where x.project_id = s.project_id and x.event_type <> 'site_mapped')
        order by s.project_id, s.ts desc) x""", (latest_week, latest_week)).fetchone()
check("timescale","aggregate totals equal raw recomputation (latest week)",
      agg and all(math.isclose(float(a or 0), float(b or 0), rel_tol=1e-9, abs_tol=1e-12) for a, b in zip(agg, raw)), f"agg={agg} raw={raw}")

# ---------- ERCOT ----------
er = q("select ts::date, gw_requested, gw_approved, gw_observed_peak, source_url from ercot_queue order by ts")
bad = [r for r in er if (r[1] is not None and r[2] is not None and r[2] > r[1]) or (r[2] is not None and r[3] is not None and r[3] > r[2])]
check("ercot","observed <= approved <= requested where stated", not bad, str(bad))
check("ercot","every row links to an ercot.com document", len(er) > 0 and all((r[4] or "").startswith("https://www.ercot.com/") for r in er), f"rows={len(er)}")

# ---------- load reports (data-center scope) ----------
n = one("select count(*) from dc_load_reports where source_url !~ '^https://' or coalesce(quote,'') = ''")
check("load reports","every figure has an https source and its quote", n == 0, f"bad={n}")
n = one("select count(*) from dc_load_reports where scope = 'large_loads_all' and source_key <> 'ERCOT'")
check("load reports","large_loads_all only where a report's data-center share can be stated (ERCOT)", n == 0, f"bad={n}")
n = one("select count(*) from dc_load_reports where dc_share_pct is not null and dc_share_quote !~ '%'")
check("load reports","a data-center share always carries its quote", n == 0, f"bad={n}")
bad = q("""select source_key, region_key, ts::date, count(distinct scope) from dc_load_reports
          where source_key = 'GA_PSC' group by 1,2,3 having count(distinct scope) > 1""")
check("load reports","one scope per publisher report (never mixed)", not bad, str(bad))
n = one("select count(*) from dc_load_reports where metric in ('forecast','forecast_adjustment') and forecast_year is null")
check("load reports","forecasts name their year", n == 0, f"bad={n}")
view = q("select count(*), count(gw_requested), count(gw_approved), count(gw_observed_peak) from ercot_queue")[0]
check("load reports","ercot_queue view rows", view[0] > 0, f"rows/requested/approved/peak={view}")

# ---------- seed parity ----------
# data/seed always loads; data/seed_national is counted only when the database holds its rows.
seed_dirs = ["data/seed"] + (["data/seed_national"] if one("select count(*) from evidence_events where event_type='site_mapped'") else [])
# State importers' directories (data/seed_states/<source>/) count when their events are loaded.
for d in sorted((config.ROOT / "data" / "seed_states").glob("*/evidence_events.csv")):
    if one("select count(*) from evidence_events where payload->>'_origin' = %s", f"seed_csv:{d.parent.name}"):
        seed_dirs.append(str(d.parent.relative_to(config.ROOT)))
seed_ev = pd.concat([pd.read_csv(config.ROOT / d / "evidence_events.csv", dtype=str, keep_default_na=False) for d in seed_dirs])
valid = seed_ev[~seed_ev.apply(lambda r: "<<FILL" in "|".join(r.values), axis=1)]
check("parity","DB events == loadable seed rows", len(valid) == one("select count(*) from evidence_events"), f"seed={len(valid)} db={one('select count(*) from evidence_events')} dirs={seed_dirs}")
seed_pr = pd.concat([pd.read_csv(config.ROOT / d / "projects.csv", dtype=str, keep_default_na=False) for d in seed_dirs
                     if (config.ROOT / d / "projects.csv").exists()])
check("parity","DB projects == seed projects with a name", (~seed_pr.name.str.contains('<<FILL')).sum() == one("select count(*) from projects"))
n = one("select count(*) from evidence_events where event_type='site_mapped' and value_num is not null and value_num <= 0")
check("values","atlas footprints positive where stated", n == 0, f"bad={n}")

# ---------- report ----------
w = max(len(r[1]) for r in results)
for area, name, status, detail in results:
    print(f"{status:4}  {area:<11} {name:<{w}}  {detail if (status=='FAIL' or detail) else ''}"[:260])
print(f"\n{sum(r[2]=='PASS' for r in results)} passed, {sum(r[2]=='FAIL' for r in results)} failed")
sys.exit(1 if any(r[2] == "FAIL" for r in results) else 0)
