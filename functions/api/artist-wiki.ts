export const onRequest: PagesFunction = async ({ request, env }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const apiKey = env.GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return new Response(JSON.stringify({
      error: "GEMINI_API_KEY is not configured",
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  let payload: { topic?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const topic = (payload.topic || "").toString().trim();
  if (!topic) {
    return new Response("Missing topic", { status: 400 });
  }

  const cache = caches.default;
  const normalizedTopic = topic.toLowerCase();
  const cacheKey = new Request(`https://cache.local/artist-wiki?topic=${encodeURIComponent(normalizedTopic)}`, {
    method: "GET",
  });

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Cache": "HIT",
        },
      });
    }
  } catch {
    // ignore cache errors
  }

  const generate = async (model: string, prompt: string, maxTokens: number) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            topP: 0.9,
            topK: 32,
            maxOutputTokens: maxTokens,
          },
        }),
      }
    );

    if (!response.ok) {
      const status = response.status;
      throw new Error(`Gemini ${model} failed (${status})`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return (text || "").trim();
  };

  const summaryPrompt = `Write a concise, single-paragraph encyclopedia-style description of the artist "${topic}". Be neutral, informative, and avoid markdown or headings. Return only the paragraph text.`;
  const asciiPrompt = `Create a clean ASCII portrait inspired by the artist "${topic}".
Constraints:
- Use ONLY: │─┌┐└┘├┤┬┴┼░▒▓█▀▄ and spaces.
- No letters, no numbers, no emojis.
- Output should be 28 to 40 chars wide and 7 to 11 lines tall.
- The portrait should be minimal, readable, and calm (face-like silhouette).
- Keep plenty of whitespace; avoid noise.
Return ONLY the ASCII art text, no quotes, no markdown.`;

  try {
    const asciiEnabled = String(env.GEMINI_ASCII_ENABLED || "").toLowerCase() === "true";
    const summary = await generate("gemini-2.5-flash-lite", summaryPrompt, 180);
    let ascii = "";
    if (asciiEnabled) {
      ascii = await generate("gemini-2.5-flash", asciiPrompt, 140);
    }

    const body = JSON.stringify({
      summary,
      ascii,
      sourceUrl: "",
      model: "gemini-2.5-flash-lite",
    });

    const response = new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=0, s-maxage=604800",
      },
    });

    try {
      await cache.put(cacheKey, response.clone());
    } catch {
      // ignore cache errors
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes('(429)') ? 429 : 502;
    return new Response(
      JSON.stringify({
        error: message,
        status,
      }),
      {
        status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
};
