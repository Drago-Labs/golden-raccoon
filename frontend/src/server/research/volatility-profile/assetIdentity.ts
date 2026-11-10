export function normalizeAssetSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function isValidAssetSymbol(symbol: string): boolean {
  return /^[A-Z0-9._-]{1,24}$/i.test(symbol.trim());
}
