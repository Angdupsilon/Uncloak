# U.S. expansion plan (data centers)

Goal: extend Uncloak from Texas to the whole United States **as a data-center tracker**. Every
number stays honest about what we know, and data-center estimates (for example, power use
predicted from air permits or floor area) are allowed as long as they are clearly separated
from the record.

> **Status (2026-09-26):** Phase 1's national data-center layer is implemented. The IM3 atlas loads
> through `etl/import_im3_atlas.py` into `data/seed_national/` (1,368 sites; 14 Texas features held
> for review), every project and site carries a `state`, and the dashboard, public pages and
> Ask Uncloak use the same display for every state, with an **Area** picker. ERCOT comparisons
> stay Texas-only, and Texas scores are unchanged. Grid-operator tags (`site_regions`, EIA-861 2024
> by county, 1/n confidence) are loaded for 1,460 of 1,530 sites. Still to do: role-based scoring
> (section 5), data-center load reports (Phase 2) and state records (Phase 3). The EIA NAICS-518 plants were left out: only 3 of 17 match an atlas site within
> 500 m with operating capacity.

Companion documents: [`us-coverage.md`](us-coverage.md) (source research) and
[`data/raw/us_source_catalog.csv`](../data/raw/us_source_catalog.csv) (source catalog).
Plan date: 2026-09-26.

---

## 0. Scope: data centers, not the grid in general

Uncloak answers: *where are data centers, who is behind them, how big are they, how far along
are they, and how much power are they asking for or likely to use?*

A dataset enters the product only if it passes one of these tests:

