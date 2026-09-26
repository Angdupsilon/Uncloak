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

## `us_source_catalog.csv`

Candidate public sources for coverage outside Texas, one row per source, with its role
(the Texas source it stands in for), evidence type, license and verification status. Only the
Texas rows are loaded today. See [`docs/us-coverage.md`](../../docs/us-coverage.md) for the
research, the coverage matrix and the schema changes needed first.
