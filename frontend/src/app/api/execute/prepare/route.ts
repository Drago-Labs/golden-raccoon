import { NextResponse } from "next/server";
import { z } from "zod";
import { encodeFunctionData, erc20Abi } from "viem";
import { withCacheHeaders } from "@/server/cache/strategy";
import { buildExecutionPreviewFromPortfolio } from "@/server/agents/execution";
import { getPortfolioSnapshot } from "@/server/portfolio/getPortfolio";
import { assertApprovalOnly } from "@/server/security/policy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getUserRuleRecord } from "@/server/storage";
import { getScanNetwork } from "@/lib/scanNetworks";
import { getChainFamily, isStellarAccountAddress } from "@/lib/chainIdentity";
import { stellarNetworks, type StellarNetworkId } from "@/lib/stellar/config";
import type { EvmTransactionPayload, StellarTransactionPayload } from "@/server/types";

const bodySchema = z.object({
  walletAddress: z.string().optional(),
  chainFamily: z.enum(["evm", "stellar"]).optional(),
  action: z.string().optional(),
  decisionId: z.string().optional(),
  fromToken: z.string().optional(),
  toToken: z.string().optional(),
  fromTokenAddress: z.string().optional(),
  toTokenAddress: z.string().optional(),
  exchangeAddress: z.string().optional(),
  percent: z.number().min(0).max(100).optional(),
  riskScore: z.number().min(0).max(100).optional(),
  estimatedValueUsd: z.number().min(0).optional(),
  network: z.string().optional(),
  slippageBps: z.number().min(0).max(10_000).optional(),
  priceImpactBps: z.number().min(0).optional(),
  gasEstimateUsd: z.number().min(0).optional(),
  quoteAvailable: z.boolean().optional(),
  expectedOutputAmount: z.number().min(0).optional(),
  simulationStatus: z.enum(["not_required", "pending", "passed", "failed", "unavailable"]).optional(),
  simulationRevertReason: z.string().optional(),
});

/**
 * Build a discriminated EvmTransactionPayload from the approved quote and simulation data.
 */
function buildEvmPayload(input: z.infer<typeof bodySchema>, walletAddress: string): EvmTransactionPayload {
  const chainId = input.network === "base" ? 8453 : input.network === "goat" ? 48816 : 8453;
  const fromTokenAddress = (input.fromTokenAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const toTokenAddress = (input.toTokenAddress ?? "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") as `0x${string}`;
  const exchangeAddress = (input.exchangeAddress ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;
  const from = walletAddress as `0x${string}`;

  // Build calldata for a token swap via DEX aggregator
  // This is a simplified example — real deployment would use the actual DEX/router address + calldata
  const amount = input.estimatedValueUsd ? BigInt(Math.floor(input.estimatedValueUsd * 1e6)) : BigInt(0);
  const minOutputAmount = input.expectedOutputAmount
    ? BigInt(Math.floor(input.expectedOutputAmount * (1 - (input.slippageBps ?? 100) / 10_000)))
    : BigInt(0);

  let data: `0x${string}`;
  let value: `0x${string}` | undefined;

  if (fromTokenAddress.startsWith("0x0000000000000000000000000000000000000000")) {
    // Native token (ETH/GOAT) — wrap + swap
    data = encodeFunctionData({
      abi: [
        {
          type: "function",
          name: "swap",
          inputs: [
            { name: "tokenIn", type: "address" },
            { name: "tokenOut", type: "address" },
            { name: "amountIn", type: "uint256" },
            { name: "amountOutMin", type: "uint256" },
            { name: "to", type: "address" },
          ],
          outputs: [],
          stateMutability: "payable",
        },
      ],
      functionName: "swap",
      args: [fromTokenAddress, toTokenAddress, amount, minOutputAmount, from],
    });
    value = `0x${amount.toString(16)}` as `0x${string}`;
  } else {
    // ERC-20 token — approve + swap via router
    data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [exchangeAddress, amount],
    });
  }

  return {
    chainFamily: "evm",
    chainId,
    chainName: input.network ?? "Unknown",
    txRequest: {
      from,
      to: exchangeAddress,
      data,
      value,
    },
    fromToken: input.fromToken ?? "TOKEN",
    toToken: input.toToken ?? "USDC",
    amount: (input.estimatedValueUsd ?? 0).toFixed(2),
    estimatedValueUsd: input.estimatedValueUsd ?? 0,
    expectedOutputAmount: input.expectedOutputAmount?.toFixed(6),
    slippageBps: input.slippageBps ?? 100,
    gasEstimateUsd: input.gasEstimateUsd ?? 3.5,
    minOutputAmount: input.expectedOutputAmount
      ? (input.expectedOutputAmount * (1 - (input.slippageBps ?? 100) / 10_000)).toFixed(6)
      : undefined,
  };
}

