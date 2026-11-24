export type ClmmNetwork = "ethereum" | "base" | "arbitrum";

export type ClmmDeployment = {
  network: ClmmNetwork;
  label: string;
  npmAddress: string;
  factoryAddress: string;
  quoterNote: string;
};

const DEPLOYMENTS: Record<ClmmNetwork, ClmmDeployment> = {
  ethereum: {
    network: "ethereum",
    label: "Uniswap v3 Ethereum",
    npmAddress: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoterNote: "NonfungiblePositionManager positions are decoded against Uniswap v3 pool state.",
  },
  base: {
    network: "base",
    label: "Uniswap v3 Base",
    npmAddress: "0x03a520b32C28B3Ef35c21Db4cF6B39E4c1F8B8C0",
    factoryAddress: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    quoterNote: "NonfungiblePositionManager positions are decoded against Uniswap v3 pool state.",
  },
  arbitrum: {
    network: "arbitrum",
    label: "Uniswap v3 Arbitrum",
    npmAddress: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
    factoryAddress: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    quoterNote: "NonfungiblePositionManager positions are decoded against Uniswap v3 pool state.",
  },
};

export function listDeployments(): ClmmDeployment[] {
  return Object.values(DEPLOYMENTS);
}

export function deploymentFor(network: string): ClmmDeployment | null {
  return DEPLOYMENTS[network as ClmmNetwork] ?? null;
}
