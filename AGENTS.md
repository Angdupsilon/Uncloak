## Cursor Cloud specific instructions

Uncloak is a Next.js app in `web/` plus batch Python ETL in `etl/`. Both read the gitignored repo-root `.env`. Install, schema, and run commands are in the root [README](README.md) and [web/README.md](web/README.md).

PostgreSQL 17 with TimescaleDB and `timescaledb_toolkit` is installed on this VM. There is no systemd, so the cluster stays stopped until you start it:

```bash
sudo pg_ctlcluster 17 main start
```

The local database is `uncloak` on `127.0.0.1:5432` (trust auth for local connections). `.env` should point at it:

```
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/uncloak
DATABASE_URL_RO=postgresql://gridsight_ro:dev-ro-local@127.0.0.1:5432/uncloak
```

That database already has `db/001_schema.sql`, `db/002_timescale.sql`, `db/003_readonly_role.sql`, `db/004_queue_timeline.sql`, `db/005_spare_capacity.sql`, and `db/006_standard_time_daily_buckets.sql` applied (`db/004_data_quality.sql` is only for older databases). `CREATE EXTENSION timescaledb` and `CREATE EXTENSION timescaledb_toolkit` run before those files on a new database. Sample rows are already loaded. From the repo root, with `.venv` active, reload them with `python etl/run_all.py --dir data/sample --skip-geocode` and `python etl/load_plants.py --dir data/sample`.

`npm run dev` in `web/` serves http://localhost:3000 and loads the repo-root `.env` via `web/next.config.ts`. `npm run lint` in `web/` exits 1 today: `react-hooks/set-state-in-effect` in `web/components/Illustration.tsx`, plus warnings from vendored `web/public/maplibre-gl-*.mjs`. There is no unit-test script. `python etl/check_integrity.py` audits real seed data and fails on SAMPLE rows (SAMPLE source URLs and SAMPLE projects).

Ask Uncloak needs both `GEMINI_API_KEY` and `GEMINI_MODEL`. Without them, `POST /api/ask` returns a not-configured message. `etl/pull_tdlr_data_centers.py` imports `lxml`, which is not in `etl/requirements.txt`.
