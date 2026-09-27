# Raw source snapshots

## `comptroller_data_centers_2026-09-26.csv`

Texas Comptroller of Public Accounts, "Data Centers in Texas" registry:
https://comptroller.texas.gov/taxes/data-centers/data-center-lists.php (retrieved 2026-09-26).

- 64 rows: Registered Qualifying Data Centers (`program = qualifying_data_center`, `DC…` registration numbers)
- 103 rows: Registered Qualifying Large Data Center Projects (`program = qualifying_large_data_center_project`, `LD…` numbers)

Columns are as published. Where a cell lists several entities, they are joined with `; `.

### How it was verified

The team transcribed the registry into `texas_data_centers.xlsx`. That file was compared
cell by cell with the live page, ignoring separators, whitespace and date zero-padding:

- **Qualifying data centers:** all 64 rows match.
- **Large projects:** all 96 transcribed rows match. The live page has 7 more rows that were
  missing from the workbook (TX 306–310 Data Center, Winner LLC d/b/a Ernst LLC, Wurldwide LLC
  DBA Statue LLC). They are included here from the live page (`row_source` says which).
- **Live-page typos:** where the live page has an obvious typo, the workbook's corrected value
  is kept:
  - Lancium Abilene Clean Campus IX and X: the effective date reads `06/172026` on the page and
    `06/17/2026` here.
  - Sharka Data Center: the operator number reads `LD693418-0P1` (a zero, not the letter O).
  - A few registration-number cells have a stray `LLC`/`LP` word from the neighbouring name cell.
- **Shortened lists:** the workbook abbreviated two long registration-number lists
  (`LD669160-OW1..OW9`, `LD738113-OW5..OW18`). This file uses the full lists from the page.

`etl/import_comptroller.py` converts this file into `data/seed/*.csv` rows.

## `tdlr_data_centers_2026-09-26.csv`

Texas Department of Licensing and Regulation, TABS (Architectural Barriers) project search:
https://www.tdlr.texas.gov/TABS/Search (retrieved 2026-09-26). The export has 381 distinct projects
whose project or facility name contains "data center". Each row links to its official project page
(`Source URL`).

### How it was verified

All 381 official project pages were downloaded and compared with the export on 15 fields:
registration, start and completion dates, project and facility name, address, city, ZIP,
county, estimated cost, work type, status, owner, tenant and square footage. The only
difference is one blank facility name that the page shows as "NA" (EABPRJB6818759).

### Privacy

Personal details are not kept in this file. The `Owner Address` column (contact person and
mailing address) is dropped. A `Tenant Name` that is only a person's name reads
`[person name withheld]`; "Person (Company)" keeps just the company. Seven owner values that are
people, and contact names appended to company owners, are removed the same way.

### Limits

The 2026-09-26 export is a keyword-search snapshot. The collector now supports repeatable
project, facility, owner and address terms (`--query` / `--queries-file`) so future snapshots
can discover code-named projects whose names do not contain “data center.” Such records still
require the same import filters and reviewed registry matching before they become evidence.

## Canonical sites and sourced dimensions

`etl/sync_dimensions.py` separates public-record projects from physical campuses. It groups
only complete, normalized street-address matches automatically; otherwise it retains a 1:1
site until reviewed evidence supports a merge. It also materializes TDLR lifecycle observations,
location provenance, ownership snapshots and source freshness. Optional sourced capacity and
project-level ERCOT matches live in `data/seed/capacity_observations.csv` and
`data/seed/ercot_project_links.csv`; empty files mean “no supported matches,” not zero capacity.

## Reviewed TCEQ permit evidence

Five exact primary-document matches are stored as `permit_filed` events: Longhorn Data Center
(Abilene DC 1), Vantage TX2/TX21, Microsoft SAT15, Microsoft SAT09/10, and Microsoft SN7/NADC.
Each match is supported by the applicant or operator plus a site code, county, or exact street
address in the linked TCEQ document. Broader name-only candidates are not loaded. The generic
bulk importer now auto-detects common TCEQ export columns and accepts command-line overrides.

