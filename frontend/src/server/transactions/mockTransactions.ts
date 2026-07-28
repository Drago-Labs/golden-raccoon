import type { TransactionRecord } from "../types";

export function getMockTransactions(): TransactionRecord[] {
  return [
    {
      chainFamily: "evm",
      hash: "0x9f3a8b271c0e5f3a9b2d21c",
      type: "agent_log",
      asset: "MEME",
      valueUsd: 183,
      status: "confirmed",
      network: "GOAT Network",
      createdAt: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
    },
    {
      chainFamily: "evm",
      hash: "0x4c21d8a3a07bd9120ab66e2",
      type: "approval",
      asset: "USDC",
      valueUsd: 0,
      status: "confirmed",
      network: "GOAT Network",
      createdAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    },
    {
      chainFamily: "evm",
      hash: "0x7b14ef930cc128a9d134a77",
      type: "transfer",
      asset: "GOAT",
      valueUsd: 86,
      status: "confirmed",
      network: "GOAT Network",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    },
  ];
}
