import { StablecoinFlowError } from "./errors";

/**
 * Configured stablecoin deployments. This registry is the only place that says
 * which contract or issuer counts as a given stablecoin on a given chain: the
 * feature reads exactly what is declared here and nothing it discovers itself.
 * Every entry carries the issuer's own published contract list as `sourceUrl`
 * so a reviewer can check an address without reading code.
 */
export type EvmDeployment = {
  kind: "evm";
  chain: string;
  chainId: number;
  /** Token contract whose zero-address Transfer events are mints and burns. */
  address: string;
  decimals: number;
  /** Nominal seconds per block, used to derive a block range for a time window. */
  secondsPerBlock: number;
  explorerTxUrl: string;
  sourceUrl: string;
};

export type StellarDeployment = {
  kind: "stellar";
  chain: "stellar";
  /** Classic asset code and issuing account; payments out of the issuer are issuance. */
  assetCode: string;
  issuer: string;
  decimals: 7;
  explorerTxUrl: string;
  sourceUrl: string;
};

export type Deployment = EvmDeployment | StellarDeployment;

export type StablecoinAsset = {
  id: string;
  symbol: string;
  name: string;
  /** Scale every amount is normalized to: the largest decimals of any deployment, so upscaling is exact. */
  canonicalDecimals: number;
  deployments: Deployment[];
};

function evm(
  chain: string,
  chainId: number,
  address: string,
  decimals: number,
  secondsPerBlock: number,
  explorerTxUrl: string,
  sourceUrl: string,
): EvmDeployment {
  return { kind: "evm", chain, chainId, address: address.toLowerCase(), decimals, secondsPerBlock, explorerTxUrl, sourceUrl };
}

const CIRCLE_USDC = "https://www.circle.com/multi-chain-usdc";
const CIRCLE_EURC = "https://www.circle.com/eurc";
const TETHER_CONTRACTS = "https://tether.to/en/transparency";
const STELLAR_EXPLORER_TX = "https://stellar.expert/explorer/public/tx/";

const ASSETS: StablecoinAsset[] = [
  {
    id: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    canonicalDecimals: 7,
    deployments: [
      evm("ethereum", 1, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6, 12, "https://etherscan.io/tx/", CIRCLE_USDC),
      evm("base", 8453, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6, 2, "https://basescan.org/tx/", CIRCLE_USDC),
      evm("arbitrum", 42161, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 6, 1, "https://arbiscan.io/tx/", CIRCLE_USDC),
      evm("optimism", 10, "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", 6, 2, "https://optimistic.etherscan.io/tx/", CIRCLE_USDC),
      evm("polygon", 137, "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", 6, 2, "https://polygonscan.com/tx/", CIRCLE_USDC),
      evm("avalanche", 43114, "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", 6, 2, "https://snowtrace.io/tx/", CIRCLE_USDC),
      {
        kind: "stellar",
        chain: "stellar",
        assetCode: "USDC",
        issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        decimals: 7,
        explorerTxUrl: STELLAR_EXPLORER_TX,
        sourceUrl: CIRCLE_USDC,
      },
    ],
  },
  {
    id: "eurc",
    symbol: "EURC",
    name: "Euro Coin",
    canonicalDecimals: 7,
    deployments: [
      evm("ethereum", 1, "0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c", 6, 12, "https://etherscan.io/tx/", CIRCLE_EURC),
      evm("base", 8453, "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", 6, 2, "https://basescan.org/tx/", CIRCLE_EURC),
      {
        kind: "stellar",
        chain: "stellar",
        assetCode: "EURC",
        issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
        decimals: 7,
        explorerTxUrl: STELLAR_EXPLORER_TX,
        sourceUrl: CIRCLE_EURC,
      },
    ],
  },
  {
    id: "usdt",
    symbol: "USDT",
    name: "Tether USD",
    canonicalDecimals: 18,
    deployments: [
      evm("ethereum", 1, "0xdAC17F958D2ee523a2206206994597C13D831ec7", 6, 12, "https://etherscan.io/tx/", TETHER_CONTRACTS),
      evm("arbitrum", 42161, "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", 6, 1, "https://arbiscan.io/tx/", TETHER_CONTRACTS),
      evm("polygon", 137, "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", 6, 2, "https://polygonscan.com/tx/", TETHER_CONTRACTS),
      evm("bsc", 56, "0x55d398326f99059fF775485246999027B3197955", 18, 3, "https://bscscan.com/tx/", TETHER_CONTRACTS),
    ],
  },
];

export function listAssets(): Array<{ id: string; symbol: string; name: string; chains: string[] }> {
  return ASSETS.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    chains: asset.deployments.map((deployment) => deployment.chain),
  }));
}

export function findAsset(assetId: string): StablecoinAsset {
  const asset = ASSETS.find((candidate) => candidate.id === assetId.trim().toLowerCase());
  if (!asset) throw new StablecoinFlowError("unknown_asset", `No stablecoin is configured under the id "${assetId}".`);
  return asset;
}

/**
 * The deployments to read. An empty `chains` means every configured chain;
 * naming a chain the asset is not configured on is an error rather than an
 * empty result, so a typo never looks like "no flows".
 */
export function selectDeployments(asset: StablecoinAsset, chains: string[]): Deployment[] {
  if (!chains.length) return [...asset.deployments];
  const wanted = chains.map((chain) => chain.trim().toLowerCase());
  return wanted.map((chain) => {
    const deployment = asset.deployments.find((candidate) => candidate.chain === chain);
    if (!deployment) {
      throw new StablecoinFlowError("unsupported_chain", `${asset.symbol} is not configured on "${chain}".`);
    }
    return deployment;
  });
}

export function deploymentSources(deployments: Deployment[]): Array<{ chain: string; identity: string; sourceUrl: string }> {
  return deployments.map((deployment) => ({
    chain: deployment.chain,
    identity: deployment.kind === "evm" ? deployment.address : `${deployment.assetCode}:${deployment.issuer}`,
    sourceUrl: deployment.sourceUrl,
  }));
}
