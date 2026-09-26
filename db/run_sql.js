// Usage (from PhantomData folder): node db/run_sql.js db/004_queue_timeline.sql
const path = require("path");
const fs = require("fs");
const { Client } = require(path.join(__dirname, "..", "web", "node_modules", "pg"));

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const m = env.match(/^DATABASE_URL=(.*)$/m);
if (!m) { console.error("DATABASE_URL not found in .env"); process.exit(1); }
const url = m[1].trim().replace(/^["']|["']$/g, "").replace(/\?.*$/, "");

(async () => {
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const files = process.argv.slice(2);
  if (!files.length) {
    const r = await c.query("select table_name, table_type from information_schema.tables where table_schema='public' order by 1");
    console.table(r.rows);
  }
  for (const f of files) {
    console.log("Running", f, "...");
    await c.query(fs.readFileSync(f, "utf8"));
    console.log("  OK");
  }
  await c.end();
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
