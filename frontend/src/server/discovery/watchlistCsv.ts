export const WATCHLIST_CSV_HEADERS = ["version", "chain", "network", "assetType", "contractAddress", "pairAddress", "symbol", "tokenName", "assetKey", "issuer", "source", "note", "createdAt"] as const;

export function escapeWatchlistCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Escape apostrophes too, making the spreadsheet protection reversible.
  if (/^['=+\-@\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '\"\"')}"`;
}

export function parseWatchlistCsv(input: string, maxRows = 1000): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const endField = () => { row.push(field); field = ""; closed = false; };
  const endRow = () => {
    endField();
    if (row.some(value => value !== "")) rows.push(row);
    row = [];
    if (rows.length > maxRows + 1) throw new Error("Too many CSV rows");
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += ch;
    } else if (ch === ",") endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else if (ch === '"' && field === "" && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw new Error("Malformed CSV quoting");
      field += ch;
    }
  }
  if (quoted) throw new Error("Unterminated CSV quote");
  if (field !== "" || closed || row.length > 0) endRow();
  if (!rows.length) throw new Error("CSV header is required");
  const headers = rows.shift()!.map(header => header.trim());
  const allowed = new Set<string>(WATCHLIST_CSV_HEADERS);
  if (new Set(headers).size !== headers.length || headers.some(h => !allowed.has(h)) || !headers.includes("version") || !headers.includes("chain")) throw new Error("Invalid CSV headers");
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV row ${index + 2} has the wrong column count`);
    return Object.fromEntries(headers.map((header, i) => [header, values[i].replace(/^'(?=['=+\-@\t\r\n])/, "")]));
  });
}
