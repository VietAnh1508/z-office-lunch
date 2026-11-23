import type { Result } from "../../lib/result";

export const GENERATE_MENU_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
export const GENERATE_MENU_MAX_TOKENS = 4096;
export const GENERATE_MENU_PROMPT = "";

export function parseGeneratedItems(_modelResponse: unknown): { name: string }[] | null {
  throw new Error("not implemented");
}

export function bytesToBase64(_bytes: Uint8Array): string {
  throw new Error("not implemented");
}

export async function generateMenuItemsFromImage(
  _ai: Ai,
  _bytes: Uint8Array,
  _contentType: string,
  _restaurantId: number,
): Promise<Result<{ items: { name: string }[] }, 500>> {
  throw new Error("not implemented");
}
