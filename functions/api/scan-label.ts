/**
 * Cloudflare Pages Function: /api/scan-label
 * 
 * Sends museum photo to Gemini 2.5 Flash Vision.
 * Returns: artwork metadata + painting corner coordinates.
 * The AI identifies the painting INSIDE the frame and returns
 * precise coordinates for perspective correction + cropping.
 */
export const onRequest: PagesFunction = async ({ request, env }) => {
    const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    const apiKey = env.GEMINI_API_KEY as string | undefined;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
            { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    let body: { image?: string; mimeType?: string; width?: number; height?: number } = {};
    try { body = await request.json(); } catch {
        return new Response("Invalid JSON", { status: 400, headers: cors });
    }

    if (!body.image) {
        return new Response(JSON.stringify({ error: "Missing image" }),
            { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const prompt = `You are analyzing a photograph of a framed artwork (painting, print, drawing) hanging on a museum/gallery wall.

TASK 1 - READ THE LABEL:
Find the museum placard/label near the artwork and extract:
- artist: Artist's full name
- title: Artwork title  
- year: Year the artwork was CREATED (NOT birth/death years like "1840-1926")

TASK 2 - LOCATE THE PAINTING:
Identify the 4 corners of the PAINTING CANVAS — the actual artwork surface INSIDE any decorative frame, mat, or border.
Return corner positions as fractions (0.0 to 1.0) of the image dimensions:
- x: 0.0 = left edge, 1.0 = right edge
- y: 0.0 = top edge, 1.0 = bottom edge
Account for perspective distortion — the painting may be photographed at an angle.

Return ONLY this JSON (no markdown, no explanation):
{
  "artist": "...",
  "title": "...",
  "year": "...",
  "corners": {
    "topLeft": [x, y],
    "topRight": [x, y],
    "bottomRight": [x, y],
    "bottomLeft": [x, y]
  }
}

If you cannot find a label, use empty strings for metadata.
The corners MUST always be provided — identify the painting canvas as precisely as possible.`;

    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [
                            { inlineData: { mimeType: body.mimeType || "image/jpeg", data: body.image } },
                            { text: prompt },
                        ],
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        topP: 0.8,
                        maxOutputTokens: 800,
                        thinkingConfig: { thinkingBudget: 0 },
                    },
                }),
            }
        );

        if (!res.ok) throw new Error(`Gemini ${res.status}`);

        const data: any = await res.json();
        // Gemini 2.5 Flash "thinking" model — may have multiple parts
        const parts = data?.candidates?.[0]?.content?.parts || [];
        let allText = "";
        for (const part of parts) {
            if (part.text) allText += part.text + "\n";
        }

        // Strip markdown code fences and find JSON
        const cleaned = allText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
        const jm = cleaned.match(/\{[\s\S]*\}/);
        let result = { artist: "", title: "", year: "", corners: null as any };
        if (jm) {
            try {
                const p = JSON.parse(jm[0]);
                result.artist = (p.artist || "").trim();
                result.title = (p.title || "").trim();
                result.year = (p.year || "").toString().trim();
                if (p.corners?.topLeft && p.corners?.topRight && p.corners?.bottomRight && p.corners?.bottomLeft) {
                    result.corners = p.corners;
                }
            } catch { console.error("Parse fail:", allText.slice(0, 200)); }
        }

        return new Response(JSON.stringify(result),
            { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    } catch (err) {
        return new Response(JSON.stringify({
            error: err instanceof Error ? err.message : "Unknown",
            artist: "", title: "", year: "", corners: null,
        }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
};
