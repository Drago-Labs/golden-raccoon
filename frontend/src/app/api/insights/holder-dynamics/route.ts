import { NextResponse } from "next/server";
import { evaluateCapability } from "@/server/security/authz";
import { checkRateLimit } from "@/server/security/rateLimit";
import { resolveWalletSession } from "@/server/security/walletSession";
import { analyzeHolderDynamics, holderDynamicsRequestSchema, type SnapshotReader } from "@/server/research/holder-dynamics";

/** Fixture reader used when no live indexer is configured. */
function fixtureReader(): SnapshotReader {
  return {
    getDecimals: async () => 18,
    getTotalSupply: async () => 1_000_000n * 10n ** 18n,
    getHolders: async () => [
      { address: "0x0000000000000000000000000000000000000001", balance: 600_000n * 10n ** 18n, code: false },
      { address: "0x00000000000000000000000000000000000000aa", balance: 250_000n * 10n ** 18n, code: false },
      { address: "0x00000000000000000000000000000000000000bb", balance: 150_000n * 10n ** 18n, code: true },
    ],
    getTransfers: async () => [
      {
        from: "0x0000000000000000000000000000000000000001",
        to: "0x00000000000000000000000000000000000000aa",
        value: 10_000n * 10n ** 18n,
        txHash: "0xabc",
        blockNumber: 101,
      },
    ],
    getBlockHash: async (block) => `0xblock${block}`,
  };
}

export async function POST(request: Request) {
  const limited = checkRateLimit(request, { namespace: "holder-dynamics:read", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const parsed = holderDynamicsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request", details: parsed.error.flatten() }, { status: 400 });
  const session = resolveWalletSession(request, { suppliedWallet: parsed.data.walletAddress });
  if (session.response) return session.response;
  const access = evaluateCapability(
    { kind: "wallet", walletAddress: session.wallet, walletHash: "holder-dynamics", chainFamily: "evm", network: parsed.data.network },
    "portfolio:read",
    { walletAddress: session.wallet, network: parsed.data.network },
  );
  if (!access.allowed) return NextResponse.json({ error: "auth_error" }, { status: 403 });
  const result = await analyzeHolderDynamics(parsed.data, fixtureReader());
  return NextResponse.json(result, { status: result.state === "unavailable" ? 503 : 200 });
}
