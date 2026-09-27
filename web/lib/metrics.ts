// One place that explains every number the public pages show. Profile tiles, tables and the
// methodology page all read from here, so a metric is described the same way everywhere.
//
// kind:
//   documented  copied or summed straight from a public record
//   derived     calculated by Uncloak from documented values (method on /methodology)
//   modeled     a statistical estimate, always a low-high range with its method version and backtest
//   context     background that helps interpret a number; not a measurement of this site

export type MetricKind = "documented" | "derived" | "modeled" | "context";

export interface MetricDef {
  label: string;
  unit: string;
  kind: MetricKind;
  source: string;
  /** Plain-English meaning, one or two sentences. */
  meaning: string;
  /** What the number does NOT tell you. */
  caveat: string;
  /** Why someone nearby might care. Always framed as context, never as a measured impact. */
  local?: string;
}

export const SOURCES = {
  COMPTROLLER: {
    name: "Texas Comptroller, Data Centers in Texas registry",
    short: "Texas Comptroller",
    url: "https://comptroller.texas.gov/taxes/data-centers/data-center-lists.php",
    what: "Sites registered for the state's data-center sales-tax exemption programs, with owner, occupant and operator entities.",
  },
  TDLR: {
    name: "Texas Department of Licensing and Regulation, TABS project search",
    short: "TDLR",
    url: "https://www.tdlr.texas.gov/TABS/Search",
    what: "Construction projects registered for accessibility review, with address, estimated cost, square footage, tenant and status.",
  },
  TCEQ: {
    name: "Texas Commission on Environmental Quality records",
    short: "TCEQ",
    url: "https://records.tceq.texas.gov/",
    what: "Environmental permit filings (for example, backup generators) linked to a site.",
  },
  VA_DEQ: {
    name: "Virginia Department of Environmental Quality, issued air permits for data centers",
    short: "Virginia DEQ",
    url: "https://www.deq.virginia.gov/news-info/shortcuts/permits/air/issued-air-permits-for-data-centers",
    what: "Air permits DEQ has issued to data centers, mostly for backup diesel generators, with the permit document for each.",
  },
  IL_DCEO: {
    name: "Illinois DCEO, Data Center Investment Program annual reports",
    short: "Illinois DCEO",
    url: "https://dceo.illinois.gov/aboutdceo/reportsrequiredbystatute.html",
    what: "Data centers with a signed memorandum of understanding and sales-tax exemption certificate, with the MOU year, city, investment commitment and jobs.",
  },
  MN_DEED: {
    name: "Minnesota DEED, list of designated qualified data centers",
    short: "Minnesota DEED",
    url: "https://mn.gov/deed/business/financing-business/tax-credits/data-center-credit/",
    what: "Data centers certified for Minnesota's data-center sales-tax exemption, with company, city and type. No certification dates or addresses are published.",
  },
  IN_IEDC: {
    name: "Indiana IEDC Transparency Portal, data center sales tax exemption contracts",
    short: "Indiana IEDC",
    url: "https://transparencyportal.iedc.in.gov/searchtaxgrantloancontracts",
    what: "Executed data-center sales-tax exemption contracts (fund type DATA), with recipient, city, county, contract date and investment.",
  },
  WI_DOR: {
    name: "Wisconsin Department of Revenue, certified qualified data centers",
    short: "Wisconsin DOR",
    url: "https://www.revenue.wi.gov/Pages/FAQS/ExemptionforQualifiedDataCenter.aspx",
    what: "Data centers certified by WEDC for Wisconsin's data-center sales and use tax exemption, with certification date and location.",
  },
  ERCOT: {
    name: "ERCOT large-load interconnection reports",
    short: "ERCOT",
    url: "https://www.ercot.com/",
    what: "Statewide totals for large electricity loads asking to connect to the Texas grid.",
  },
  OSM: {
    name: "IM3 Open Source Data Center Atlas (PNNL), built from OpenStreetMap",
    short: "IM3 atlas (OSM)",
    url: "https://data.msdlive.org/records/65g71-a4731",
    what: "Mapped data-center buildings and campuses in every state, with the OpenStreetMap operator tag and footprint area. A map layer, not a public record: it places a site and names an operator, and earns no evidence points.",
  },
} as const;

export type SourceKey = keyof typeof SOURCES;

