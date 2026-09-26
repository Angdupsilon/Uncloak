# Graph Report - .  (2026-09-25)

## Corpus Check
- Corpus is ~14,675 words - fits in a single context window. You may not need a graph.

## Summary
- 301 nodes · 574 edges · 15 communities (11 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 31 edges (avg confidence: 0.79)
- Token cost: 38,000 input · 4,046 output

## Community Hubs (Navigation)
- Next.js API Routes
- Dashboard UI Components
- ETL Loading and Cleaning
- ETL Config and Orchestration
- TypeScript Compiler Config
- Runtime Dependencies
- Dev Tooling Dependencies
- GridSight Data Model Concepts
- Project Docs and Data Honesty
- App Shell and Fonts
- Ask GridSight Assistant
- Next.js Build Config
- Time Machine As-Of Queries
- ESLint Config
- PostCSS Config

## God Nodes (most connected - your core abstractions)
1. `parseAsOf()` - 16 edges
2. `compilerOptions` - 16 edges
3. `main()` - 12 edges
4. `clean()` - 11 edges
5. `jsonHandler()` - 11 edges
6. `fmtDate()` - 11 edges
7. `connect()` - 10 edges
8. `fmtPct()` - 10 edges
9. `backfill()` - 9 edges
10. `fmtMW()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `SAMPLE fixture dataset` --semantically_similar_to--> `<<FILL>> placeholder convention`  [INFERRED] [semantically similar]
  data/sample/README.md → README.md
- `ETL Python dependencies` --conceptually_related_to--> `Shell LLC to Parent Resolution`  [INFERRED]
  etl/requirements.txt → README.md
- `ETL Python dependencies` --conceptually_related_to--> `run_all.py ETL pipeline`  [INFERRED]
  etl/requirements.txt → README.md
- `main()` --calls--> `connect()`  [INFERRED]
  etl/geocode.py → etl/common.py
- `main()` --calls--> `connect()`  [INFERRED]
  etl/load_seed.py → etl/common.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Shadow load computation flow** — readme_run_all, readme_evidence_index, readme_weekly_project_state, readme_weekly_realistic_demand, readme_shadow_load [EXTRACTED 1.00]
- **Data provenance and honesty regime** — readme_data_honesty, readme_fill_marker, data_sample_readme_sample_dataset, readme_entity_resolution, readme_scoring_config [INFERRED 0.85]
- **Time Machine as-of stack** — readme_time_machine, readme_as_of_query, readme_hypertables, readme_api_surface [EXTRACTED 1.00]

## Communities (15 total, 4 thin omitted)

### Community 0 - "Next.js API Routes"
Cohesion: 0.08
Nodes (46): POST(), GET(), GET(), GET(), GET(), GET(), Page(), boolParam() (+38 more)

### Community 1 - "Dashboard UI Components"
Cohesion: 0.09
Nodes (39): Dashboard(), ProjectMap, DateSlider(), iso(), weeklySteps(), HowScoring(), ParentFilter(), MapProps (+31 more)

### Community 2 - "ETL Loading and Cleaning"
Cohesion: 0.15
Nodes (31): Any, clean(), is_fill(), normalize_address(), normalize_name(), parse_payload(), Shared helpers for the ETL scripts., Normalize a CSV cell: NaN/blank/<<FILL>> -> None, strings stripped. (+23 more)

### Community 3 - "ETL Config and Orchestration"
Cohesion: 0.11
Nodes (26): Connection, date, datetime, connect(), Path, Scoring weights, $/MW constant and backfill settings.  Everything the scoring mo, For --dir data/sample only: if MW_COST_PER_MW_USD is not configured, fall     ba, use_sample_mw_cost() (+18 more)

### Community 4 - "TypeScript Compiler Config"
Cohesion: 0.06
Nodes (30): ./*, dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts (+22 more)

### Community 5 - "Runtime Dependencies"
Cohesion: 0.07
Nodes (27): dotenv, @google/genai, leaflet, next, pg, react, react-dom, react-leaflet (+19 more)

### Community 6 - "Dev Tooling Dependencies"
Cohesion: 0.10
Nodes (21): eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/leaflet, @types/node, @types/pg, @types/react (+13 more)

### Community 7 - "GridSight Data Model Concepts"
Cohesion: 0.15
Nodes (16): ETL Python dependencies, GridSight REST API, Ask GridSight, Shell LLC to Parent Resolution, Evidence Index (uncalibrated), Gemini Function-Calling Tool Set, TimescaleDB Hypertables, Idempotent Upsert Loading (+8 more)

### Community 8 - "Project Docs and Data Honesty"
Cohesion: 0.33
Nodes (7): SAMPLE fixture dataset, Data Honesty Principle, <<FILL>> placeholder convention, GridSight, Next.js agent rules block, web/CLAUDE.md AGENTS.md pointer, GridSight web app

### Community 9 - "App Shell and Fonts"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 10 - "Ask GridSight Assistant"
Cohesion: 0.50
Nodes (3): EXAMPLES, Msg, AskResponse

## Knowledge Gaps
- **71 isolated node(s):** `geistSans`, `geistMono`, `metadata`, `EXAMPLES`, `ProjectMap` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dotenv` connect `Runtime Dependencies` to `ETL Config and Orchestration`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `clean()` (e.g. with `load_entities()` and `load_ercot()`) actually correct?**
  _`clean()` has 6 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Shared helpers for the ETL scripts.`, `Normalize a CSV cell: NaN/blank/<<FILL>> -> None, strings stripped.`, `Replace <<FILL>> placeholders inside a parsed JSON payload with null.` to the rest of the system?**
  _86 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Next.js API Routes` be split into smaller, more focused modules?**
  _Cohesion score 0.08248587570621468 - nodes in this community are weakly interconnected._
- **Should `Dashboard UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.09154437456324249 - nodes in this community are weakly interconnected._
- **Should `ETL Loading and Cleaning` be split into smaller, more focused modules?**
  _Cohesion score 0.14795008912655971 - nodes in this community are weakly interconnected._
- **Should `ETL Config and Orchestration` be split into smaller, more focused modules?**
  _Cohesion score 0.11397849462365592 - nodes in this community are weakly interconnected._