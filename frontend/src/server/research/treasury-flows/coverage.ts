import type { TreasuryAddress } from "./treasuryRegistry";
export function buildCoverage(addresses: TreasuryAddress[]) {
  const sources = [...new Set(addresses.map((row) => row.source))];
  return {
    notes: [
      "Balances are the recorded checkpoints, sorted by time. Missing checkpoints are not filled in.",
      "A destination without a published label stays unknown.",
      sources.length ? `Address sources: ${sources.join(", ")}.` : "No treasury address was declared.",
    ],
  };
}
