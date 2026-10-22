import { getContractAddress } from "viem";
import type { DeployerRpc, RpcBlock, RpcTransaction } from "@/server/research/deployer-history/deployerLookup";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const wallet = "0x9999999999999999999999999999999999999999";

/** Deterministically derives the CREATE address for (deployer, nonce), for use in fixtures. */
export function createAddress(deployer: string, nonce: number): string {
  return getContractAddress({ from: deployer as `0x${string}`, nonce: BigInt(nonce) });
}

export type RawTx = { hash: string; from: string; to: string | null; nonce: number; value?: string };

export type RecordedFixture = {
  latestBlock: string;
  /** Lowercase address -> decimal block string at/after which it has code. */
  codeFromBlock: Record<string, string>;
  /** Decimal block number string -> that block's transactions. */
  blocks: Record<string, RawTx[]>;
};

export function recordedDeployerRpc(fixture: RecordedFixture): DeployerRpc {
  return {
    async blockNumber() {
      return BigInt(fixture.latestBlock);
    },
    async getCode(address, block) {
      const threshold = fixture.codeFromBlock[address.toLowerCase()];
      if (threshold === undefined) return "0x";
      return block >= BigInt(threshold) ? "0x1234" : "0x";
    },
    async getBlock(block): Promise<RpcBlock | null> {
      const txs = fixture.blocks[block.toString()];
      if (txs === undefined) return { number: Number(block), transactions: [] };
      const transactions: RpcTransaction[] = txs.map((tx) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        nonce: tx.nonce,
        value: tx.value ?? "0x0",
      }));
      return { number: Number(block), transactions };
    },
  };
}
