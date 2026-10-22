const GLYPHS: Record<string, string> = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "ⅼ": "l", "０": "0" };
export function findHomoglyphs(value: string) { return [...value].flatMap((character, position) => GLYPHS[character] ? [{ character, resembles: GLYPHS[character], position }] : []); }
export function skeleton(value: string): string { return [...value].map((character) => GLYPHS[character] ?? character).join(""); }
