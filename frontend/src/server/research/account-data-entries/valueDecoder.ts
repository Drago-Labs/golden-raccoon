export type DecodedDataValue = {
  base64: string;
  byteLength: number;
  hex: string;
  utf8: string | null;
  text: boolean;
};

function isPrintableText(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 && char !== "\n" && char !== "\r" && char !== "\t") return false;
  }
  return true;
}

/** Decode a Horizon base64 data value. Invalid UTF-8 stays null so it is never shown as text. */
export function decodeDataValue(base64: string): DecodedDataValue {
  const bytes = Buffer.from(base64, "base64");
  const hex = Buffer.from(bytes).toString("hex");
  let utf8: string | null = null;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    utf8 = isPrintableText(decoded) ? decoded : null;
  } catch {
    utf8 = null;
  }
  return { base64, byteLength: bytes.length, hex, utf8, text: utf8 !== null };
}
