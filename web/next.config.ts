import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";
import type { NextConfig } from "next";

// Local dev: share the repo-root .env with the ETL scripts. Variables already set
// (web/.env.local, the shell, or Vercel project settings) take precedence.
const rootEnv = path.resolve(process.cwd(), "..", ".env");
if (fs.existsSync(rootEnv)) {
  for (const [k, v] of Object.entries(parse(fs.readFileSync(rootEnv)))) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const nextConfig: NextConfig = {
  devIndicators: { position: "top-right" },
};

export default nextConfig;