export const METRICS = {
  sites: {
    label: "Sites in our records",
    unit: "sites",
    kind: "documented",
    source: "Texas Comptroller registry and TDLR construction filings (Texas), and the IM3 data-center atlas operator tag (all states), linked to this organization",
    meaning: "How many distinct data-center sites in our records are linked to this organization.",
    caveat:
      "Counts only sites we could find in these records and link to the organization. Projects filed under code names, or whose ownership we could not resolve, are not included.",
    local: "Shows where the organization has a documented or mapped physical presence.",
  },
  counties: {
    label: "Counties",
    unit: "counties",
    kind: "documented",
    source: "Site addresses and county fields from the Comptroller registry, TDLR filings and the reviewed location list",
    meaning: "How many different counties the organization's recorded sites are in.",
    caveat: "Sites without a published location can't be placed in a county, so the true number may be higher.",
    local: "Shows which local communities host the organization's documented facilities.",
  },
  entities: {
    label: "Registered entities",
    unit: "entities",
    kind: "documented",
    source: "Texas Comptroller registry (owner, occupant and operator names)",
    meaning:
      "Legal entities (often LLCs with unrelated-sounding names) that appear on the public records and that we linked to this organization.",
    caveat: "A link means the organization is named as owner, occupant, operator or tenant on the record. It does not describe the full corporate structure.",
  },
  registered_cost: {
    label: "Registered construction cost",
    unit: "US dollars",
    kind: "documented",
    source: "TDLR TABS: the 'Estimated Cost' on each construction registration",
    meaning: "The builder's estimated construction cost, added up across the site's TDLR registrations.",
    caveat:
      "An estimate filed before construction, not an audited amount. Many sites have no TDLR registration, so it's shown as unavailable, not zero. Registrations can overlap, for example a renovation of an already registered building.",
    local: "Large construction projects are relevant to local planning, jobs during construction and property tax rolls. This figure alone doesn't measure any of those.",
  },
  square_footage: {
    label: "Registered floor area",
    unit: "square feet",
    kind: "documented",
    source: "TDLR TABS: 'Square Footage' on each registration",
    meaning: "Floor area published on the site's TDLR registrations, added up.",
    caveat: "Published for only some registrations, and registrations can overlap.",
  },
  mw_est: {
    label: "Estimated power demand",
    unit: "megawatts (MW)",
    kind: "derived",
    source: "Uncloak estimate: registered construction cost ÷ an industry cost-per-MW benchmark",
    meaning:
      "A rough size estimate. It's the registered construction cost divided by an average all-in cost of building one megawatt of data-center capacity.",
    caveat:
      "Not a measured or requested load. The real power draw can be much higher or lower. Available only where a construction cost is registered.",
    local: "Data centers use electricity continuously. Large new loads are part of what grid planners and utilities must serve, but this estimate says nothing about local rates or reliability.",
  },
  it_mw_modeled: {
    label: "Modeled IT load",
    unit: "megawatts (MW), a 10th-90th percentile range",
    kind: "modeled",
    source: "Uncloak model: floor area (or the atlas building footprint) × the MW per square foot seen at Texas data centers with both a registered floor area and a construction cost",
    meaning:
      "A range for how much IT load a building of this size typically has, based on Texas data centers whose floor area and construction cost are both on record.",
    caveat:
      "A statistical estimate, not a record. The training MW is itself cost-derived, an atlas footprint is ground coverage rather than floor area (so multi-storey buildings come out low), and the range is wide on purpose. It never feeds the evidence index.",
  },
  evidence: {
    label: "Evidence index",
    unit: "0–100% (uncalibrated)",
    kind: "derived",
    source: "Uncloak checklist of public-record signals (see Methodology)",
    meaning:
      "How much public-record evidence supports that the project is real and advancing: registrations, certification, tenant named, permits, inspections.",
    caveat: "A checklist score, not a probability that the site will be built or operate at any size.",
  },
  certified: {
    label: "State data-center certification",
    unit: "date",
    kind: "documented",
    source: "Texas Comptroller registry: 'Effective Date'",
    meaning:
      "The date the site was registered in a Texas data-center sales-tax exemption program (Qualifying Data Center or Qualifying Large Data Center Project).",
    caveat: "Registration shows eligibility for the exemption program. It does not show the size of any tax benefit, which is not published here.",
    local: "The exemption program is a state tax policy decision about these sites. The registry itself doesn't report local tax effects.",
  },
  ercot_requested: {
    label: "Large loads requesting grid connection (statewide)",
    unit: "gigawatts (GW)",
    kind: "context",
    source: "ERCOT large-load interconnection reports",
    meaning: "Total electricity demand from large new customers (data centers, crypto mining, industry) asking ERCOT to connect.",
    caveat: "Statewide and covers all large-load types, not only data centers. Many requests never connect. Report scope changed over time.",
  },
  plant_connection: {
    label: "Grid connection size",
    unit: "megawatts (MW)",
    kind: "documented",
    source: "EIA-860 / EIA-860M generator inventory (nameplate capacity)",
    meaning: "The most power an existing plant may send onto the grid. A new battery, solar farm or load that shares the connection must stay within it.",
    caveat: "Nameplate capacity stands in for the interconnection limit, which utilities and ERCOT don't publish per plant. The real limit can be lower.",
  },
  spare_p80: {
    label: "Connection free in 80% of hours",
    unit: "megawatts (MW)",
    kind: "derived",
    source: "Hourly output: EPA CAMPD gross load for fossil units, modeled output for solar and wind, over the latest 365 days",
    meaning: "How much of the connection sat unused in at least 80% of the year's hours. A battery can use this room and wait out the other hours.",
    caveat: "Past output doesn't guarantee future room. Any shared project must throttle when the plant runs, and the owner must agree to share.",
  },
  spare_p95: {
    label: "Connection free in 95% of hours",
    unit: "megawatts (MW)",
    kind: "derived",
    source: "Hourly output: EPA CAMPD gross load for fossil units, modeled output for solar and wind, over the latest 365 days",
    meaning: "The steadier figure: room that was free almost all the time. A load that runs around the clock, such as a data center, would screen on this.",
    caveat: "The remaining 5% of hours still need a plan, such as curtailment or on-site storage.",
  },
  hours_over_half: {
    label: "Hours above half output",
    unit: "share of hours",
    kind: "derived",
    source: "Hourly output: EPA CAMPD gross load for fossil units, modeled output for solar and wind, over the latest 365 days",
    meaning: "How often the plant ran at more than half its connection size. Low values mean the connection is mostly idle.",
    caveat: "Counts hours, not energy. A plant can be rarely busy yet run flat out on the hottest afternoons.",
  },
  spare_sites: {
    label: "Sites that pass a screen",
    unit: "plants",
    kind: "derived",
    source: "Uncloak screening rules applied to the spare-capacity figures and site data",
    meaning: "Plants with enough free connection for at least one use: a battery, a steady load, or solar plus storage.",
    caveat: "A screen, not a feasibility study. Land, permits, owner consent and grid rules decide whether a project can actually be built.",
  },
} as const satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;

