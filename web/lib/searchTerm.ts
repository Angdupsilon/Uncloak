// Reduce what someone typed to the name or place they are looking for.
// Shared by the search box (client) and the search query (server), so the
// dropdown, the results page and /api/search all match the same text.

// Lead-in phrases that ask for a record rather than name one ("Look up Anthropic").
const LEAD_IN = /^(?:please\s+)?(?:look\s*up|search\s+for|search|find(?:\s+me)?|show\s+me|pull\s+up|tell\s+me\s+about)\s+/i;
// Sentence punctuation after a name ("Anthropic.", "Google?") is never part of it.
const TRAILING = /[\s.,;:!?]+$/;
const QUOTES = /^["'“‘]+|["'”’]+$/g;

export function lookupTerm(raw: string): string {
  let term = raw.trim().replace(TRAILING, "").replace(QUOTES, "").trim();
  const stripped = term.replace(LEAD_IN, "").replace(QUOTES, "").trim();
  // Keep the original when the lead-in was the whole query ("find").
  if (stripped.length >= 2) term = stripped;
  return term.replace(TRAILING, "").trim();
}