## `tdlr_registry_matches.csv`

Hand-reviewed links from TDLR project numbers to Comptroller registry sites.

- `confirmed` (48 records, 24 sites): the records share a specific legal entity or site code.
  For example, owner Sharka LLC is the same in both, or SAT82 falls within "SAT 80-85". These
  records become evidence on the registry site.
- `probable` (17 records): a plausible link without a shared entity, such as Amazon "Pecos
  County Data Center" and registry "Pecos Ranch Data Center". These load as separate sites
  flagged `possible_registry_match`. To merge one, change its status to `confirmed` and rerun
  the import.

Big-company names alone (Microsoft, Amazon, CyrusOne) never count as a match.

## `project_locations.csv`

Reviewed location enrichment for registry projects whose Comptroller records publish no
address. Each row retains its source, review status, and matching basis. `verified` rows use a
primary government record; `corroborated` rows are exact project-name matches in a cited
public-record compilation. Coordinates for shared campuses may be slightly offset so separate
projects remain visible on the map.

`etl/import_locations.py` validates project identity, provenance, Texas bounds, and duplicate
rows before filling only projects that do not already have coordinates. `candidate` and
`partial` rows are retained for research but are not applied. Primary TDLR locations always
take precedence; rerun this importer after regenerating seeds from Comptroller and TDLR data.

## `ercot_large_load_queue.csv`

ERCOT large-load interconnection figures, read directly from ERCOT's own documents. The
`quote_or_derivation` column gives the exact wording behind each number.

- `gw_requested` is the total large load ERCOT is tracking. Several documents give it only
  approximately ("approximately 156k MW", "approximately 410 GW", "more than 438,000 MW"), and
  the value is stored as stated.
- `gw_approved` is load that has received "Approval to Energize".
- `gw_observed_peak` is ERCOT's "Observed Energized" load: the all-time non-simultaneous peak
  of approved loads. The 2024 reports call it "observed a non-simultaneous peak consumption".
- A blank cell means that document doesn't state the figure. The dashboard shows each figure
  from its own latest dated row and labels it with that date.
- Documents with no as-of date (the April 2026 ERCOT Monthly and the June–December 2025
  Monthly Operational Overviews) are dated by publication. Documents that name only a month
  ("63k MW in December", "as of June 2026") are placed on the last day of that month.
- Some figures appear only in slide images: the 2024 status-update bar-chart totals and the
  data tables in the 2025 Monthly Operational Overviews. They were read from the rendered slide,
  and `quote_or_derivation` says so ("Chart image", "Table image"). For the 2025 overviews,
  `gw_approved` = Observed Energized + Approved to Energize but Not Operational from the table's
  2030 column. That matches the slide's "Of the X MW…" sentence except where ERCOT left that
  sentence unchanged from the month before; those cases are noted. The March 2026 queue total is
  still not transcribed.
- The queue's scope changes over time. The 2023–24 status updates count projects with in-service
  dates through 2027 (2028 from July 2024). The 2025 overviews count through 2030, and the 2026
  hearing decks through 2033. Part of the step from 57 GW (Sep 2024) to 137 GW (Apr 2025) comes
  from that change in scope.

## `im3_datacenter_atlas_2026-03-31.geojson`

PNNL IM3 Open Source Data Center Atlas, `im3_datacenter_centroids.geojson` layer, copied from the
atlas site's `gh-pages` branch (GitHub `IMMM-SFA/datacenter-atlas`, commit
`48d45f6eef72778edf374ec52c379550bb21a046`, deployed 2026-03-31). Dataset record:
https://data.msdlive.org/records/65g71-a4731. Derived from OpenStreetMap; **ODbL 1.0**
(© OpenStreetMap contributors, attribution to PNNL IM3). Share-alike applies to databases derived
from it.