1. **It is about data centers.** It names data-center sites, operators or permits, or it
   reports a figure the publisher itself attributes to data centers (for example, "~90% of
   the 474 GW are data centers").
2. **It is needed to place or describe a data center.** For example, which utility or grid
   operator serves the county a site is in. The dataset is used only as a lookup and is never
   shown as its own figure.

| In scope | Out of scope for this plan |
|---|---|
| Data-center site lists, footprints, operators | Total regional electricity demand (EIA-930) |
| Data-center tax-incentive registries | Utility peak forecasts that are not split by customer type (FERC 714) |
| Air permits for data-center backup generators | Generation of power plants that are not data centers |
| Building / permit records for data centers | Grid-wide load growth models |
| Power plants whose EIA-reported purpose is data processing (NAICS 518) | |
| Large-load requests **where the publisher states the data-center share** | Large-load totals with no data-center split, unless shown as clearly labeled context |
| Which grid operator serves a data center (lookup only) | |

The existing **spare-capacity page** (idle power-plant connections) is a separate product
track. Taking it national would use EIA-860 and EPA CEMS, which are reachable (see the
appendix), but it is not part of this data-center plan.

---

## 1. Ground rules for accuracy

Every value gets exactly one label. The first three already exist in `web/lib/metrics.ts`;
**modeled** is new.

| Label | Meaning | Data-center example | Can it feed the evidence score? |
|---|---|---|---|
| **Documented** | Copied or summed from a public record, with a link | TDLR cost; generator MW in a data-center air permit; ERCOT's stated data-center share | Yes (site-level records only) |
| **Derived** | Deterministic arithmetic on documented values, with the formula published | Cost ÷ $/MW (today's `mw_est`); ERCOT requested GW × stated data-center share | No |
| **Modeled** | Statistical estimate or prediction. Always a **range** (low / mid / high) with a method version and its inputs | A site's IT load from generator MW or floor area; yearly energy use | **Never** |
| **Context** | Background that is not a data-center measurement | County establishment counts; a large-load total with no data-center split | No |

Two different kinds of "missing" must never look the same:

- **Not published here.** The state has no such record type (for example, Virginia has no
  incentive list). The UI shows "No public record of this type exists in VA."
- **Not found.** The record type exists but we found no match. The UI shows "Unavailable", as today.

Seven further rules:

1. Modeled values live in their own table (`estimates`) and never overwrite documented values.
2. Every estimate stores `method`, `method_version`, `inputs` (the ids of the rows used),
   `low`/`mid`/`high` and `as_of`. A method change creates a new version rather than editing old rows.
3. Secondary compilations (the IM3 atlas, OpenStreetMap, FracTracker, Epoch) can place a site
   on the map and name an operator. They are labeled `corroborated` and never count as primary evidence.
4. **A data-center share is never assumed or carried across reports.** ERCOT says ~87%
   (March 2026) and ~90% (June 2026) of its tracked large loads are data centers. Earlier
   ERCOT reports give no share, so their data-center portion is "not stated", not 87%.
5. Figures from different publishers (grid operator, utility, queue) are shown side by side and
   **never added together**.
6. The Texas output must be byte-for-byte unchanged by the refactor (a regression gate).
7. Every model is **backtested on Texas data centers** before it is shown for another state.

---

## 2. Data-center data we can access today (downloaded and checked 2026-09-26)

Direct downloads from most agency sites are blocked in the current build environment. Two
public mirrors, GitHub and Catalyst Cooperative's PUDL, are reachable:

| Dataset | Access path | What we checked | Role |
|---|---|---|---|
| **IM3 Open Source Data Center Atlas** (PNNL, from OpenStreetMap, ODbL) | GitHub `IMMM-SFA/datacenter-atlas`, `gh-pages` branch: `im3_datacenter_centroids.geojson`, `im3_datacenter_footprints.geojson`; deployed 2026-03-31 | **1,382 data centers in 45 states, DC and Puerto Rico** (none in AK, DE, HI, RI, VT). 1,239 buildings, 49 campuses, 94 points. Operator named for 894; floor area for 1,288 (332M sq ft total; median 129k sq ft). Top states: VA 292, TX 120, CA 109, OR 106, OH 87, WA 73, AZ 60, IA 58, NJ 51, IL 46 | National data-center site layer (corroborated) |
| Atlas operators | same | Amazon Web Services 203, Digital Realty 69, Google 66, Microsoft 54, Meta 50, Flexential 42, Equinix 40, QTS 37, CyrusOne 20, NTT 19 | Seeds the national parent/operator list |
| **Data-center power plants** (EIA-860, via PUDL, CC-BY-4.0) | `out_eia__yearly_plants.parquet` filtered to primary-purpose NAICS 518 | **17 plants whose reported purpose is data processing**, e.g., Apple Data Center Maiden NC (fuel cells + 3 solar arrays), CoreSite Santa Clara, Thomson Reuters / West Group Eagan MN, Extreme Networks Santa Clara | Documented on-site generation at data centers |
| **Grid-operator lookup** (EIA-861, via PUDL) | `out_eia861__yearly_balancing_authority_service_territory.parquet` | County-to-balancing-authority table for 2025. **Places 1,255 of 1,382 data centers in a served county by name** (976 in counties with one balancing authority, 279 with several) | Lookup only: tags each data center with its grid operator |
| Census county boundaries (via PUDL) | `out_censusdp1tract__counties.parquet` | National | County FIPS for data centers by spatial join |
| IM3 projected data-center siting | same GitHub repo, `projected/*.geojson` | 24 scenario files (low → higher growth) | Context layer: "where new data centers could go", never evidence |

**Data-center sources still blocked** (the network allowlist needs these hosts):
deq.virginia.gov (data-center air permits), mde.maryland.gov, dceo.illinois.gov,
revenue.state.mn.us, iedc.in.gov, dor.wa.gov, goed.nv.gov, wedc.org, azcommerce.com (incentive
registries), psc.ga.gov and pjm.com (data-center load reports), epoch.ai (AI campus power
estimates), echo.epa.gov, peeringdb.com, overpass-api.de and fractracker.org.

### Calibration data already in our Texas seed

- 43 Texas data-center projects have both a TDLR construction cost and floor area.
- 2 permitted Texas data centers (TX21-22, Microsoft SAT 15-17) also have a construction cost.
- ERCOT's stated data-center share of tracked large-load requests: ~87% of ~410 GW (2026-03-26)
  and ~90% of ~474 GW (June 2026). Both are quoted in `data/raw/ercot_large_load_queue.csv`.

---

## 3. Target data model

One migration, `db/006_national.sql`, keeps every existing Texas row.

```
jurisdictions        (state char(2), county_fips char(5), name)            -- Census
sources              (source_key, name, publisher, role, jurisdiction, license, url, verification)
                      role: incentive_registry | air_permit | building_record | dc_location_layer
                            | dc_power_plant | dc_load_report | region_lookup | context
source_availability  (state, role, status, checked_at)                     -- "not published here" vs present
projects / sites     + state char(2) NOT NULL, county_fips char(5), location_status
                      UNIQUE (state, name) replaces UNIQUE (name)
evidence_events      source → source_key (FK to sources); + role (denormalized for scoring)
grid_regions         (region_key, kind: rto|ba|utility, name)               -- lookup only
site_regions         (site_id, region_key, method, confidence)              -- which grid serves a data center
dc_load_reports      (region_key, ts, metric: requested|approved|energized|committed|forecast,
                      scope: data_centers|large_loads_all,
                      value_mw, dc_share_pct, dc_share_quote,
                      source_key, source_url, quote)                          -- generalizes ercot_queue
estimates            (subject_kind: site|state|region, subject_id, metric, as_of,
                      low, mid, high, unit, method, method_version, inputs jsonb, notes)
```

`dc_load_reports.scope` enforces rule 4. A `large_loads_all` row shows a data-center figure only
when `dc_share_pct` is filled from that same document; otherwise the UI shows the total as
labeled context. A compatibility view `ercot_queue` keeps `db/004_queue_timeline.sql` and
`/api/summary` working during the transition.

No table stores general grid demand.

---

## 4. Phased implementation

Each phase ships on its own, keeps Texas unchanged, and ends with `etl/check_integrity.py` passing.

### Phase 0: Generalize without adding data (about 1 week)

| Task | Files |
|---|---|
| `006_national.sql` migration; `state='TX'` backfill; `ercot_queue` compatibility view | `db/` |
| Source registry replaces the hard-coded `SOURCES` / `EVENT_TYPES` pairs; roles attach to event types | `etl/config.py`, `etl/load_seed.py` |
| Replace Texas bounding-box checks with per-state bounds | `etl/import_locations.py:25`, `etl/check_integrity.py:91`, `web/lib/geo.ts:37`, `web/lib/constants.ts:59` |
| Geocoders use the row's state; remove the "outside Texas" rejection | `etl/geocode.py:38,60`, `web/lib/geocode.ts` |
| Regression gate: diff Texas `project_scores`, `/api/summary` and `/api/projects` before and after. They must be identical | `etl/check_integrity.py` |

### Phase 1: National data-center layer (about 1 week; data already accessible)

1. `etl/import_im3_atlas.py`: read the atlas GeoJSON, then:
   - assign `county_fips` by spatial join to Census counties
   - create a `site` per data center with `location_method='osm_im3'`,
     `location_status='corroborated'`; the atlas `operator` becomes an entity
     (`resolved_by='OSM_OPERATOR'`) linked to a parent when the name matches one exactly
   - store footprint `sqft` as a **documented** attribute of the mapped building, labeled
     "building footprint" (not data-hall area)
   - record the snapshot in `source_refreshes` (commit SHA, date, count)
2. **Texas deduplication:** match the 120 Texas atlas data centers to the 182 existing
   projects by normalized address, then by distance under 250 m plus a shared operator or
   parent. Unmatched pairs go to a review file, following `tdlr_registry_matches.csv`.
3. `etl/import_eia_dc_plants.py`: the 17 NAICS-518 plants become documented
   `onsite_generation` events (nameplate MW, EIA plant id) on the data center within 1 km.
4. Grid-operator tag (`site_regions`): EIA-861 territory by county FIPS. Where a county has
   several balancing authorities, store all of them with `confidence = 1/n` and show
   "served by one of N". This lets a data center be compared with its grid operator's
   data-center load report. It never adds grid demand to the product.

### Phase 2: Data-center load reports (needs the allowlist for all but ERCOT)

Only reports that speak about data centers, or state a data-center share:

| Region | Report | What gets stored |
|---|---|---|
| ERCOT | Existing 27 rows | Move to `dc_load_reports` with `scope='large_loads_all'`. Fill `dc_share_pct` only for the two reports that state it (87%, 90%). The dashboard's data-center line starts at March 2026 and says so |
| Georgia Power | Quarterly Large Load Economic Development Reports (Georgia PSC) | Committed MW. Store `scope='data_centers'` only if the report attributes the load to data centers; otherwise `large_loads_all` |
| PJM | 2026 load forecast, per-zone large-load adjustment documents | Only the adjustments PJM labels as data-center driven (14 zones in 2026) |
| Dominion, AEP, other utilities | IRPs and PSC filings stating data-center contracted MW | `scope='data_centers'` |
| MISO, SPP | Large-load review batches | Only when the request is identified as a data center |

The queue timeline becomes a region picker. "Unaccounted-for data-center load" (reported
data-center MW minus data-center MW found in records) is computed only for regions with a
data-center-scoped figure, and only against data centers tagged to that region.

### Phase 3: State data-center records, one state at a time (needs the allowlist)

| Order | State | Importer | Evidence role |
|---|---|---|---|
| 1 | VA | `import_va_deq_air.py`: DEQ's data-center air-permit list + permit PDFs (generator count and MW) | air_permit |
| 2 | IL | `import_il_dceo.py`: data-center investment program reports 2020–2025 | incentive_registry |
| 3 | OH | `import_oh_tca.py`: Tax Credit Authority data-center exemptions | incentive_registry |
| 4 | MN, IN, WA, NV, WI, AZ | one importer each, shaped like `import_comptroller.py` | incentive_registry |
| 5 | MD, GA, AZ (Maricopa) | data-center air-permit importers | air_permit |
| 6 | All states | EPA ECHO Clean Air Act facilities with NAICS 518210 | air_permit (a missing record means "not found", never "no permit") |
| 7 | Loudoun, Prince William (VA) | county data-center permit / GIS layers | building_record |

Each importer writes its `source_availability` rows, so a state without that record type shows
"not published here". Each gets a `data/raw/README.md` section describing how it was verified.

### Phase 4: Data-center estimates ("what usage might be")

All models live in `etl/models/` and write only to `estimates`, with a version string. None of
them feeds the evidence score. Every input is a data-center record.

**Model A: IT load from air-permit generator capacity** (data centers with a permit)

- Input (documented): permitted backup-generator nameplate MW (for example, Aligned Frederick
  MD: 168 × 3 MW + 4 × 1 MW = 508 MW).
- Relationship: backup generators cover the whole facility load (IT plus cooling), usually
  with N+1 to 2N redundancy. So generator MW ≈ IT MW × PUE × redundancy factor.
- Output: `it_mw` low/mid/high = generator MW ÷ (PUE × redundancy), with both factors as
  ranges set by calibration: Texas data centers with a TCEQ permit plus a TDLR-derived MW
  (2 today), plus data centers whose operator has publicly stated its MW.
- Stated limit: this estimates **built capacity**, not actual use.

**Model B: IT load from floor area** (the 1,288 atlas data centers with floor area)

- Fit on the 43 Texas data centers with both TDLR floor area and cost-derived MW. Output = the
  distribution of MW per sq ft, reported as quantiles.
- Apply to atlas footprints using the 10th/50th/90th percentiles for low/mid/high.
- Stated limits: the training MW is itself derived (cost ÷ $/MW), and building footprint is not
  data-hall area. The range stays wide on purpose.
- Validation: leave-one-out on Texas; report median absolute percentage error on the methodology page.

**Model C: Yearly energy use** (any data center with Model A or B, or documented MW)

- `annual_mwh = it_mw × PUE × utilization × 8,760`, with utilization and PUE as ranges.
- Replace the assumed ranges with EIA's data-center survey results when they are published
  (the pilot is running in TX, WA and VA/DC).

**Model D: Data-center totals by state and grid region** (every state)

- Sum of each data center's Model A/B/C range, split by evidence tier (the same idea as
  today's `realistic_gw`). Documented MW is used where it exists.
- Shown next to the region's **data-center-scoped** load report where one exists, never as a
  replacement for it.
- Backtest: Texas total vs. ERCOT's data-center share of energized large load, where ERCOT
  states one.

**Model E: Forward data-center scenarios, 2026–2031** (regions with data-center reports)

- Low: modeled MW of data centers with construction or permit evidence, plus documented
  energized data-center load.
- Mid: the publisher's own **data-center** forecast component (PJM data-center zone
  adjustments, Georgia Power if attributed to data centers).
- High: requested load × the publisher's stated data-center share (ERCOT: 474 GW × ~90%,
  June 2026).
