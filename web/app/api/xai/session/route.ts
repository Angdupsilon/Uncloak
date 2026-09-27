export async function POST() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Grok Voice is not configured." }, { status: 503 });
  }

  const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.value !== "string") {
    console.error("[grok voice token]", response.status, body);
    return Response.json({ error: "Grok Voice is unavailable right now." }, { status: 502 });
  }
  return Response.json({ value: body.value, expires_at: body.expires_at });
}
