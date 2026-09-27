// "Ask Uncloak": Gemini function calling over four read-only tools.
// The model never writes SQL; every tool runs a function from lib/queries.ts.
import { FunctionCallingConfigMode, GoogleGenAI, type Content, type FunctionCall, type FunctionDeclaration, type Part } from "@google/genai";
import {
  METROS,
  getParents,
  getProjects,
  getSummary,
  getTimeline,
  lookupProjectOrEntity,
  parseAsOf,
  type Metro,
} from "./queries";
import type { AskResponse } from "./types";

const SYSTEM_PROMPT = `You are Uncloak's analyst. Answer only from tool results. Never state a number, project, company, or date that did not appear in a tool result. If tools return nothing, say so. Keep answers under 80 words. Probabilities are an uncalibrated evidence index; call them "evidence scores." When a question refers to a set of projects, call filter_projects so the map can show them. "Phantom load" means phantom_gw: queue load ERCOT has not approved to energize. Never call shadow_gw phantom: it is the gap between the queue and what our public records have matched so far, which mostly reflects our data coverage. Coverage is national. ERCOT figures cover Texas. Evidence-score factors are public-record types: Texas has all of them, Illinois, Minnesota, Indiana and Wisconsin have a state incentive registry, Virginia has DEQ air permits (matched to only a few sites so far), and elsewhere a site can score 0 because those record types are not loaded there, not because evidence was checked and failed. it_mw_modeled is a modeled range (low-high), never a record: always call it "an Uncloak estimate (modeled)" and give its range, not one number. Sites whose only record is "site_mapped" come from the IM3 data-center atlas (OpenStreetMap); say so when you cite one.`;

const MAX_ROUNDS = 4;
const MAX_PROJECTS_TO_MODEL = 40;

const asOfProp = { type: "string", description: "ISO date YYYY-MM-DD. Omit to use the dashboard's selected date." };

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "filter_projects",
    description:
      "List data-center projects matching filters, with evidence score (0-1), tier, estimated MW, total registered construction cost (USD), parent company and permit status. Also updates the map to show the matching projects.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        state: { type: "string", description: "Two-letter USPS state code, e.g. 'VA'" },
        county: { type: "string", description: "County name without 'County', e.g. 'Milam' or 'Loudoun'. Combine with state when the name exists in several states." },
        metro: { type: "string", enum: Object.keys(METROS), description: "Texas metro area bounding box" },
        parent: { type: "string", description: "Parent company name (partial match). Use 'Unresolved' for projects with no known parent." },
        min_cost_usd: { type: "number", description: "Minimum total registered construction cost in USD" },
        max_probability: { type: "number", description: "Maximum evidence score, 0-1" },
        min_probability: { type: "number", description: "Minimum evidence score, 0-1" },
        has_permit: { type: "boolean", description: "true = has a state air permit filed (TCEQ in Texas, DEQ in Virginia); false = no permit filed" },
        as_of: asOfProp,
      },
    },
  },
  {
    name: "get_project_timeline",
    description:
      "Look up one project by name or ID (fuzzy match on project name, LLC name or parent company) and return its owner chain (LLC -> parent), evidence-score history and dated evidence events. Also use this to find who is behind an LLC.",
    parametersJsonSchema: {
      type: "object",
      properties: { name_or_id: { type: "string", description: "Project name, LLC name, or numeric project ID" } },
      required: ["name_or_id"],
    },
  },
  {
    name: "get_summary",
    description:
      "Texas totals as of a date: ERCOT large-load queue (GW requested/approved/observed peak, with date and source), GW found in Texas public records, evidence-weighted realistic GW, phantom load (requested minus ERCOT-approved), shadow load (requested minus found in public records) and the count of Texas projects with a public record.",
    parametersJsonSchema: { type: "object", properties: { as_of: asOfProp } },
  },
  {
    name: "compare_parents",
    description: "Estimated MW by parent company as of a date: total MW, evidence-weighted MW, MW in verified-tier projects, and project count.",
    parametersJsonSchema: { type: "object", properties: { as_of: asOfProp } },
  },
];

type Args = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

export interface DispatchState {
  mapIds: number[] | null;
  openTimeline: number | null;
}

