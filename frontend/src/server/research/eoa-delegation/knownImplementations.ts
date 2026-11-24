const KNOWN: Record<string, string> = {
  "0x0000000000000000000000000000000000007702": "Reference smart account",
};
export function knownImplementation(address: string): string | null { return KNOWN[address.toLowerCase()] ?? null; }
