export function classify(input: { code: boolean; implementation: string | null; beacon: string | null; conflict: boolean }) {
  if (!input.code) return "eoa";
  if (input.conflict) return "conflicting_slots";
  if (input.implementation) return "erc1967_direct";
  if (input.beacon) return "erc1967_beacon";
  return "unsupported_or_non_proxy";
}
