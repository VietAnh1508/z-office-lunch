import { ERROR_MESSAGES } from "../../lib/errors";
import { fail, ok, type Result } from "../../lib/result";

export const GENERATE_MENU_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
// Generous headroom over what a real menu needs (a ~90-item multi-column coffee menu used
// ~1400 completion tokens in manual testing) — a truncated response fails the shape check
// below and 500s, which is worse than the token cost of a wide margin.
export const GENERATE_MENU_MAX_TOKENS = 4096;
export const GENERATE_MENU_PROMPT =
  "List every distinct menu item in this image, once each, by name only. Ignore prices, " +
  "decorative images, and any text that isn't a menu item.\n\n" +
  'Respond with ONLY a single JSON object of the exact shape {"items":[{"name":string}]} ' +
  "— no markdown, no code fences, no commentary before or after.";

// Cloudflare's `response_format: json_schema` JSON mode is NOT usable here: this model's
// input type has no `response_format` field at all (unlike e.g. Llama 3.3 70B's), and a real
// call confirmed it silently ignores the option when passed anyway — the response comes back
// as free-text prose, not schema-constrained JSON. So the shape is requested via prompt
// instruction only, and validated at runtime below; nothing unvalidated is ever returned.
export function parseGeneratedItems(modelResponse: unknown): { name: string }[] | null {
  let parsed: unknown = modelResponse;
  if (typeof parsed === "string") {
    // Workers AI appears to auto-parse a valid JSON completion into an object already (observed
    // in manual testing), but strip markdown code fences and parse defensively in case a given
    // response comes back as a string instead.
    const stripped = parsed
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "");
    try {
      parsed = JSON.parse(stripped);
    } catch {
      return null;
    }
  }
  if (parsed === null || typeof parsed !== "object") {
    return null;
  }
  const items = (parsed as Record<string, unknown>).items;
  if (!Array.isArray(items)) {
    return null;
  }
  const result: { name: string }[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object") {
      return null;
    }
    const name = (item as Record<string, unknown>).name;
    if (typeof name !== "string") {
      return null;
    }
    result.push({ name });
  }
  return result;
}

// R2 doesn't expose a chunked base64 encoder, and spreading a whole (up to 10MB) image into
// String.fromCharCode(...bytes) risks blowing the call-stack argument limit — encode in chunks.
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export async function generateMenuItemsFromImage(
  ai: Ai,
  bytes: Uint8Array,
  contentType: string,
  restaurantId: number,
): Promise<Result<{ items: { name: string }[] }, 500>> {
  const imageDataUrl = `data:${contentType};base64,${bytesToBase64(bytes)}`;

  let modelResponse: unknown;
  try {
    const result = await ai.run(GENERATE_MENU_MODEL, {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: GENERATE_MENU_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      max_tokens: GENERATE_MENU_MAX_TOKENS,
    });
    modelResponse = (result as { response?: unknown }).response;
  } catch (e) {
    console.error(
      JSON.stringify({ message: "menu generation model call failed", error: String(e) }),
    );
    return fail(ERROR_MESSAGES.internal, 500);
  }

  const items = parseGeneratedItems(modelResponse);
  if (!items) {
    console.error(
      JSON.stringify({
        message: "menu generation model returned an unexpected shape",
        restaurantId,
      }),
    );
    return fail(ERROR_MESSAGES.internal, 500);
  }

  return ok({ items });
}