- 1,382 mapped data-center features in 45 states, DC and Puerto Rico (none in AK, DE, HI, RI, VT):
  1,239 buildings, 49 campuses, 94 points. Fields: state, county, OSM `operator` tag (894 set),
  OSM `name` (1,120 set), footprint area in sq ft (1,288 set), feature type.
- `etl/import_im3_atlas.py` writes `data/seed_national/`. Operator spelling variants of the same
  company are merged (`OPERATOR_ALIASES`, e.g. "Amazon Web Services" → Amazon). One operator value
  that is a private person's name is withheld, as in the TDLR import.
- The atlas is a map layer, not a public record: it places a site and names an operator. Its
  `site_mapped` events carry no scoring points.

## `im3_texas_review.csv`

Every Texas atlas feature, with its nearest existing Texas project and distance. Because the atlas
has no addresses, a Texas feature is held back when it may duplicate a registry project:
within 250 m of one (1 feature), or run by an operator whose parent already has a Texas project in
the same county or with no county (13 features). The other 106 load as atlas-only Texas sites.
To merge a held feature into its project, add a reviewed location or match; to load it as its own
site, change the rule in the importer. Unlocated Texas registry projects can still duplicate a
loaded atlas site; this file is where to check.

## `eia861_ba_county_2024_2026-09-26.csv`

Form EIA-861 balancing-authority service territory by county, report year 2024, from Catalyst
Cooperative's PUDL nightly mirror (`out_eia861__yearly_balancing_authority_service_territory.parquet`,
BA names from `core_eia861__yearly_balancing_authority.parquet`; retrieved 2026-09-26, CC-BY-4.0 for
PUDL, EIA data public domain). One row per county and balancing authority: 4,435 rows, 3,107 counties,
57 balancing authorities. `eia861_county` is the name as EIA publishes it; `county_fips` is PUDL's.

It is a **lookup only**: it says which grid operators serve a county, so a site can be placed on the
grid. No demand figure comes from it.

### How it was verified

- **Report year.** PUDL's 2025 year is partial. It lists 2,970 counties against 3,107 for every year
  2022–2024, dropping DC and most of northern New Jersey, and 382 of the counties it keeps list fewer
  balancing authorities than 2024 (Alabama loses Southern Company, for example). From 2023 to 2024 only
  8 counties changed. 2024 is used; `etl/import_grid_regions.py` prints the per-year county counts.
- **County vintage.** EIA-861 keys counties by 2010-vintage FIPS (the eight Connecticut counties, not
  the 2022 planning regions), so sites are placed with the 2010 Census county boundaries from the same
  mirror (`out_censusdp1tract__counties.parquet`).
- **Name collisions.** Where a county shares its name with an independent city, PUDL assigns EIA's bare
  name to the city: "Fairfax" → Fairfax city (51600), and Fairfax County (51059) never appears; the same
  holds for Baltimore, Richmond, Roanoke and Franklin. St. Louis shows the error: EIA lists "St. Louis"
  and "St. Louis City" separately and PUDL maps both to the city. For a site in such a county, the rows
  EIA publishes under that name are used, and the tag's method reads `county_name` instead of
  `county_fips`. This affects 26 Fairfax County sites and 1 Baltimore County site.

## `project_counties.csv`

Every seed project with its county FIPS, written by `etl/import_grid_regions.py`:

- `spatial_join` (1,437): the project's coordinates fall in the county polygon.
- `record_county` (43): no coordinates; the county named in the project's own record, matched by name
  within its state (only when exactly one county has that name).
