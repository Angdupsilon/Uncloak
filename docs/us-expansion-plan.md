# U.S. expansion plan

Goal: extend Uncloak from Texas to the whole United States. Every number must stay honest about
what we know, and estimates (for example, power use predicted from air permits or grid data)
are allowed as long as they are clearly separated from the record.

Companion documents: [`us-coverage.md`](us-coverage.md) (source research) and
[`data/raw/us_source_catalog.csv`](../data/raw/us_source_catalog.csv) (source catalog).
Plan date: 2026-09-26.

---

## 0. Ground rules for accuracy

Every value in the product gets exactly one of four labels. The first three already exist in
`web/lib/metrics.ts`; **modeled** is new.

| Label | Meaning | Example | Can it feed the evidence score? |
|---|---|---|---|
| **Documented** | Copied or summed from a public record, with a link | TDLR cost, air-permit generator MW, EIA-930 hourly demand | Yes (site-level records only) |
| **Derived** | Deterministic arithmetic on documented values, with the formula published | Cost ÷ $/MW (today's `mw_est`) | No |
| **Modeled** | A statistical estimate or prediction. Always a **range** (low / mid / high) with a method version and its inputs | IT load estimated from generator MW or floor area; regional data-center load scenarios | **Never** |
| **Context** | Background that is not a measurement of this site | County establishment counts; a region's utility forecast | No |

Two different kinds of "missing" must never look the same:

- **Not published here.** The state has no such record type (for example, Virginia has no
  incentive list). The UI shows "No public record of this type exists in VA."
- **Not found.** The record type exists but we found no match. The UI shows "Unavailable", as today.

Six further rules:

1. Modeled values live in their own table (`estimates`) and never overwrite documented values.
2. Every estimate stores `method`, `method_version`, `inputs` (the ids of the rows used),
   `low`/`mid`/`high` and `as_of`. A method change creates a new version rather than editing old rows.
3. Secondary compilations (the IM3 atlas, OpenStreetMap, FracTracker, Epoch) can place a site on
   the map and name an operator. They are labeled `corroborated` and never count as primary evidence.
4. Regional totals from different publishers (RTO forecast, utility report, queue) are shown side
   by side and **never added together** (they overlap).
5. The Texas output must be byte-for-byte unchanged by the refactor (a regression gate).
6. Model accuracy is **backtested on Texas**, where cost, floor area, permits and ERCOT totals all
   exist, before any model is shown for another state.

---

## 1. Data we can access today (downloaded and checked 2026-09-26)

Direct downloads from most agency sites are blocked in the current build environment. Two
public mirrors are reachable and cover a large part of the plan:

| Dataset | Access path | What we checked | Role |
|---|---|---|---|
| **IM3 Open Source Data Center Atlas** (PNNL, from OpenStreetMap, ODbL) | GitHub `IMMM-SFA/datacenter-atlas`, `gh-pages` branch: `im3_datacenter_centroids.geojson`, `im3_datacenter_footprints.geojson`; deployed 2026-03-31 | **1,382 sites in 45 states, DC and Puerto Rico** (none in AK, DE, HI, RI or VT). Operator named for 894; floor area (sq ft) for 1,288. Top states: VA 292, TX 120, CA 109, OR 106, OH 87, WA 73, AZ 60, IA 58, NJ 51, IL 46 | National site layer (corroborated locations) |
| IM3 projected siting scenarios | same repo, `projected/*.geojson` (low / moderate / high / higher growth) | 24 scenario files | Context layer, never evidence |
| **EIA-860 / 860M generators and plants** (via Catalyst Cooperative PUDL, CC-BY-4.0) | `s3.us-west-2.amazonaws.com/pudl.catalyst.coop/nightly/out_eia__yearly_generators.parquet`, `out_eia__yearly_plants.parquet`, `core_eia860m__changelog_generators.parquet` | Every U.S. generator; 860M through **2026-07**. **17 plants report NAICS 518 (data processing) as their primary purpose**, e.g., Apple Data Center Maiden NC (fuel cells + PV), CoreSite Santa Clara, Thomson Reuters Eagan MN | Spare-capacity page, national. Documented on-site generation evidence for the 17 plants |
| **EPA CEMS hourly unit load** (CAMPD, via PUDL) | `core_epacems__hourly_emissions.parquet` (4.9 GB) | National | Spare-capacity hourly output |
| **EIA-930 hourly demand** (via PUDL) | `out_eia930__hourly_aggregated_demand.parquet` (by region, interconnect and CONUS), `out_eia930__hourly_operations.parquet` (by balancing authority) | Hourly demand through **2026-09-06** | Documented grid demand; input to the regional load model |
| **FERC Form 714 planning-area forecasts** (via PUDL) | `core_ferc714__yearly_planning_area_demand_forecast.parquet` + `core_ferc714__respondent_id.parquet` | 88 respondents; 2025 filings forecast to 2050 | Documented utility / RTO forecasts |
| **EIA-861 service territories** (via PUDL) | `out_eia861__yearly_balancing_authority_service_territory.parquet`, `out_eia861__yearly_utility_service_territory.parquet` | County-to-balancing-authority table for 2025. **Places 1,255 of 1,382 atlas sites in a county by name** (976 in counties with one balancing authority, 279 in counties with several) | Assigns sites to grid regions |
| Census county boundaries (via PUDL) | `out_censusdp1tract__counties.parquet` | National | County FIPS by spatial join (fixes the 127 name mismatches, e.g., Fairfax VA, Hudson NJ) |

**Still blocked** (the network allowlist needs these hosts): deq.virginia.gov, mde.maryland.gov,
dceo.illinois.gov, revenue.state.mn.us, iedc.in.gov, dor.wa.gov, goed.nv.gov, wedc.org,
azcommerce.com, psc.ga.gov, pjm.com, misoenergy.org, epoch.ai, echo.epa.gov, api.census.gov,
peeringdb.com, overpass-api.de and fractracker.org.

### Findings from the accessible data

- **Regional demand growth (EIA-930, average hourly demand).** Texas grew from 44.8 GW (2021) to
  55.7 GW (2025), **+24%**, the fastest of the 13 EIA regions. Next are the Southwest (+13%),
  Central (+11%), Florida (+11%) and the Northwest (+7%). Mid-Atlantic (PJM) +6%, Tennessee +7%,
  Carolinas +5%, California +1.5%, New England −1.6%.
- **Forecast summer-peak growth, 2026→2031 (FERC 714, 2025 filings):** ERCOT +49.9 GW (+53%),
  PJM +34.6 GW (+22%), MISO +21.6 GW (+16%), SPP +16.7 GW (+28%), Georgia Power +8.8 GW (+49%),
  CAISO +5.0 GW, Sierra Pacific (NV) +4.1 GW (+130%), Duke Carolinas +3.9 GW, Salt River
  Project +3.3 GW, APS +3.0 GW. These overlap, because some utilities sit inside RTOs, so they
  are **not additive**.
- **Texas calibration set in our own seed:** 43 projects have both a TDLR construction cost and
  floor area, and 2 permitted projects (TX21-22, Microsoft SAT 15-17) also have a cost. ERCOT's
  latest observed peak of energized large loads is 5.9 GW (April 2026 monthly report).

---

## 2. Target data model

The refactor happens in one migration, `db/006_national.sql`, and keeps every existing Texas row.

```
jurisdictions        (state char(2), county_fips char(5), name)            -- Census
sources              (source_key, name, publisher, role, jurisdiction, license, url, verification)
                      role: incentive_registry | air_permit | building_record | location_layer
                            | grid_demand | grid_forecast | load_queue | context
source_availability  (state, role, status, checked_at)                     -- "not published here" vs present
projects / sites     + state char(2) NOT NULL, county_fips char(5), location_status
                      UNIQUE (state, name) replaces UNIQUE (name)
evidence_events      source → source_key (FK to sources); + role (denormalized for scoring)
grid_regions         (region_key, kind: rto|ba|utility|eia_region, name)
site_regions         (site_id, region_key, method: ba_territory|spatial|manual, confidence)
load_reports         (region_key, ts, metric: requested|approved|energized|committed|forecast_peak,
                      value_mw, source_key, source_url, quote)                -- generalizes ercot_queue
region_demand_hourly (region_key, ts, demand_mw)                            -- EIA-930 hypertable
estimates            (subject_kind: site|region, subject_id, metric, as_of, low, mid, high, unit,
                      method, method_version, inputs jsonb, notes)          -- modeled values only
```

TimescaleDB: `region_demand_hourly` becomes a hypertable with a daily continuous aggregate
(the same pattern as `plant_output_daily`). `load_reports` replaces `ercot_queue`, and a
compatibility view `ercot_queue` keeps `db/004_queue_timeline.sql` and `/api/summary` working
during the transition.

---

## 3. Phased implementation

Each phase ships on its own, keeps Texas unchanged, and ends with `etl/check_integrity.py` passing.

### Phase 0: Generalize without adding data (about 1 week)

| Task | Files |
|---|---|
| `006_national.sql` migration; `state='TX'` backfill; `ercot_queue` compatibility view | `db/` |
| Source registry replaces the hard-coded `SOURCES` / `EVENT_TYPES` pairs; roles attach to event types | `etl/config.py`, `etl/load_seed.py` |
| Replace Texas bounding-box checks with per-state bounds from the Census counties table | `etl/import_locations.py:25`, `etl/check_integrity.py:91`, `web/lib/geo.ts:37`, `web/lib/constants.ts:59` |
| Geocoders use the row's state; remove the "outside Texas" rejection | `etl/geocode.py:38,60`, `web/lib/geocode.ts` |
| Regression gate: re-run the Texas load and diff `project_scores`, `/api/summary` and `/api/projects` against the pre-migration snapshot. They must be identical | `etl/check_integrity.py` |

### Phase 1: National site layer (about 1 week; data already accessible)

1. `etl/import_im3_atlas.py`: read the two GeoJSON files, then:
   - assign `county_fips` by spatial join to the Census counties (not by name)
   - create `sites` with `location_method='osm_im3'` and `location_status='corroborated'`;
     `operator` goes to an entity with `resolved_by='OSM_OPERATOR'`
   - store footprint `sqft` as a **documented** attribute of the OSM feature, labeled as
     building footprint, not data-hall area
   - store each file snapshot as a `source_refreshes` row (commit SHA, date, count)
2. **Texas deduplication:** match the 120 Texas atlas sites to the 182 existing projects by
   (a) normalized address, then (b) distance under 250 m plus a shared operator or parent name.
   Unmatched pairs stay separate and are listed for review, following the `tdlr_registry_matches.csv` pattern.
3. `etl/import_eia_dc_plants.py`: the 17 NAICS-518 plants become a documented
   `onsite_generation` event (value = nameplate MW, EIA plant id). Match them to atlas sites
   within 1 km.
4. Site-to-grid-region assignment (`site_regions`): EIA-861 balancing-authority territory by
   county FIPS. Where a county has several balancing authorities, store all of them with
   `confidence = 1/n` and show "served by one of N". Never pick one silently.
5. Spare capacity goes national: `etl/load_plants.py` reads the PUDL EIA-860/860M and EPA CEMS
   parquet files and drops the ERCOT filter. `REGION_RULES` in `web/lib/spare.ts` gains the
   FERC Order 845 text for non-ERCOT regions.

### Phase 2: Grid layer (about 1–2 weeks; data already accessible)

1. `etl/load_grid_demand.py`: EIA-930 hourly demand by balancing authority and region goes into
   `region_demand_hourly` (**documented**, CC-BY via PUDL).
2. `etl/load_grid_forecasts.py`: FERC 714 forecasts go into `load_reports` with
   `metric='forecast_peak'` (**documented**). Each value keeps its respondent's own label.
3. Move ERCOT's 27 rows into `load_reports` (`region_key='ERCOT'`), with no value changes.
4. Once the hosts are allowlisted: Georgia Power quarterly large-load reports (`committed`),
   PJM per-zone large-load adjustments (`forecast_peak`, data-center portion) and MISO
   large-load review batches (`requested`). Each report gets a `quote`, as the ERCOT rows have.
5. The queue timeline becomes region-aware: a region selector (ERCOT, PJM, MISO, SPP, SOCO/Georgia
   Power, …). "Unaccounted-for load" is computed only for regions that have a request total, and only
   against sites assigned to that region.

### Phase 3: State evidence, one state at a time (ongoing; needs the network allowlist)

Priority order, by market size × record quality:

| Order | State | Importer | Evidence role |
|---|---|---|---|
| 1 | VA | `import_va_deq_air.py`: DEQ data-center air-permit list + permit PDFs (generator count and MW) | air_permit |
| 2 | IL | `import_il_dceo.py`: annual reports 2020–2025 | incentive_registry |
| 3 | OH | `import_oh_tca.py`: Tax Credit Authority approvals | incentive_registry |
| 4 | MN, IN, WA, NV, WI, AZ | one importer each, shaped like `import_comptroller.py` | incentive_registry |
| 5 | MD, GA, AZ (Maricopa) | air-permit importers | air_permit |
| 6 | All states | EPA ECHO Clean Air Act facilities with NAICS 518210 | air_permit (a missing record means "not found", never "no permit") |
| 7 | Loudoun, Prince William (VA) | county GIS / permit layers | building_record |

Each importer writes its `source_availability` rows, so a state without that record type shows
"not published here". Each gets a `data/raw/README.md` section describing how it was verified,
matching the Texas standard.

### Phase 4: Modeled estimates ("what usage might be")

All models live in `etl/models/` and write only to `estimates`, with a version string. None of
them feeds the evidence score.

**Model A: IT load from air-permit generator capacity** (sites with a permit)

- Input (documented): permitted generator nameplate MW (for example, Aligned Frederick: 168 × 3 MW + 4 × 1 MW = 508 MW).
- Relationship: generator MW ≈ IT MW × PUE × redundancy factor. Backup generators cover the
  whole facility load (IT plus cooling), usually with N+1 to 2N redundancy.
- Output: `it_mw` low/mid/high = generator MW ÷ (PUE × redundancy), using ranges for both
  factors. The ranges are set by calibration and are not assumed. Calibration uses the Texas
  sites that have a TCEQ permit plus a TDLR-derived MW (2 today; more as TCEQ matching grows),
  plus any site where an operator has publicly stated its MW.
- Stated limit: this estimates **built capacity**, not actual use.

**Model B: IT load from floor area** (all 1,288 atlas sites with floor area)

- Fit on Texas: the 43 projects with both TDLR floor area and cost-derived MW. Output = the
  distribution of MW per sq ft. Report its quantiles, never a single coefficient.
- Apply to atlas footprints using the 10th/50th/90th percentiles for low/mid/high.
- Stated limits: the training MW is itself derived (cost ÷ $/MW), and building footprint is not
  data-hall area. The range stays wide on purpose.
- Validation: leave-one-out on Texas; report median absolute percentage error on the methodology page.

**Model C: Energy use from capacity** (any site with Model A or B, or documented MW)

- `annual_mwh = it_mw × PUE × utilization × 8,760`, with utilization and PUE as ranges.
- Replace the assumed ranges with EIA's data-center survey results when they are published
  (the pilot is running in TX, WA and VA/DC).

**Model D: Regional data-center load signal** (every EIA region and balancing authority)

- Input (documented): EIA-930 hourly demand, 2019 onward.
- Method: split each region's demand trend into seasonal, trend and residual parts. Growth in
  the **overnight floor** (demand in the lowest hours) is the signal most consistent with
  constant large loads such as data centers. Report `baseload_growth_mw` with a confidence band.
- Label: **context, not attribution.** It says a region's constant load grew by X, not that
  data centers used X.
- Backtest: in Texas, compare against ERCOT's observed energized large load (5.9 GW, April 2026).
  Publish the ratio. If the signal doesn't track ERCOT, the model is not shown elsewhere.

**Model E: Forward scenarios, 2026–2031** (regions with forecasts)

- Low: sum of Model A/B `low` for sites with documented construction or permit evidence, plus
  energized load.
- Mid: the utility's own data-center or large-load forecast component, where published (PJM
  zones, Georgia Power), else the FERC 714 peak-growth forecast × Model D's baseload share.
