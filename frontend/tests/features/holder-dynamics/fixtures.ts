import type { SnapshotReader } from "@/server/research/holder-dynamics";

const token = "0x00000000000000000000000000000000000000ff";
export { token };

export function concentratedReader(): SnapshotReader {
  return {
    getDecimals: async () => 18,
    getTotalSupply: async () => 1000n,
    getHolders: async () => [
      { address: "0x0000000000000000000000000000000000000001", balance: 900n },
      { address: "0x00000000000000000000000000000000000000aa", balance: 100n },
    ],
    getTransfers: async () => [
      { from: "0x0000000000000000000000000000000000000000", to: "0x0000000000000000000000000000000000000001", value: 50n, txHash: "0x1", blockNumber: 105 },
    ],
    getBlockHash: async (block) => `0x${block}`,
  };
}

export function truncatedReader(): SnapshotReader {
  const reader = concentratedReader();
  return {
    ...reader,
    getHolders: async () => {
      const rows = await reader.getHolders(110);
      return rows.map((row) => Object.assign(row, { truncated: true }));
    },
  };
}

export function reorgReader(): SnapshotReader {
  return {
    ...concentratedReader(),
    getBlockHash: async () => "reorg",
  };
}

export function missingReader(): SnapshotReader {
  return {
    ...concentratedReader(),
    getHolders: async () => [],
  };
}