- Untagged (70): 64 have neither coordinates nor a county, and 6 are held because the point and the
  record name different counties (`stated_county_agrees = no`; `note` says which): Bull Data Center and
  Horizon (point in Cottle, record says Childress), Sweetwater II (Jones vs Fisher), Switch AUS 4
  (Williamson vs Travis), Digital Realty ATL11 (Douglas vs Cobb) and Google NBY-6 (Franklin vs Licking).
  Connecticut atlas sites carry 2022 planning-region names, which can't be compared with 2010 counties
  (`not_comparable`); they are tagged from their point.

`etl/assign_regions.py` turns the two files into `sites.county_fips` and `site_regions` at load time. A
county with n balancing authorities gives each n rows with confidence 1/n: 1,460 of 1,530 sites are
tagged, 511 of them in counties with several. The two Puerto Rico sites get no tag because EIA-861 has
no territory there, which the UI shows as "not published here".

## `va_deq_air_permits_2026-09-26.csv`

Virginia Department of Environmental Quality, "Issued Air Permits for Data Centers" (list dated
"as of September 21, 2026"):
https://www.deq.virginia.gov/news-info/shortcuts/permits/air/issued-air-permits-for-data-centers
(retrieved 2026-09-26). 194 permits, one row each, with the columns DEQ publishes: air site name,
registration number, permit issuance date, program type, city/county and regional office, plus the
permit document link behind each registration number. `issue_date` is the published date in ISO form.

### How it was verified

DEQ's CDN answers scripted requests with 403, so the page was opened in a browser and its table read
from the page. The saved rows were then checked against the page: the SHA-256 of the 194 rows as
JSON matched on both sides (`81352dac…127259`), so the file is an exact copy of the table.

Two errors in DEQ's own table are kept as published and noted in the `note` column:

- Permit 74333-1 (Amazon IAD-45) has the issue date "03/26-2026"; it is read as 2026-03-26.
- Permits 74331-1 (Westfax 4-5A) and 74333-1 link the same document. It can't be attributed to either
  without reading it, so neither permit is matched from it.

### Permit documents and details

The 194 PDFs were downloaded manually from the registration links on the DEQ page into
`va_deq_permits_2026-09-26/`; no scripted request was made to DEQ's 403-protected CDN.
`etl/parse_va_deq_permits.py` reads only those local files and writes
`va_deq_permit_details.csv` (`permit_no, facility_address, lat, lon, generator_count,
generator_mw_total, detail_source, reviewed_by`) plus `va_deq_permit_parse_review.csv`.

The parser attributes a PDF to a published row only when the permit's printed registration-number
stem and issue date identify exactly one list row. It found 177 such documents. One download
(`52173_DC_Permit.pdf`) has zero pages; fifteen documents have a printed date that conflicts with
the published-list date or no readable date; and one is a duplicate document. Those are retained
in the parse-review CSV and never used to match a site.

For the identified documents, 75 facility addresses were taken only from permit text that labels the
location/facility (not a recipient or contact address), with the PDF page in `detail_source`. The
42 addresses returned by the U.S. Census batch geocoder as exact address-level matches have its
URL in the same field; the other 33 remain `Unavailable` coordinates. The parser records generator
count and total MW only where it can verify a complete, unambiguous equipment table (112 permits);
each contributing PDF page, count and per-unit MW is retained in `detail_source`. Multi-row tables
without a stated completeness check, alternative capacities, and incomplete OCR remain blank and
are flagged for review rather than summed.

`reviewed_by` says `automated parser v1; source-text extraction (human review pending)`: it is not a
claim of manual review. The parser retains no permit contact/recipient names. It creates an event
only when the permit name states an atlas operator and the permit's own location is within 250 m of
exactly one same-operator atlas site. This pass confirmed four: Digital Realty VA3 (permit 73162-3,
134 m), CyrusOne NVA1/NVA2/NVA3 (74086-3, 156 m), CoreSite Reston VA3 (74130-2, 199 m), and
Aligned IAD03 (74247-1, 131 m). Their source URLs remain the individual DEQ document links in the
published permit-list CSV.

## `va_deq_review.csv`