- Shown as three labeled scenarios with their publishers. A region with no data-center-scoped
  report shows only the low scenario and "no data-center forecast published".

### Phase 5: Product changes

| Surface | Change |
|---|---|
| Map | National data-center map (Census states/counties TopoJSON); marker style by location status (primary / corroborated) |
| Site profile | Three blocks: **Documented** (records), **Modeled** (ranges with method link), **Not published here** (record types that don't exist in this state). Grid operator shown as a tag |
| Dashboard summary bar | Region picker; shows data-center-scoped figures only, each with publisher, date and the quoted data-center share |
| New `/coverage` page | State × data-center-record-type matrix from `source_availability` |
| Methodology | One section per model: inputs, formula, calibration set, backtest error, version history |
| Ask Uncloak | Tools gain `state` and `region` parameters; answers must name the label (documented / modeled) of every figure |

---

## 5. Scoring across states

Today 70 of 100 points need TDLR, so a data center outside Texas would score at most 30. The
redesign scores each evidence *role*:

| Role | Points | Texas source | Elsewhere |
|---|---|---|---|
| Building record (registered, multi-building, value) | 45 | TDLR | County permits (rare) |
| Tenant named in a primary record | 20 | TDLR tenant | Air permits, incentive registries |
| Data-center incentive certification | 15 | Comptroller | 10 other states |
| Data-center air permit | 15 | TCEQ | VA / MD / ECHO / state portals |
| Inspection or data-center on-site generation | 5 | TDLR inspection | EIA-860 NAICS 518 |

Show two numbers:

- **Evidence index** = points earned ÷ points **available in that state** (still labeled "uncalibrated").
- **Record coverage** = points available in that state ÷ 100, so it's visible when a score rests
  on fewer record types.

In Texas every role is available, so the index equals today's score. That keeps the Phase 0
regression gate valid only if each Texas role keeps today's source. In particular, "tenant
named" must stay TDLR-tenant-only in Texas. Otherwise Comptroller operator names would raise
Texas scores, a deliberate method change that needs its own version.

---

## 6. Verification and accuracy safeguards

| Check | Where | Fails when |
|---|---|---|
| Every data center has `state` and a valid FIPS | `check_integrity.py` | Missing, or the point is outside its stated county |
| Every `estimates` row has low ≤ mid ≤ high, a method version and inputs | `check_integrity.py` | Any missing |
| No estimate feeds `project_scores` | `check_integrity.py` | Any factor references a modeled value |
| No data-center figure without a data-center source | `check_integrity.py` | A `large_loads_all` row is shown as data-center MW without a `dc_share_pct` from the same document |
| Reports from different publishers are never summed | Unit test on `/api/summary` | A query aggregates across `source_key` |
| Texas regression | CI job | Any Texas score or API output changes |
| Model backtests | `etl/models/backtest.py` | Error above the published threshold; the model is hidden |

---

## 7. Decisions needed

1. **ODbL share-alike.** The IM3 atlas is ODbL. Keep atlas-derived rows in their own tables so
   Uncloak's own evidence database is not a derivative work, or accept share-alike for the site layer.
2. **Network allowlist.** Phases 2–3 need the hosts listed in section 2.
3. **FracTracker.** Non-commercial only. Use it as a private lead list, or leave it out.
4. **Model thresholds.** The backtest error above which a model is hidden (proposal: median
   absolute error over 50% hides Model B for that state).
5. **Scope.** The atlas has no data centers mapped in AK, DE, HI, RI or VT, and includes
   Puerto Rico. Confirm whether territories are in scope.
6. **Mixed large-load totals.** When a publisher gives only an all-large-load total (no
   data-center split), should the dashboard show it as labeled context or hide it?

---

## 8. Sequence summary

| Phase | Data needed | Blocked? | Output |
|---|---|---|---|
| 0 Generalize | none | no | Schema, sources and scoring ready; Texas unchanged |
| 1 Data-center layer | IM3 atlas, EIA-860 NAICS 518, EIA-861 lookup, Census counties | **no** | 1,382 data centers in 45 states + DC + PR, each tagged with its grid operator |
| 2 Data-center load reports | ERCOT (have), Georgia Power, PJM, utility filings | partly | Region-aware data-center request timeline |
| 3 State records | VA DEQ, IL, OH, MN, IN, WA, NV, WI, AZ, MD, ECHO | **yes, allowlist** | Documented evidence and scores outside Texas |
| 4 Estimates | Phases 1–3 + Texas calibration | no (A needs Phase 3) | Ranges for IT MW, yearly MWh, state/region totals and scenarios |
| 5 Product | all | no | National data-center map, coverage page, labeled estimates |

---

## Appendix: grid-wide data checked and set aside

These were downloaded and work. They are left out because they describe the grid in general,
not data centers.

| Dataset | Why it's set aside | Possible later use |
|---|---|---|
| EIA-930 hourly demand (through 2026-09-06) | Total regional demand; data centers can't be separated from homes, industry or weather | None in this plan |
| FERC 714 planning-area forecasts (2025 filings to 2050) | Peak forecasts with no customer-type split | Only if a respondent's filing breaks out data centers |
| EIA-860 / 860M (all generators) and EPA CEMS | Power plants in general | Spare-capacity page (separate track) |
