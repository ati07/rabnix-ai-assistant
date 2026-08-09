import { loadEnv } from "./_env.mjs";

/**
 * Probe Gemini model availability + free-tier quota. The default
 * `gemini-flash-latest` (→ gemini-3.6-flash) is only ~20 req/day on the free
 * tier and returns 429 RESOURCE_EXHAUSTED; other aliases have their own quota.
 * Prints which models answer a trivial prompt. Never prints the API key.
 */
const env = loadEnv();
const key = env.GEMINI_API_KEY;
if (!key) {
  console.error("GEMINI_API_KEY not set in .env");
  process.exit(1);
}

const models = process.argv.slice(2);
if (models.length === 0) {
  models.push(
    "gemini-flash-latest",
    "gemini-flash-lite-latest",
    "gemini-3-flash-preview",
  );
}

for (const model of models) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Say OK." }] }],
      }),
    });
    const body = await r.json();
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log(
      `\n=== ${model} ===\nHTTP ${r.status}`,
      r.ok ? `-> ${JSON.stringify(text)}` : JSON.stringify(body?.error ?? body),
    );
  } catch (e) {
    console.error(`\n=== ${model} ===\nERROR:`, e.message);
  }
}
