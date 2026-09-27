# National coverage: current sources and U.S. expansion plan

Research date: 2026-09-26. The machine-readable catalog is
[`data/raw/us_source_catalog.csv`](../data/raw/us_source_catalog.csv).

> **Update (same day):** the IM3 atlas (1,382 sites) and the EIA-860/860M, EPA CEMS, EIA-930,
> FERC 714 and EIA-861 tables were downloaded through GitHub and the Catalyst Cooperative PUDL
> mirror. The expansion plan uses only the data-center-specific parts; grid-wide tables are set
> aside (see [`us-expansion-plan.md`](us-expansion-plan.md), section 0 and appendix).
>
> **Verification status.** Section 1 was computed from the files in this repo. The sources in
> sections 2–4 were identified and described from search results for the publishers' own pages
> (linked). No national file has been downloaded or cell-checked yet: the build environment's
> network policy blocked direct fetches from the publisher hosts. Each catalog row has a
> `verification` column. Before a source is imported, it should go through the same
> download-and-compare review used for `data/raw/README.md`.

---

## 1. What Uncloak uses today (Texas only)

### 1.1 Site and project evidence

| Source | File | Rows | What it provides | Evidence produced |
|---|---|---|---|---|
| Texas Comptroller data-center registry | `data/raw/comptroller_data_centers_2026-09-26.csv` | 167 (64 qualifying DCs, 103 large projects) | Registered site name, owner, occupant and operator entities with registration numbers, and the effective date. **No address** | 167 `certified` events. Resolves 96 entities to a parent (`resolved_by=COMPTROLLER`) |
| TDLR TABS (architectural barriers) | `data/raw/tdlr_data_centers_2026-09-26.csv` | 381 projects (keyword "data center") | Address, county, estimated cost, square footage, owner, tenant, dates, status | 79 `building_registered`, 77 `square_footage`, 12 `inspection_done` and 2 `tenant_named` events. Six entity resolutions (`TDLR_OWNER`/`TDLR_TENANT`) |
| TCEQ air permits | hand-reviewed (`etl/load_tceq.py` also takes bulk files) | 5 matches | Backup-generator air permits tied to an applicant plus a site code or address | 5 `permit_filed` events |
| Reviewed location crosswalk | `data/raw/project_locations.csv` | 75 | Addresses and coordinates for registry sites whose record has no address | 72 of 75 cite a secondary compilation (`subtxtpress.github.io`); 2 cite TDLR and 1 cites TCEQ |
| TDLR↔registry matches | `data/raw/tdlr_registry_matches.csv` | 65 | 48 confirmed and 17 probable links | Merges TDLR evidence onto registry sites |

**Resulting seed** (`data/seed/`): 182 projects in 36 counties, 342 evidence events, 156 entities
and 32 parents. 75 of the 182 projects have coordinates, and **64 have no county**. Those are
Comptroller registry rows with no address that the crosswalk does not cover yet.

### 1.2 Grid and request context

| Source | File | What it provides |
|---|---|---|
| ERCOT large-load interconnection documents | `data/raw/ercot_large_load_queue.csv` → `data/seed/ercot_queue.csv` | 27 dated statewide totals: GW requested, approved and observed peak. There are **no project-level rows**, so `ercot_project_links.csv` is empty |
| Cushman & Wakefield 2026 cost guide | `etl/config.py` | $17.6M per MW, used to turn construction cost into an MW estimate |

### 1.3 Spare capacity

The spare-capacity page currently runs on **SAMPLE** data only (`data/sample/power_plants.csv`).
The README lists EIA-860M and EPA CAMPD as the planned real sources. **Both are national**, so
this module is the easiest part of the app to extend beyond Texas.

### 1.4 What the scoring assumes

`etl/config.py` builds all seven scoring factors (100 points) from three Texas agencies:
TDLR (building registration, value, tenant, inspection: 70 points), the Comptroller
(`certified`: 15 points) and TCEQ (`permit_filed`: 15 points). Outside Texas, no single source
matches TDLR, so a site in another state could reach at most 30 of 100 points under the current
rules. Section 5 covers how to make scores comparable.

---

## 2. National source catalog

The sources are grouped by the role each would play for Uncloak, mirroring how the Texas
sources are used today.

### 2.1 Site existence and location (national base layer)

These sources say *where* data centers are. They fill the role of the location crosswalk, not
of evidence.

