import type { BlendNetwork } from "./networkIdentity";
import type { ReserveConfig } from "./schema";

export interface PoolConfigProvider {
  readPoolReserves(input: { poolId: string; network: BlendNetwork }): Promise<ReserveConfig[]>;
}

export function createDefaultPoolConfigReader(): PoolConfigProvider {
  return {
    async readPoolReserves() {
      return [];
    },
  };
}
