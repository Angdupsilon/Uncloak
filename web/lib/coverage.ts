// Which evidence record types each state publishes and Uncloak has loaded. This keeps "not published
// here" apart from "not found": an unmet checklist item where the record type is loaded means none was
// found; where the state publishes no such record, it means the record type doesn't exist there.
import { STATE_NAMES } from "./geo";

export type EvidenceRole = "building_record" | "tenant_named" | "incentive_registry" | "air_permit" | "inspection";

/** Checklist factor key -> the record role it scores (matches etl/config.py FACTORS). */
export const FACTOR_ROLE: Record<string, EvidenceRole> = {
  tdlr_registered: "building_record",
  multi_building: "building_record",
  value_over_500m: "building_record",
  tenant_named: "tenant_named",
  comptroller_certified: "incentive_registry",
  tceq_permit: "air_permit",
  inspection_done: "inspection",
};

interface RoleSource {
  source: string;
  /** loaded: records matched to sites; pending: the list is loaded but not yet matched to sites. */
  status: "loaded" | "pending";
}

const TX_ROLES: Record<EvidenceRole, RoleSource> = {
  building_record: { source: "TDLR", status: "loaded" },
  tenant_named: { source: "TDLR", status: "loaded" },
  incentive_registry: { source: "Texas Comptroller", status: "loaded" },
  air_permit: { source: "TCEQ", status: "loaded" },
  inspection: { source: "TDLR", status: "loaded" },
};

const STATE_ROLES: Record<string, Partial<Record<EvidenceRole, RoleSource>>> = {
  TX: TX_ROLES,
  IL: { incentive_registry: { source: "Illinois DCEO", status: "loaded" } },
  MN: { incentive_registry: { source: "Minnesota DEED", status: "loaded" } },
  VA: { air_permit: { source: "Virginia DEQ", status: "pending" } },
};

export type FactorCoverage = { status: "loaded" | "pending" | "not_published"; source: string | null };

export function factorCoverage(factorKey: string, state: string): FactorCoverage {
  const role = FACTOR_ROLE[factorKey];
  const src = role ? STATE_ROLES[state]?.[role] : undefined;
  return src ? { status: src.status, source: src.source } : { status: "not_published", source: null };
}

/** One sentence for a site outside Texas: which record types exist for its state. */
export function coverageNote(state: string): string {
  const name = STATE_NAMES[state] ?? state;
  const roles = Object.values(STATE_ROLES[state] ?? {});
  const loaded = roles.filter((r) => r.status === "loaded").map((r) => r.source);
  const pending = roles.filter((r) => r.status === "pending").map((r) => r.source);
  const parts = [
    loaded.length ? `${name} records loaded: ${loaded.join(", ")}.` : `No ${name} public-record source is loaded yet.`,
    pending.length ? `${pending.join(", ")}: list loaded, not yet matched to sites.` : "",
    "A signal marked “not published here” is a record type with no equivalent loaded for this state, not a record that was checked and found missing.",
  ];
  return parts.filter(Boolean).join(" ");
}

export function factorNote(c: FactorCoverage, state: string): string | null {
  if (c.status === "not_published") return "Not published here";
  if (c.status === "pending") return `${c.source} list loaded; not yet matched to sites`;
  return state === "TX" ? null : `From ${c.source}`;
}
