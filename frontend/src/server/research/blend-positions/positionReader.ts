import type { BlendNetwork } from "./networkIdentity";
import type { RawAccountPositions } from "./schema";

export interface PositionProvider {
  readAccountPositions(input: {
    poolId: string;
    accountId: string;
    network: BlendNetwork;
  }): Promise<RawAccountPositions>;
}

export function createDefaultPositionReader(): PositionProvider {
  return {
    async readAccountPositions({ poolId, accountId }) {
      return { poolId, accountId, ledger: 0, entries: [] };
    },
  };
}
