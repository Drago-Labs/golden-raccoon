export type KnownFunctionSig = {
  selector: string;
  name: string;
  paramTypes: Array<"address" | "uint256" | "bytes32">;
};

const KNOWN_SIGS: Record<string, KnownFunctionSig> = {
  "0xa9059cbb": { selector: "0xa9059cbb", name: "transfer", paramTypes: ["address", "uint256"] },
  "0x095ea7b3": { selector: "0x095ea7b3", name: "approve", paramTypes: ["address", "uint256"] },
  "0xe177246e": { selector: "0xe177246e", name: "updateDelay", paramTypes: ["uint256"] },
  "0x2f2ff15d": { selector: "0x2f2ff15d", name: "grantRole", paramTypes: ["bytes32", "address"] },
};

export function lookupFunctionSig(selector: string): KnownFunctionSig | null {
  return KNOWN_SIGS[selector.toLowerCase()] ?? null;
}
