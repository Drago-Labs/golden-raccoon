import type { PendingChange } from "@/server/stellar/governance";

export const sampleItems: PendingChange[] = [
  {
    id: "1",
    targetContract: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M",
    functionSelector: "set_admin",
    payloadHash: "aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    proposer: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
    createdAt: 1_700_000_000,
    effectiveAt: 1_700_086_400,
    delaySecs: 86_400,
    signersCount: 2,
    threshold: 2,
    sourceLedger: 100,
    cancelled: false,
  },
];

export function queueAdapter(retval: unknown, latestLedger = 120) {
  return {
    async simulateGetPendingQueue() {
      return { retval, latestLedger };
    },
  };
}

export function failingAdapter() {
  return {
    async simulateGetPendingQueue() {
      throw new Error("RPC unavailable");
    },
  };
}