| Source | Coverage | License | Notes |
|---|---|---|---|
| [PNNL IM3 Open Source Data Center Atlas](https://im3.pnnl.gov/datacenter-atlas) ([MSD-LIVE record](https://data.msdlive.org/records/65g71-a4731), [OSTI](https://www.osti.gov/biblio/2550666)) | All states. v2026.02.09 | **ODbL** (share-alike) | Built from OpenStreetMap. Adds footprint area (sq ft), county and state. **Best starting layer.** Share-alike applies if a derived database is redistributed |
| [IM3 Projected US Data Center Locations](https://data.msdlive.org/records/8fd09-xhn32) | All states | CC-BY 4.0 | *Modeled* siting projections. Could appear as a labeled "context" layer, **never as evidence** |
| [OpenStreetMap](https://wiki.openstreetmap.org/wiki/Tag:telecom=data_center) `telecom=data_center` / `building=data_center` | About 1,553 US features in April 2026, a third-party count ([Mapscaping](https://mapscaping.com/texas-data-centers/), [Mappr](https://www.mappr.co/data-centers-map/)) to recount with Overpass | ODbL | Raw upstream of IM3. Pull directly with Overpass for a fresher snapshot |
| [PeeringDB facilities API](https://www.peeringdb.com/apidocs/) | Interconnection and colocation facilities, with address and lat/lon | PeeringDB AUP (free, attribution) | Strong for colocation and carrier hotels; weak for hyperscale. Operator names help entity resolution |
| [Epoch AI Frontier Data Centers](https://epoch.ai/data/data-centers-documentation) | Largest AI campuses (US-heavy) | **CC-BY** | Owner, estimated power (MW) and a build timeline from satellite imagery and permits. Possible source for `capacity_observations` with `capacity_type='modeled'` |
| [FracTracker U.S. Data Centers Tracker](https://fractracker.org/2026/04/open-u-s-data-centers-tracker/) | Permitted, existing and proposed sites, all states | **Non-commercial** only, with credit | Built from FOIA and public-records requests to state and local environmental agencies. Useful as a **lead list** for permit discovery; check the license before republishing |

### 2.2 State incentive registries (the Comptroller analog → `certified`)

[Good Jobs First (Nov 2025)](https://goodjobsfirst.org/most-states-fail-to-disclose-which-data-center-companies-get-huge-tax-breaks/)
found that at least 36 states subsidize data centers but **only 11 name the recipients**:
AZ, CT, IL, IN, MN, NV, OH, PA, TX, WA and WI. Texas is already loaded. The other ten, plus
Georgia's county aggregates, are listed here.

| State | Program / publisher | What is disclosed |
|---|---|---|
| Illinois | [DCEO Data Center Investment Program annual reports 2020–2025](https://dceo.illinois.gov/content/dam/soi/en/web/dceo/aboutdceo/reportsrequiredbystatute/2025-data-centers-annual-report.pdf) | Certified data centers with dollar amounts. PDF, one per year, so it gives a dated series |
| Indiana | [IEDC data center sales-tax exemption](https://iedc.in.gov/indiana-advantages/investments/data-center-sales-tax-exemption/overview) plus the IEDC transparency portal | Approved projects and exemption amounts |
| Minnesota | [Dept. of Revenue: Qualified Data Centers](https://www.revenue.state.mn.us/qualified-data-centers) (certified by [DEED](https://mn.gov/deed/business/financing-business/tax-credits/data-center-credit/)) | Named list: 41 centers (15 new construction, 26 refurbishment) |
| Ohio | Ohio Tax Credit Authority approvals ([ORC 122.175](https://codes.ohio.gov/ohio-revised-code/section-122.175)) | Company, county and exemption value per approval. **New exemptions paused from June 2026** ([Signal Cleveland](https://signalcleveland.org/ohio-approves-last-data-center-exemption-before-moratorium/)) |
| Nevada | [GOED board agendas and approvals](https://goed.nv.gov/notices-and-agendas/goed-board-meeting/) | 15 data-center abatements since 2015. A September 2026 executive order narrows the program ([Nevada Independent](https://thenevadaindependent.com/article/lombardo-curtails-nevada-data-center-tax-break-program-in-executive-order)) |
| Washington | [DOR tax-incentive public disclosure data](https://dor.wa.gov/about/statistics-reports/tax-incentive-public-disclosure-survey-data) | Business name and incentive dollar amount. Eligibility details are confidential by statute |
| Wisconsin | [WEDC Data Center Sales and Use Tax Exemption](https://wedc.org/programs/data-center-sales-and-use-tax-exemption/) / [DOR FAQ](https://www.revenue.wi.gov/Pages/FAQS/ExemptionforQualifiedDataCenter.aspx) | Certified centers (e.g., Microsoft, Epic) |
| Arizona | [ACA Computer Data Center Program](https://www.azcommerce.com/incentives/computer-data-center-program/) | Certified CDCs. **Applications closed on 2023-12-31**, so this is a static historical list |
| Pennsylvania | [DOR Computer Data Center Equipment Program report](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/news-and-statistics/reportsstats/taxcredits/computerdatactrequipprogram/documents/2025_computer_data_ctr_equip_pgm.pdf) | Annual program report. The per-site detail still needs checking |
| Connecticut | [DECD Office of Data Infrastructure](https://portal.ct.gov/decd/content/business-development/data-infrastructure-administration-and-security/office-of-data-infrastructure-administration-and-security) | Named in the GJF list. The publication location is unconfirmed |
| Georgia | [DOR aggregate expenditures by county](https://dor.georgia.gov/data-centers-sales-use-tax-exemption-aggregate-expenditures-county) | **County totals only, no names.** Usable as county context, not site evidence |

Non-disclosing states with major buildouts are **Virginia, Georgia (by name), North Carolina,
South Carolina, Tennessee, Mississippi, Louisiana, Oklahoma, Iowa, Nebraska and Utah**. For
these states the other evidence types in sections 2.3–2.4 matter most.

### 2.3 Air permits for backup generators (the TCEQ analog → `permit_filed`)

This is the most consistent national evidence type, because nearly every large campus needs
an air permit for its diesel or gas generators.

| Source | Coverage | Notes |
|---|---|---|
| [Virginia DEQ: Issued Air Permits for Data Centers](https://www.deq.virginia.gov/news-info/shortcuts/permits/air/issued-air-permits-for-data-centers) | Virginia; 177 permits as of Nov 2024 (Loudoun 85, Fairfax 34, Prince William 26) | A **curated list with permit documents**, the highest-value single source outside Texas. Covers the largest US market, which otherwise lacks an incentive registry |
| [Maryland MDE data centers](https://mde.maryland.gov/datacenters/Pages/FrederickDataCenter.aspx) | Maryland (Quantum Frederick campus: Amazon, 99 generators, approved 2026-03-25; Aligned, 168 × 3 MW generators) | Draft and final permits on MDE's public-review pages |
| [EPA ECHO](https://echo.epa.gov/help/facility-search/search-criteria-help) (Clean Air Act facilities, NAICS 518210) | All states | National, has an API and weekly bulk files. Includes FRS id, address, lat/lon, CAA permit ids and compliance status. Many generator permits are state **minor** permits that ECHO may not list, so treat a missing ECHO record as "not found", never as "no permit" |
| Other state air-permit portals (GA EPD, OH EPA, AZ ADEQ/Maricopa, IL EPA, NC DEQ, IA DNR, etc.) | Per state | Same pattern as TCEQ bulk files. `etl/load_tceq.py` already auto-detects columns and needs generalizing (section 5) |

### 2.4 Grid and large-load requests (the ERCOT analog)

Outside ERCOT, large-load data is spread across RTOs **and** individual utilities. No
project-level queue is published anywhere. The table goes from the most to the least granular.

| Source | Region | What is available |
|---|---|---|
| [Georgia Power Large Load Economic Development Reports](https://psc.ga.gov/search/facts-document/?documentId=226607) (Georgia PSC, quarterly) | Georgia Power territory | 32 committed large-load customers ≈ 15.6 GW; 21 under construction (April 2026). A **quarterly series, like the ERCOT reports** |
| [PJM Long-Term Load Forecast Report 2026](https://www.pjm.com/-/media/DotCom/library/reports-notices/load-forecast/2026-load-report.pdf) and per-zone [large-load adjustment documentation](https://www.pjm.com/-/media/DotCom/planning/res-adeq/load-forecast/dayton-documentation.pdf) | 13 states + DC | Data-center load adjustments by transmission zone (14 zones in 2026). Annual, with zone-level documents |
| [MISO large load additions / Expedited Project Review](https://www.misoenergy.org/planning/large-loads---container-page/large-load-additions/) | 15 states | EPR request batches (e.g., April 2026: 19 requests, 5,457+ MW). No consolidated total |
| SPP, CAISO, NYISO, ISO-NE load forecasts | Per region | Annual forecasts with data-center adjustments |
| [FERC RM26-4](https://www.ferc.gov/rm26-4) and the June 2026 show-cause orders | All six FERC-jurisdictional RTOs | Each RTO's 60-day compliance filing should describe its large-load queue. Watch these for the first **standardized** national queue data |
| [EIA data center pilot survey](https://www.publicpower.org/periodical/article/eia-launches-pilot-survey-energy-use-data-centers) | TX, WA, N. VA/DC (pilot, March 2026) | No public results yet. Would become the authoritative federal source if it goes national |

### 2.5 Spare capacity (already national)

| Source | Coverage | Notes |
|---|---|---|
| EIA-860M (`api.eia.gov/v2/electricity/operating-generator-capacity`) | Every US generator ≥1 MW, monthly | Drop the ERCOT filter to cover the whole country. The `region` column maps to balancing authorities |
| EPA CAMPD (`api.epa.gov/easey`) | Hourly unit load for fossil units covered by Part 75, nationwide | Same loader. Solar and wind still need modeled output |

### 2.6 Context (county and state denominators)

| Source | Use |
|---|---|
| [Census County Business Patterns API](https://www.census.gov/data/developers/data-sets/cbp-zbp/cbp-api.html), NAICS 518210 | Establishments and employment in data processing and hosting, by county, for every state. Gives a "sites found vs. establishments reported" ratio. The NAICS 2022 label for 518210 changed to *Computing Infrastructure Providers, Data Processing, Web Hosting* |
| [EIA AEO2026 / Today in Energy](https://www.eia.gov/todayinenergy/detail.php?id=67704) | National projections for server electricity use (446–818 BkWh by 2050) |
| Georgia DOR county aggregates (section 2.2) | County-level exemption spending |

### 2.7 Local building and land-use records (the TDLR analog → `building_registered`)

TDLR is unusual: a statewide registry of building projects with cost, square footage and tenant.
**No other state has an equivalent**, so this evidence has to come county by county:

- **Loudoun County, VA**: [GeoHub open data](https://geohub-loudoungis.opendata.arcgis.com/) (building and land-use layers)
- Prince William and Fairfax (VA), Maricopa (AZ), Fulton/Douglas (GA), Frederick (MD) and
  Franklin/Licking (OH) run ArcGIS Hub portals with permit or zoning layers
- County building-permit portals (Accela, Tyler EnerGov) usually support value and
  square-footage search, but scraping them is per-county work

Start with the top five counties by permit count from section 2.3. That covers most of the
national hyperscale pipeline.

---

## 3. Coverage matrix: evidence types by state, top markets

`●` named per-site source · `◐` partial or aggregate · `○` none found

| State | Location layer | Incentive registry | Air permits | Load / queue | Building records |
|---|---|---|---|---|---|
| TX (current) | ● | ● Comptroller | ● TCEQ | ● ERCOT (totals) | ● TDLR |
| VA | ● IM3/OSM | ○ | ● DEQ list | ◐ PJM zones (Dominion) | ◐ Loudoun/PWC GIS |
| GA | ● | ◐ county totals | ◐ EPD | ● Georgia Power quarterly | ◐ |
| OH | ● | ● TCA approvals | ◐ OH EPA | ◐ PJM zones (AEP) | ◐ |
| IL | ● | ● DCEO reports | ◐ IL EPA | ◐ PJM (ComEd) / MISO | ○ |
| AZ | ● | ● ACA (static) | ◐ Maricopa/ADEQ | ○ | ◐ |
| IN | ● | ● IEDC | ◐ | ◐ MISO / PJM | ○ |
| MN | ● | ● DOR list | ◐ | ◐ MISO | ○ |
| WA | ● | ● DOR disclosure | ◐ | ○ | ○ |
| NV | ● | ● GOED | ◐ | ○ | ○ |
| WI | ● | ● WEDC/DOR | ◐ | ◐ MISO | ○ |
| PA | ● | ◐ annual report | ◐ | ◐ PJM zones | ○ |
| MD | ● | ○ | ● MDE | ◐ PJM zones | ◐ Frederick |
| All other states | ● IM3/OSM, PeeringDB | ○ | ◐ EPA ECHO | ◐ RTO forecasts | ○ |

---

## 4. Recommended acquisition order

1. **EIA-860M + EPA CAMPD, national.** The loader and schema exist, so only the filter changes.
   The spare-capacity page becomes real data nationwide.
2. **IM3 Atlas (ODbL) + PeeringDB** as a national `sites` base layer with
   `location_method='osm'`/`'peeringdb'`. Gives every state a map immediately, with no evidence
   scores.
3. **Virginia DEQ permit list.** The largest market and a curated primary source. Produces
   `permit_filed` events, as TCEQ does.
4. **Incentive registries** in IL, MN, OH, IN, WA, NV and WI (`certified` events). Each is a small
   importer shaped like `etl/import_comptroller.py`.
5. **Grid series**: Georgia Power quarterly reports and PJM zone adjustments into a
   generalized queue table (section 5).
6. **Epoch AI** power estimates as `capacity_observations` (`capacity_type='modeled'`), cited
   per site.
7. **EPA ECHO NAICS 518210** national sweep, then per-state air-permit portals, prioritized by
   FracTracker leads.
8. **County building-permit layers**, starting with Loudoun and Prince William.

---

## 5. Code and schema changes that national coverage requires

The app currently assumes Texas in several places. These must change before any non-Texas row
loads:

| Area | Texas assumption | Location | Change needed |
|---|---|---|---|
| Schema | No `state` column. `county` alone is ambiguous (about 30 states each have a Washington County) | `db/001_schema.sql` (`projects`, `sites`) | Add `state char(2)` and a `county_fips`. Key uniqueness on `(state, name)` instead of `name` |
| Evidence sources | `SOURCES = {TDLR, COMPTROLLER, TCEQ, OTHER}`; `EVENT_TYPES` pins each type to a Texas agency | `etl/config.py:20-31` | Make the source a role (`STATE_INCENTIVE`, `STATE_AIR_PERMIT`, `LOCAL_BUILDING`) plus a `jurisdiction`, or add per-state source codes |
| Scoring | 70 of 100 points need TDLR | `etl/config.py:33-51` | Score per evidence *role*, or normalize by the evidence types that exist in that state (show "max possible here: N"). Otherwise non-Texas sites look artificially weak |
| Grid queue | One ERCOT series | `ercot_queue`, `db/004_queue_timeline.sql` | Rename to `load_queue_reports` keyed by `(region, ts)`, with region = ERCOT / PJM zone / utility |
| Bounds checks | Texas bounding box | `etl/import_locations.py:25`, `etl/check_integrity.py:91`, `web/lib/geo.ts:37`, `web/lib/constants.ts:59-60` | Validate against the stated state (or CONUS + AK/HI) |
| Geocoding | Forces `TX` / "Texas"; rejects results outside Texas | `etl/geocode.py:38,60`, `web/lib/geocode.ts` | Use the row's state and remove the "outside Texas" rejection |
| Map assets | `tx_state.geojson`, `tx_counties.geojson`; Texas metro boxes | `web/components/ProjectMap.tsx:72,171`, `web/lib/queries.ts:54` (`METROS`) | US states/counties TopoJSON (Census cartographic boundaries); national metro list |
| Copy | "Texas public records only" | `web/lib/geocode.ts`, `web/lib/metrics.ts`, the methodology page | Per-state coverage statement generated from the coverage matrix |
| MW estimate | One national $/MW constant | `etl/config.py:62` | The C&W guide publishes market-level costs; consider a per-market override |

---

## 6. Risks and caveats

- **Licensing.** ODbL (IM3, OSM) is share-alike for derived *databases*. FracTracker is
  non-commercial. Epoch is CC-BY. Store the license per source (the catalog has a `license`
  column).
- **Uneven evidence.** Registry coverage depends on each state's disclosure law, not on how much
  is being built. Virginia, the largest market, has no incentive list. The UI must show
  "no public record type exists here" differently from "no record found".
- **Double counting.** Utility pipelines (Georgia Power) and RTO zone adjustments overlap. Keep
  them as separate series and never add them together.
- **Policy volatility.** Ohio paused new exemptions (June 2026), Nevada narrowed its program
  (September 2026) and Arizona closed applications (end of 2023). A registry that stops growing
  is not a sign that construction stopped.
- **Secondary compilations.** The Texas crosswalk already relies mostly on one secondary source
  (72 of 75 rows). National aggregators (FracTracker, Epoch, IM3) should be treated the same way:
  `corroborated` leads, replaced by primary records when found.