Every DEQ permit with its match status and basis, written by `etl/import_va_deq_air.py`:

- `needs_permit_location` (99): the facility name names an operator with a mapped site in the same
  county (`candidate_sites`), so the permit document's location decides the match.
- `unmatched` (95): no operator named in the facility name has a mapped Virginia site in that county
  (many permittees are property LLCs such as "Digital Western Lands LLC" whose name doesn't state a
  brand; a brand is never inferred), or the document link is shared (above).
- `confirmed`: operator in the permit name and the permit's location within 250 m of exactly one
  same-operator site. These become `permit_filed` events (source `VA_DEQ`, value = generator MW when
  the permit states it) in `data/seed_states/va_deq/evidence_events.csv`.

A VA permit counts toward the evidence index the way a TCEQ permit does: `config.EVENT_SOURCES` pairs
`permit_filed` with TCEQ in Texas and VA_DEQ in Virginia, and the air-permit factor scores the role.

## `il_dceo_reports/` and `il_dceo_data_centers_2026-09-26.csv`

Illinois Department of Commerce and Economic Opportunity, Data Center Investment Program annual reports
2020–2025 (20 ILCS 605/605-1025), from "Reports Required by Statute":
https://dceo.illinois.gov/aboutdceo/reportsrequiredbystatute.html (the report list is filled in by
JavaScript, so it was read in a browser; the six PDFs were then downloaded directly on 2026-09-26 and are
kept in `il_dceo_reports/`).

The CSV is the 2025 report's table of every data center owner or operator with a signed MOU and a
sales-tax exemption certificate (pages 8–9): 34 MOUs from 2020 through 2025-12-31, each with company,
MOU year, city ("Site Location"), investment commitment, DCEO's estimated tax benefit (6.25% of the
commitment, DCEO's own figure), new jobs and the underserved-area flag. `etl/import_il_dceo.py --pdf`
re-reads it.

### How it was verified

- The table's total row (34 MOUs, $10,665,815,092 committed, 731 jobs, 16 underserved) matches the sum of
  the parsed rows. The estimated-tax-benefit column sums to $666,613,444, $1 more than the published
  total ($666,613,443), a rounding difference in DCEO's table.
- Each earlier report's MOU table (2021: 13, 2022: 15, 2023: 21, 2024: 27) was matched to the 2025 list by
  year, city and commitment. Two differ and the 2025 figure is used, with the difference in `note`:
  Digital Realty's 2021 Elk Grove Village MOU ($280,608,348 in the 2021 report vs $280,608,349) and
  Aligned's 2021 Northlake MOU ($252,000,000 in the 2024 report vs $252,500,000).
- The report gives only the MOU year, so events are dated 31 December of that year and say so.
- Addresses: the report states facility addresses only in its 2025 amendment section. Two are used
  (quoted in `address_quote`): Digital Realty's Franklin Park campus (9401 West Grand Avenue, one of the
  campus addresses listed) and Elk Grove Village Property LLC (1650 Higgins Road). LLC names that look
  like addresses ("2425 Busse Road LLC") are not treated as addresses. Addresses were geocoded with the
  Census geocoder; the Franklin Park campus lands 228 m from exactly one mapped Digital Realty site
  (ORD12), so that MOU is attached to it. Every other MOU is its own project.

## `mn_deed/` and `mn_deed_qualified_data_centers_2026-09-26.csv`

Minnesota Department of Employment and Economic Development, "List of Designated Qualified Data Centers"
(PDF titled "Data Center Sales Tax Refund Projects", dated 7/15/2026), linked from
https://mn.gov/deed/business/financing-business/tax-credits/data-center-credit/ and downloaded
2026-09-26. The Department of Revenue's qualified-data-centers page explains the exemption but refers to
DEED for the list. 42 data centers, all "Certified" (16 new, 26 refurbished), with name, company, city
and type, read with `pdfplumber` (`etl/import_mn_deed.py --pdf`) and checked against the PDF text.