export async function runTool(call: FunctionCall, dashboardAsOf: string, state: DispatchState): Promise<unknown> {
  const args: Args = call.args ?? {};
  const asOf = (() => {
    try {
      return parseAsOf(str(args.as_of) ?? dashboardAsOf);
    } catch {
      return dashboardAsOf;
    }
  })();

  switch (call.name) {
    case "filter_projects": {
      const metro = str(args.metro);
      if (metro && !(metro in METROS)) return { error: `unknown metro ${metro}; use one of ${Object.keys(METROS).join(", ")}` };
      const projects = await getProjects(asOf, {
        state: str(args.state),
        county: str(args.county),
        metro: metro as Metro | null,
        parent: str(args.parent),
        min_cost: num(args.min_cost_usd),
        max_prob: num(args.max_probability),
        min_prob: num(args.min_probability),
        has_permit: bool(args.has_permit),
      });
      state.mapIds = projects.map((p) => p.project_id);
      return {
        as_of: asOf,
        count: projects.length,
        truncated: projects.length > MAX_PROJECTS_TO_MODEL,
        projects: projects.slice(0, MAX_PROJECTS_TO_MODEL).map((p) => ({
          project_id: p.project_id,
          name: p.name,
          state: p.state,
          county: p.county,
          llc_name: p.llc_name,
          parent: p.parent,
          evidence_score: p.probability,
          tier: p.tier,
          mw_est: p.mw_est,
          total_registered_cost_usd: p.total_cost,
          has_air_permit: p.has_permit,
          is_sample: p.is_sample,
        })),
      };
    }
    case "get_project_timeline": {
      const term = str(args.name_or_id);
      if (!term) return { error: "name_or_id is required" };
      const found = await lookupProjectOrEntity(term);
      const best = found.projects[0];
      if (!best) {
        if (found.entities.length) return { projects_found: 0, llc_matches: found.entities };
        return { projects_found: 0, llc_matches: [], message: `No project or LLC matches "${term}".` };
      }
      const tl = await getTimeline(best.project_id, asOf);
      if (!tl) return { projects_found: 0 };
      state.openTimeline = best.project_id;
      // Only keep score rows where the score or MW estimate changed, to keep the context small.
      const changes = tl.scores.filter(
        (s, i) => i === 0 || s.score !== tl.scores[i - 1].score || s.mw_est !== tl.scores[i - 1].mw_est,
      );
      return {
        as_of: asOf,
        project: {
          project_id: tl.project.project_id,
          name: tl.project.name,
          state: tl.project.state,
          county: tl.project.county,
          llc_name: tl.project.llc_name,
          parent: tl.project.parent,
          parent_resolved_by: tl.project.resolved_by,
          evidence_score: tl.project.probability ?? null,
          tier: tl.project.tier ?? null,
          mw_est: tl.project.mw_est ?? null,
          it_mw_modeled: (() => {
            const m = tl.estimates.find((e) => e.metric === "it_mw");
            return m
              ? { low: Math.round(m.low), mid: Math.round(m.mid), high: Math.round(m.high), unit: m.unit, label: "Uncloak estimate (modeled)",
                  input: m.inputs.sqft_source, backtest_median_error_pct: m.validation.median_abs_pct_error ?? null }
              : null;
          })(),
          total_registered_cost_usd: tl.project.total_cost ?? null,
          is_sample: tl.project.is_sample,
        },
        score_changes: changes.map((s) => ({ date: s.ts.slice(0, 10), evidence_score: s.probability, mw_est: s.mw_est })),
        events: tl.events.map((e) => ({
          date: e.ts.slice(0, 10),
          source: e.source,
          event_type: e.event_type,
          value_num: e.value_num,
          details: e.payload,
        })),
        other_matches: found.projects.slice(1).map((p) => p.name),
        llc_matches: found.entities,
      };
    }
    case "get_summary": {
      const s = await getSummary(asOf);
      const { weekly, ...rest } = s;
      const first = weekly.find((w) => w.found_gw != null && w.found_gw > 0);
      return { ...rest, weekly_points: weekly.length, first_week_with_mw: first ?? null, latest_week: weekly.at(-1) ?? null };
    }
    case "compare_parents": {
      return { as_of: asOf, parents: await getParents(asOf) };
    }
    default:
      return { error: `unknown tool ${call.name}` };
  }
}

const friendly = (answer: string): AskResponse => ({ answer, map_filter: null, open_timeline: null, tool_calls: [] });

export async function askGridSight(question: string, asOf: string): Promise<AskResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) return friendly("Ask Uncloak isn't configured yet (GEMINI_API_KEY / GEMINI_MODEL are not set).");

  const ai = new GoogleGenAI({ apiKey });
  const contents: Content[] = [
    { role: "user", parts: [{ text: `${question}\n\n(Dashboard as-of date: ${asOf}.)` }] },
  ];
  const state: DispatchState = { mapIds: null, openTimeline: null };
  const toolCalls: AskResponse["tool_calls"] = [];

  try {
    // Up to MAX_ROUNDS rounds of tool calls, then one final call with tools disabled.
    for (let round = 0; round <= MAX_ROUNDS; round++) {
      const final = round === MAX_ROUNDS;
      const res = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          ...(final ? { toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.NONE } } } : {}),
        },
      });
      const calls = res.functionCalls ?? [];
      if (!calls.length || final) {
        const answer = (res.text ?? "").trim() || "I couldn't find an answer in Uncloak's data.";
        return {
          answer,
          map_filter: state.mapIds ? { ids: state.mapIds, fit_bounds: state.mapIds.length > 0 } : null,
          open_timeline: state.openTimeline,
          tool_calls: toolCalls,
        };
      }
      // Echo the model turn back verbatim (keeps thought signatures intact).
      const modelContent = res.candidates?.[0]?.content ?? { role: "model", parts: calls.map((c) => ({ functionCall: c })) };
      contents.push(modelContent);
      const responses: Part[] = [];
      for (const call of calls) {
        toolCalls.push({ name: call.name ?? "unknown", args: call.args ?? {} });
        let result: unknown;
        try {
          result = await runTool(call, asOf, state);
        } catch (err) {
          console.error("[gridsight ask] tool failed", call.name, err);
          result = { error: "tool failed" };
        }
        responses.push({ functionResponse: { id: call.id, name: call.name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
  } catch (err) {
    console.error("[gridsight ask]", err);
    return { ...friendly("Sorry, Ask Uncloak hit an error. Please try again."), tool_calls: toolCalls };
  }
  return friendly("I couldn't find an answer in Uncloak's data.");
}