/**
 * Build a discriminated StellarTransactionPayload.
 * In production the unsigned XDR would come from simulating the Soroban or classic operations.
 */
function buildStellarPayload(input: z.infer<typeof bodySchema>, walletAddress: string): StellarTransactionPayload {
  const stellarNetwork = input.network === "stellar-pubnet" ? stellarNetworks["stellar-pubnet"] : stellarNetworks["stellar-testnet"];

  // In production this XDR is built server-side from the quote + Soroban simulation
  const placeholderXdr =
    "AAAAAgAAAADg3fr3qBg1Po1GH3N4qLGgaVcC+QNFHrNcHj7gTIAuNwAAAGQAAAAAAAAAAQAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAA" +
    "AAAAAQAAAADg3fr3qBg1Po1GH3N4qLGgaVcC+QNFHrNcHj7gTIAuNwAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  return {
    chainFamily: "stellar",
    network: stellarNetwork.id,
    networkPassphrase: stellarNetwork.networkPassphrase,
    sourceAccount: walletAddress,
    transactionXdr: placeholderXdr,
    operations: [
      {
        type: "transfer",
        asset: input.fromToken ?? "XLM",
        amount: (input.estimatedValueUsd ?? 0).toFixed(2),
        destination: input.toTokenAddress ?? "Stellar DEX",
      },
    ],
    fromAsset: input.fromToken ?? "XLM",
    toAsset: input.toToken ?? "USDC",
    amount: (input.estimatedValueUsd ?? 0).toFixed(2),
    estimatedValueUsd: input.estimatedValueUsd ?? 0,
    expectedOutputAmount: input.expectedOutputAmount?.toFixed(7),
    slippageBps: input.slippageBps ?? 100,
    resourceFee: (100_000 + (input.estimatedValueUsd ?? 0) * 100).toFixed(0),
    minOutputAmount: input.expectedOutputAmount
      ? (input.expectedOutputAmount * (1 - (input.slippageBps ?? 100) / 10_000)).toFixed(7)
      : undefined,
  };
}

export async function POST(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "execute:prepare", limit: 20, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    assertApprovalOnly({ autoExecute: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Execution policy failed" }, { status: 403 });
  }

  const { portfolio } = await getPortfolioSnapshot(parsed.data.walletAddress);
  const rules = getUserRuleRecord(parsed.data.walletAddress ?? portfolio.walletAddress);
  const walletAddress = parsed.data.walletAddress ?? portfolio.walletAddress;
  const preview = buildExecutionPreviewFromPortfolio(portfolio, { ...parsed.data, rules });

  // Determine chain family: from explicit param, network config, or wallet address format
  const chainFamily = parsed.data.chainFamily
    ?? getChainFamily(parsed.data.network)
    ?? (walletAddress && isStellarAccountAddress(walletAddress) ? "stellar" : "evm");

  if (preview.requiresApproval) {
    if (chainFamily === "evm") {
      preview.payload = buildEvmPayload(parsed.data, walletAddress);
    } else {
      preview.payload = buildStellarPayload(parsed.data, walletAddress);
    }
    preview.chainFamily = chainFamily;
  }

  return withCacheHeaders(NextResponse.json(preview), "execution");
}