The list publishes neither certification dates nor addresses. Events are dated at the list's date (DEED
listed the site as certified by then), and no record is attached to a mapped site.

## `il_dceo_review.csv`, `mn_deed_review.csv`

One row per registry record: the organization its company text names (and why), whether it was attached
to a mapped site or loaded as its own project, and the mapped sites of the same organization in the
state, which may be the same facility. Those are listed for review and never merged. Company text is
never expanded into a brand it doesn't state: "C1 Chicago Aurora III LLC" stays unlinked even though
another row reads "CyrusOne (C1 Chicago)".

## `in_iedc_data_contracts_2026-09-26.json`

Indiana Economic Development Corporation Transparency Portal, "Search for Tax Credits, Grants, and Loan
Contracts" filtered to Fund Type DATA (the data center sales tax exemption):
https://transparencyportal.iedc.in.gov/searchtaxgrantloancontracts (retrieved 2026-09-26). The file
is the portal's own search API response, with the request that produced it. 13 contracts, each with
recipient, city, county, contract date and status, expected and actual investment, and the amount
certified to date. The same 13 rows appear on the portal page with the same filter.

- 12 are executed (or in post-term reporting) and load as their own projects, dated at the contract
  date. Microsoft's LaPorte offer (IEDC 425481) is `pendingAcceptedOffer`, with no contract date or
  document, and is listed in `in_iedc_review.csv` but not loaded.
- The contract documents are scanned PDFs with no text layer, so IEDC publishes no address in
  machine-readable form and no contract attaches to a mapped site. Each event links its contract PDF.
- Most recipients are special-purpose LLCs ("Blocke LLC", "Orla LLC") and stay unlinked to an
  organization; only Amazon Data Services is named (two contracts). DX Hammond Opco lists Indianapolis as
  its city and Lake County as its county, as published.

## `wi_dor/` and `wi_dor_qualified_data_centers_2026-09-26.csv`

Wisconsin Department of Revenue, "Qualified Data Center Exemption" FAQ, "Which qualified data centers
have been certified in Wisconsin?" (as of October 31, 2025), snapshotted 2026-09-26:
https://www.revenue.wi.gov/Pages/FAQS/ExemptionforQualifiedDataCenter.aspx . Four certified data
centers with business entity, certification date, location and building description, read from the
page's table (`etl/import_wi_dor.py --html`). Events are dated at the certification date.

Only Oracle's entry states house numbers ("531, 533, 701, and 723 E. Lake Drive", Port Washington);
the Census geocoder can't place them yet, so it loads as its own project. "90th Street" (Microsoft,
Mount Pleasant) is a street, not an address.

## Registries checked and not loaded (2026-09-26)

- **Ohio (Tax Credit Authority data-center exemptions):** approvals appear only in the monthly TCA
  meeting minutes (PDF and DOCX, under several URL patterns on dam.assets.ohio.gov and
  development.ohio.gov), with no index page or cumulative list found. A partial set from the minutes
  that search engines surface would look complete when it isn't, so none is loaded.
- **Nevada (GOED abatements):** the same shape: approvals are in GOED board agendas and minutes, with no
  cumulative list.
- **Arizona (Computer Data Center Program):** the program page lists no certified data centers, and the
  ACA incentive reports cover the Competes Fund and Qualified Facility credits but not this program.
- **Washington (DOR tax incentive public disclosure):** the data-center exemption data is reported per
  business account and year, with no site or address. A business can operate several sites, so rows
  can't become sites without inventing site boundaries.

## Load reports: `data/seed/dc_load_reports.csv`

`etl/import_load_reports.py` builds one table of large-load and data-center load figures by region
from the three sources below. Every row keeps its publisher, document, as-of date and the quote or
derivation behind it, and a **scope**:

- `data_centers`: the publisher attributes the figure to data centers.
- `data_centers_and_crypto`: the publisher's own category combines data centers and crypto mining
  (Georgia Power from Q1 2026). Always labeled as such, never shown as data centers alone.
- `large_loads_all`: every large load. `dc_share_pct` is filled only where the same document states the
  data-center share (ERCOT, 2026-03-26 ~87% and June 2026 ~90%); earlier ERCOT reports have none.

Nothing is summed across publishers or regions. `ercot_queue` is now a view over the ERCOT rows, so the
queue timeline and `/api/summary` read exactly what they read before.

### ERCOT

The existing `ercot_large_load_queue.csv` rows, one row per stated figure (requested, approved,
observed peak): 67 rows from 27 reports.

### `ga_psc_large_load/`

Georgia Power's quarterly Large Load Economic Development Reports, Georgia PSC Docket 55378 (and 56002),
filed 2024-08-16 through 2026-05-15 (`filings.csv` lists each filing, its period end and document link).
Each filing's public-disclosure XLSX attachment was downloaded on 2026-09-26; project names, cities,
counties and coordinates are redacted, while segment, project stage, announced load and load ramp are
public. For Q3 and Q4 2025 the revised attachments (filed 2026-03-04) are used; their Main sheets are
identical to the originals.

Per quarter, the rows whose Segment is the data-center segment are summed, by stage:

- `requested`: all stages (Technical Review, Request for Service, Contract for Electric Service)
- `committed`: Contract for Electric Service + Request for Service, Georgia Power's own definition of
  commitments ("Contracts for Electric Service plus Requests for Service", Q1 2026 report)
- `contracted`: Contract for Electric Service only

The segment is labeled "Data Center" / "Data Centers" through Q4 2025 and "Data Center/Crypto" in Q1 2026,
so Q1 2026 is stored as `data_centers_and_crypto` and the UI draws it as its own series. Footnote marks on
stage names ("Contract for Electric Service1", "**") are dropped. As a check, the Q1 2026 attachment's
all-segment total (73,130 MW) matches the report's "73,100 MW represent large load economic development
projects".

### `pjm_2026_load_forecast/`

2026 PJM Load Forecast Report (posted 2026-01-14): the tables workbook, and the PSE&G and Dominion
adjustment documents, downloaded 2026-09-26 (the report PDF itself is cited, not stored). The report
(p.5, "Load Adjustments") lists the zones adjusted for "Growth in data center load": AEP, ATSI, APS, BGE,
COMED, DAYTON, DLCO, JCPL, METED, PECO, PEPCO and PL. Their Table B-9 values (summer peak adjustment
above embedded, 2026–2046) are stored as `forecast_adjustment`, scope `data_centers`.

DOM (data centers plus voltage optimization) and PS (data centers plus port electrification) are mixed in
Table B-9, so their data-center figures come from the utilities' own documents instead:

- PS: PSE&G's "Table 1: PSE&G Data Center Peak Demand (MW) by Summer Year" (Total column, 2026–2046).
- DOM: Dominion's letter to PJM (January 6, 2026). Its requested data-center coincident peak by year is a
  table image; the values were read from the rendered page, and the 2046 value (16,636 MW) matches the
  letter's text, "forecasting 16.6 GW of demand by 2046". The letter's text also gives the 2025
  data-center coincident peak (4 GW) and the contracted capacity as of July 2025 (9.8 GW ESA, 7.1 GW CLOA,
  30.1 GW ELOA), each stored with its quote.

EKPC's adjustment (a peak-shaving program) is not data-center load and is left out, as is PJM's RTO total.

## `us_source_catalog.csv`

Candidate public sources for coverage outside Texas, one row per source, with its role
(the Texas source it stands in for), evidence type, license and verification status. Only the
Texas rows are loaded today. See [`docs/us-coverage.md`](../../docs/us-coverage.md) for the
research, the coverage matrix and the schema changes needed first.
