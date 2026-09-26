import type { NextRequest } from "next/server";
import { askGridSight } from "@/lib/gemini";
import { parseAsOf } from "@/lib/queries";

export async function POST(req: NextRequest) {
  let question = "";
  let as_of: string;
  try {
    const body = (await req.json()) as { question?: unknown; as_of?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
    as_of = parseAsOf(typeof body.as_of === "string" ? body.as_of : null);
  } catch {
    return Response.json({ answer: "Sorry, I couldn't read that request.", map_filter: null, open_timeline: null, tool_calls: [] }, { status: 400 });
  }
  if (!question) {
    return Response.json({ answer: "Ask me a question about Texas data-center projects.", map_filter: null, open_timeline: null, tool_calls: [] });
  }
  return Response.json({ as_of, ...(await askGridSight(question, as_of)) });
}