export const KIND_LABEL: Record<MetricKind, string> = {
  documented: "Documented",
  derived: "Uncloak estimate",
  modeled: "Uncloak estimate (modeled)",
  context: "Context",
};

export const KIND_HELP: Record<MetricKind, string> = {
  documented: "Taken or summed directly from a public record.",
  derived: "Calculated by Uncloak from public records. See Methodology.",
  modeled: "A statistical range from an Uncloak model, with its method version and backtest error. Never a record, never scored.",
  context: "Background for interpretation. Not a measurement of this organization or site.",
};

/** Plain-English label for the Comptroller program names. */
export const PROGRAM_HELP: Record<string, string> = {
  "Qualifying Data Center": "a Texas program giving sales-tax exemptions to qualifying data centers",
  "Qualifying Large Data Center Project": "a Texas program giving sales-tax exemptions to large data-center projects",
};

export const RESOLVED_BY_LABEL: Record<string, string> = {
  COMPTROLLER: "Named on the Texas Comptroller registry record",
  TDLR_TENANT: "Named as tenant on a TDLR construction registration",
  TDLR_OWNER: "Named as owner on a TDLR construction registration",
  OSM_OPERATOR: "Named as operator in OpenStreetMap (IM3 data-center atlas), not a registered-entity record",
  STATE_REGISTRY: "Named in the company text of a state data-center incentive registry",
  MANUAL: "Linked by manual review of a cited source",
};
