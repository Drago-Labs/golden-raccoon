import { NextResponse } from "next/server";
import { withCacheHeaders } from "@/server/cache/strategy";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getRecoveryList, getRecoveryStateSummary } from "@/server/recovery";
import { validateWalletAddressForChain } from "@/server/security/inputValidation";
import { getChainFamily } from "@/lib/chainIdentity";
import { isStellarAccountAddress } from "@/lib/chainIdentity";

function defaultChainForWallet(wallet: string): "evm" | "stellar" {
  return isStellarAccountAddress(wallet) ? "stellar" : "evm";
}

export async function GET(request: Request) {
  const rateLimited = checkRateLimit(request, { namespace: "recovery:list", limit: 30, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const params = new URL(request.url).searchParams;
  const walletAddress = params.get("wallet") ?? params.get("walletAddress") ?? undefined;
  const chainId = params.get("chainId") ?? undefined;
  const inferredFamily = chainId ? getChainFamily(chainId) : undefined;

  if (walletAddress && inferredFamily === "evm" && !validateWalletAddressForChain(walletAddress, "evm")) {
    return NextResponse.json({ error: "invalid_wallet_format", expected: "evm 0x-address" }, { status: 400 });
  }

  if (walletAddress && inferredFamily === "stellar" && !validateWalletAddressForChain(walletAddress, "stellar")) {
    return NextResponse.json({ error: "invalid_wallet_format", expected: "stellar G-address" }, { status: 400 });
  }

  if (walletAddress && !inferredFamily && !validateWalletAddressForChain(walletAddress, defaultChainForWallet(walletAddress))) {
    return NextResponse.json({ error: "invalid_wallet_format", expected: "evm 0x-address or stellar G-address" }, { status: 400 });
  }

  const list = getRecoveryList(walletAddress);
  const summary = getRecoveryStateSummary(walletAddress);

  return withCacheHeaders(NextResponse.json({ ...list, summary }), "recovery");
}