- High: the published request or queue total (ERCOT requested, Georgia Power pipeline).
- These are shown as **three labeled scenarios with their publishers**, not as a prediction of
  one number.

### Phase 5: Product changes

| Surface | Change |
|---|---|
| Map | National view (US states/counties TopoJSON from Census); zoom to state; marker style by location status (primary / corroborated) |
| Site profile | Three blocks: **Documented** (records), **Modeled** (ranges with method link), **Not published here** (record types that don't exist in this state) |
| Dashboard summary bar | Region selector replaces the ERCOT-only bar; each figure shows its publisher and date |
| New `/coverage` page | State × record-type matrix generated from `source_availability` |
| Methodology | One section per model: inputs, formula, calibration set, backtest error, version history |
| Ask Uncloak | Tools gain `state` and `region` parameters; answers must name the label (documented / modeled) of every figure |

---

## 4. Scoring across states

Today 70 of 100 points need TDLR, so any site outside Texas would score at most 30. The
redesign scores each evidence *role*:

| Role | Points | Texas source | Elsewhere |
|---|---|---|---|
| Building record (registered, multi-building, value) | 45 | TDLR | County permits (rare) |
| Tenant or operator named in a primary record | 20 | TDLR tenant | Incentive registries, permits |
| Incentive certification | 15 | Comptroller | 10 other states |
| Air permit | 15 | TCEQ | VA/MD/ECHO/state portals |
| Inspection or on-site generation | 5 | TDLR inspection | EIA-860 NAICS 518 |

Show two numbers instead of one:

- **Evidence index** = points earned ÷ points **available in that state**. It stays labeled
  "uncalibrated", as today.
- **Record coverage** = points available in that state ÷ 100. This makes it visible that a
  Virginia score rests on fewer record types.

In Texas every role is available, so points available = 100 and the index equals today's
score. That keeps the Phase 0 regression gate valid only if each Texas role keeps today's
source. In particular, "tenant or operator named" must stay TDLR-tenant-only in Texas. Otherwise
Comptroller operator names would raise Texas scores, a deliberate method change that needs its
own version and announcement.

---

## 5. Verification and accuracy safeguards

| Check | Where | Fails when |
|---|---|---|
| Every row has `state` and a valid FIPS | `check_integrity.py` | Missing, or the point is outside its stated county |
| Every `estimates` row has low ≤ mid ≤ high, a method version and inputs | `check_integrity.py` | Any missing |
| No estimate feeds `project_scores` | `check_integrity.py` | Any factor references a modeled value |
| Load reports from different publishers are never summed | Unit test on `/api/summary` | A query aggregates across `source_key` |
| Texas regression | CI job | Any Texas score or API output changes |
| Model backtests | `etl/models/backtest.py` | Error above the published threshold; the model is hidden |
| Source freshness | `source_refreshes` | Snapshot older than its cadence (e.g., EIA-930 > 14 days) |

---

## 6. Decisions needed

1. **ODbL share-alike.** The IM3 atlas is ODbL. Keep atlas-derived rows in their own tables so
   Uncloak's own evidence database is not a derivative work, or accept share-alike for the whole
   site layer.
2. **Network allowlist.** Phases 2.4 and 3 need the hosts listed in section 1.
3. **Commercial use.** FracTracker is non-commercial only. Use it as a private lead list, or leave it out.
4. **Model thresholds.** The backtest error above which a model is hidden (proposal: median
   absolute error over 50% hides Model B for that state).
5. **Scope of "entire United States."** The atlas has no sites in AK, DE, HI, RI or VT and
   includes Puerto Rico. Those five states would start empty. Confirm whether territories are in scope.

---

## 7. Sequence summary

| Phase | Data needed | Blocked? | Output |
|---|---|---|---|
| 0 Generalize | none | no | Schema, sources and scoring ready; Texas unchanged |
| 1 Site layer | IM3 atlas, EIA-860, Census counties | **no** | 1,382 sites in 45 states + DC + PR on the map, each assigned to a grid region |
| 2 Grid layer | EIA-930, FERC 714, EIA-861 (+ ISO reports later) | partly | Region-aware queue timeline, national demand |
| 3 State evidence | VA DEQ, IL, OH, MN, IN, WA, NV, WI, AZ, MD, ECHO | **yes, allowlist** | Documented evidence and scores outside Texas |
| 4 Models | Phases 1–3 + Texas calibration | no (A needs Phase 3) | Ranges for IT MW, annual MWh and regional scenarios |
| 5 Product | all | no | National map, coverage page, labeled estimates |
