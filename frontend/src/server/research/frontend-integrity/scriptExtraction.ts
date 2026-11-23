import { sha256Text } from "./hashing";
import { FRONTEND_INTEGRITY_LIMITS } from "./limits";
import type { ScriptRecord } from "./schema";

function attr(source: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(source);
  return match ? match[1] : null;
}

export function originOf(src: string | null, pageOrigin: string): string {
  if (!src || src.startsWith("/") || src.startsWith("./") || !src.includes("://")) return pageOrigin;
  try {
    return new URL(src).origin;
  } catch {
    return "invalid";
  }
}

/** Pulls script tags out of HTML text. The body is hashed and never evaluated. */
export function extractScripts(html: string, pageOrigin: string): ScriptRecord[] {
  const scripts: ScriptRecord[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    if (scripts.length >= FRONTEND_INTEGRITY_LIMITS.maxScripts) break;
    const attrs = match[1] ?? "";
    const body = match[2] ?? "";
    const src = attr(attrs, "src");
    const integrity = attr(attrs, "integrity");
    scripts.push({
      src,
      inline: src === null,
      sha256: sha256Text(src ?? body),
      integrity,
      origin: originOf(src, pageOrigin),
      executed: false,
    });
  }
  return scripts;
}
