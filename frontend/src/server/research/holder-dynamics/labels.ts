const ZERO = "0x0000000000000000000000000000000000000000";

const KNOWN: Record<string, { label: "pool" | "exchange" | "treasury"; evidence: string }> = {
  "0x0000000000000000000000000000000000000001": { label: "treasury", evidence: "fixture treasury allowlist" },
  "0x0000000000000000000000000000000000000002": { label: "exchange", evidence: "fixture exchange allowlist" },
  "0x0000000000000000000000000000000000000003": { label: "pool", evidence: "fixture pool allowlist" },
};

export function chainKey(network: string, address: string): string {
  return `${network}:${address.toLowerCase()}`;
}

export function labelAddress(address: string, code = false): { label: "contract" | "zero" | "pool" | "exchange" | "treasury" | "unknown"; evidence: string } {
  const normalized = address.toLowerCase();
  if (normalized === ZERO) return { label: "zero", evidence: "zero address" };
  const known = KNOWN[normalized];
  if (known) return known;
  if (code) return { label: "contract", evidence: "bytecode present at snapshot block" };
  return { label: "unknown", evidence: "no classification evidence" };
}

export function shareBps(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number((part * 10_000n) / whole);
}
