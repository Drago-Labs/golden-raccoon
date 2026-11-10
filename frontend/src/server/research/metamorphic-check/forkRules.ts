import type { ForkSemantics } from "./schema";

const CANCUN_BLOCKS: Record<string, number> = {
  ethereum: 19_426_587,
  base: 11_188_936,
  arbitrum: 190_301_729,
  optimism: 117_387_812,
  polygon: 54_876_000,
};

export function evaluateForkRules(network: string, inspectedBlock?: number | null): ForkSemantics {
  const key = network.trim().toLowerCase();
  const cancunBlock = CANCUN_BLOCKS[key] ?? null;
  if (cancunBlock === null) {
    return {
      network,
      eip6780Active: false,
      cancunActivationBlock: null,
      postCancunSelfDestructRestricted: false,
    };
  }
  const active = inspectedBlock === undefined || inspectedBlock === null ? true : inspectedBlock >= cancunBlock;
  return {
    network,
    eip6780Active: active,
    cancunActivationBlock: cancunBlock,
    postCancunSelfDestructRestricted: active,
  };
}
