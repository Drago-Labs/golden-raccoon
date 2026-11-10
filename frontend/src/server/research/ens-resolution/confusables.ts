import type { ConfusableFinding } from "./schema";

const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0xfeff]);

function detectScript(cp: number): string {
  if ((cp >= 0x0061 && cp <= 0x007a) || (cp >= 0x0030 && cp <= 0x0039) || cp === 0x002d) return "Latin";
  if (cp >= 0x0400 && cp <= 0x04ff) return "Cyrillic";
  if (cp >= 0x0370 && cp <= 0x03ff) return "Greek";
  return "Other";
}

export function inspectConfusableLabels(name: string): ConfusableFinding {
  const scripts = new Set<string>();
  let zeroWidthCharacters = false;
  const flaggedCharacters: Array<{ char: string; codePointHex: string; script: string }> = [];

  for (const ch of name) {
    if (ch === ".") continue;
    const cp = ch.codePointAt(0)!;
    if (ZERO_WIDTH.has(cp)) {
      zeroWidthCharacters = true;
      flaggedCharacters.push({
        char: ch,
        codePointHex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        script: "ZeroWidth",
      });
      continue;
    }
    const script = detectScript(cp);
    scripts.add(script);
    if (script !== "Latin") {
      flaggedCharacters.push({
        char: ch,
        codePointHex: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        script,
      });
    }
  }

  return {
    label: name,
    mixedScripts: scripts.has("Latin") && scripts.size > 1,
    zeroWidthCharacters,
    flaggedCharacters,
  };
}
