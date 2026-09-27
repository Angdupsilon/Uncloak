// Match what someone typed to an organization in the records, the way a person
// would: "AT&T" or "ATT", "Google Inc.", "Amazon Web Services", "Facebook" for
// Meta, and a near miss such as "Antrhopic". The organization list is small
// (a couple of hundred names), so matching runs in memory over the full list.

/**
 * Other names people use for an organization, mapped to its name in `parents`.
 * Only brands, tickers and former names of the same company belong here; a
 * subsidiary with its own record (LinkedIn, CenturyLink) keeps its own name.
 */
export const ORG_ALIASES: Record<string, string> = {
  Facebook: "Meta",
  Instagram: "Meta",
  WhatsApp: "Meta",
  AWS: "Amazon",
  Alphabet: "Google",
  GCP: "Google",
  Azure: "Microsoft",
  MSFT: "Microsoft",
  OCI: "Oracle",
  QTS: "Quality Technology Services",
  "BNY Mellon": "BNYM",
  "Bank of New York Mellon": "BNYM",
  USPS: "United States Postal Service",
  "Postal Service": "United States Postal Service",
  "LDS Church": "The Church of Jesus Christ of Latter-day Saints",
  ORNL: "Oak Ridge National Laboratory",
  MARA: "Marathon Digital Holdings",
  "British Telecom": "bt",
  "New York Stock Exchange": "nyse",
};

// Legal-form words that are not part of how an organization is recorded.
const LEGAL_FORM = /(?:[\s,]+(?:inc|incorporated|llc|l\.l\.c|corp|corporation|co|company|ltd|limited|plc|lp|llp)\.?)+$/i;

const lower = (s: string) => s.toLocaleLowerCase().replace(/\s+/g, " ").trim();
const compact = (s: string) => s.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export type OrgMatch<T> = { org: T; via: "name" | "alias" | "spelling"; alias?: string };

/** Edit distance counting a swap of two neighbouring letters as one edit. */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Organizations matching `term`, best first. Exact names and aliases come
 * first, then names that start with the term, then names containing it. When
 * nothing matches, the closest spellings are returned instead.
 */
export function matchOrgs<T extends { name: string; sites: number }>(term: string, orgs: T[], limit: number): OrgMatch<T>[] {
  const stripped = lower(term).replace(LEGAL_FORM, "");
  const key = stripped.length >= 2 ? stripped : lower(term);
  const keyCompact = compact(key);
  const byName = new Map(orgs.map((o) => [lower(o.name), o]));

  const ranked: { m: OrgMatch<T>; rank: number }[] = [];
  const seen = new Set<T>();
  const add = (org: T | undefined, rank: number, via: OrgMatch<T>["via"], alias?: string) => {
    if (!org || seen.has(org)) return;
    seen.add(org);
    ranked.push({ m: { org, via, alias }, rank });
  };

  for (const [alias, name] of Object.entries(ORG_ALIASES)) {
    const org = byName.get(lower(name));
    const a = lower(alias);
    if (key === a) add(org, 0, "alias", alias);
    else if (key.startsWith(`${a} `) || (key.length >= 4 && a.startsWith(key))) add(org, 2, "alias", alias);
  }
  for (const org of orgs) {
    const name = lower(org.name);
    if (name === key) add(org, 0, "name");
    else if (name.startsWith(key)) add(org, 1, "name");
    // "Amazon Web Services", "Google Cloud": the organization plus more words.
    else if (name.length >= 3 && key.startsWith(`${name} `)) add(org, 2, "name");
    else if (name.includes(` ${key}`)) add(org, 2, "name");
    else if (name.includes(key)) add(org, 3, "name");
    // "ATT" for AT&T, "Cyrus One" for CyrusOne, "JP Morgan" for JPMorgan Chase.
    else if (keyCompact.length >= 3 && compact(org.name).startsWith(keyCompact)) add(org, 3, "name");
  }

  if (!ranked.length) {
    // One slip for a short name, two for a long one; very short terms are too ambiguous.
    const allowed = key.length < 4 ? 0 : key.length < 8 ? 1 : 2;
    if (allowed) {
      const aliasesOf = new Map<string, string[]>();
      for (const [alias, name] of Object.entries(ORG_ALIASES)) aliasesOf.set(lower(name), [...(aliasesOf.get(lower(name)) ?? []), lower(alias)]);
      for (const org of orgs) {
        const name = lower(org.name);
        const words = name.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4);
        const best = Math.min(...[name, ...words, ...(aliasesOf.get(name) ?? [])].map((c) => editDistance(key, c)));
        if (best <= allowed) ranked.push({ m: { org, via: "spelling" }, rank: best });
      }
    }
  }

  return ranked
    .sort((a, b) => a.rank - b.rank || b.m.org.sites - a.m.org.sites || a.m.org.name.localeCompare(b.m.org.name))
    .slice(0, limit)
    .map((r) => r.m);
}
