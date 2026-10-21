import { Networks } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { parseAssetIdentity } from "@/server/research/stellar-holders/assetIdentity";
import { HolderDistributionError } from "@/server/research/stellar-holders/errors";
import { createHorizonHolderReader } from "@/server/research/stellar-holders/holderReader";
import { HOLDER_LIMITS } from "@/server/research/stellar-holders/limits";
import { resolveNetworkIdentity } from "@/server/research/stellar-holders/networkIdentity";
import { holderDistributionRequestSchema } from "@/server/research/stellar-holders/schema";
import { measureHolderDistribution } from "@/server/research/stellar-holders/service";
import { getStellarDataApiUrls, getStellarNetwork } from "@/lib/stellar/config";
import { ISSUER_A, ISSUER_B, PUB_A, PUB_B } from "./fixtures";

describe("network identity", () => {
  it("maps network aliases onto one passphrase and keeps pubnet distinct", () => {
    const alias = resolveNetworkIdentity("testnet");
    const canonical = resolveNetworkIdentity("stellar-testnet");
    const pubnet = resolveNetworkIdentity("pubnet");

    expect(alias?.id).toBe("stellar-testnet");
    expect(canonical?.id).toBe("stellar-testnet");
    expect(alias?.passphrase).toBe(canonical?.passphrase);
    expect(alias?.passphrase).toBe(Networks.TESTNET);
    expect(pubnet?.id).toBe("stellar-pubnet");
    expect(pubnet?.passphrase).toBe(Networks.PUBLIC);
    expect(pubnet?.passphrase).not.toBe(alias?.passphrase);
    expect(alias?.horizonUrls[0]).not.toBe(pubnet?.horizonUrls[0]);
  });

  it("rejects a network this feature does not read", () => {
    expect(resolveNetworkIdentity("ethereum")).toBeNull();
  });
});

describe("asset identity", () => {
  it("keeps the same code with two issuers on two result keys", () => {
    const first = parseAssetIdentity(`USDC:${ISSUER_A}`, "stellar-testnet");
    const second = parseAssetIdentity(`USDC:${ISSUER_B}`, "stellar-testnet");

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    expect(first.asset.code).toBe("USDC");
    expect(second.asset.code).toBe("USDC");
    expect(first.asset.resultKey).not.toBe(second.asset.resultKey);
    expect(first.asset.resultKey).toBe(`stellar-testnet|USDC|${ISSUER_A}`);
    expect(second.asset.resultKey).toBe(`stellar-testnet|USDC|${ISSUER_B}`);
  });

  it("treats network aliases as the same asset and a different network as a different asset", () => {
    const testnet = parseAssetIdentity(`USDC:${ISSUER_A}`, resolveNetworkIdentity("testnet")!.id);
    const explicit = parseAssetIdentity(`USDC:${ISSUER_A}`, "stellar-testnet");
    const pubnet = parseAssetIdentity(`USDC:${ISSUER_A}`, "stellar-pubnet");

    expect(testnet.ok && explicit.ok && pubnet.ok).toBe(true);
    if (!testnet.ok || !explicit.ok || !pubnet.ok) return;

    expect(testnet.asset.resultKey).toBe(explicit.asset.resultKey);
    expect(testnet.asset.resultKey).not.toBe(pubnet.asset.resultKey);
  });

  it("preserves asset-code case", () => {
    const lower = parseAssetIdentity(`usd:${ISSUER_A}`, "stellar-testnet");
    const upper = parseAssetIdentity(`USD:${ISSUER_A}`, "stellar-testnet");

    expect(lower.ok && upper.ok).toBe(true);
    if (!lower.ok || !upper.ok) return;

    expect(lower.asset.resultKey).not.toBe(upper.asset.resultKey);
  });

  it("rejects native, malformed, and non-account issuers", () => {
    expect(parseAssetIdentity("XLM", "stellar-testnet").ok).toBe(false);
    expect(parseAssetIdentity(`USDC:${ISSUER_A}:extra`, "stellar-testnet").ok).toBe(false);
    expect(parseAssetIdentity("USDC:NOT-AN-ACCOUNT", "stellar-testnet").ok).toBe(false);
  });
});

describe("request schema and errors", () => {
  it("accepts a bounded request and rejects an unbounded one", () => {
    expect(holderDistributionRequestSchema.safeParse({ asset: `USDC:${ISSUER_A}`, network: "stellar-testnet" }).success).toBe(true);
    expect(holderDistributionRequestSchema.safeParse({ asset: `USDC:${ISSUER_A}`, network: "stellar-testnet", topN: 0 }).success).toBe(false);
    expect(holderDistributionRequestSchema.safeParse({ asset: `USDC:${ISSUER_A}`, network: "stellar-testnet", maxPages: HOLDER_LIMITS.maxPages + 1 }).success).toBe(false);
    expect(HOLDER_LIMITS.amountScale).toBe(10_000_000n);
  });

  it("carries a typed error code", () => {
    const error = new HolderDistributionError("invalid_asset", "Issued assets use canonical CODE:ISSUER.");

    expect(error.name).toBe("HolderDistributionError");
    expect(error.code).toBe("invalid_asset");
  });
});

describe("measured results do not cross identities", () => {
  it("does not reuse a report for the same code and a different issuer", async () => {
    const calls: string[] = [];
    const reader = scriptedReader({
      [`stellar-testnet|TWIN|${ISSUER_A}`]: { balance: "70.0000000", accountId: PUB_A, ledger: 1 },
      [`stellar-testnet|TWIN|${ISSUER_B}`]: { balance: "1.0000000", accountId: PUB_B, ledger: 2 },
    }, calls);

    const first = await measureHolderDistribution({ asset: `TWIN:${ISSUER_A}`, network: "stellar-testnet" }, reader);
    const second = await measureHolderDistribution({ asset: `TWIN:${ISSUER_B}`, network: "stellar-testnet" }, reader);

    expect(calls).toEqual([`stellar-testnet|TWIN|${ISSUER_A}`, `stellar-testnet|TWIN|${ISSUER_B}`]);
    expect(first.asset?.resultKey).not.toBe(second.asset?.resultKey);
    expect(first.holders.map((holder) => holder.accountId)).toEqual([PUB_A]);
    expect(second.holders.map((holder) => holder.accountId)).toEqual([PUB_B]);
    expect(first.supply?.issuedBaseUnits).not.toBe(second.supply?.issuedBaseUnits);
    expect(first.ledger).not.toBe(second.ledger);
  });

  it("does not reuse a report for the same asset on another network", async () => {
    const calls: string[] = [];
    const reader = scriptedReader({
      [`stellar-testnet|TWIN|${ISSUER_A}`]: { balance: "4.0000000", accountId: PUB_A, ledger: 10 },
      [`stellar-pubnet|TWIN|${ISSUER_A}`]: { balance: "9.0000000", accountId: PUB_B, ledger: 20 },
    }, calls);

    const testnet = await measureHolderDistribution({ asset: `TWIN:${ISSUER_A}`, network: "testnet" }, reader);
    const pubnet = await measureHolderDistribution({ asset: `TWIN:${ISSUER_A}`, network: "stellar-pubnet" }, reader);

    expect(testnet.asset?.resultKey).toBe(`stellar-testnet|TWIN|${ISSUER_A}`);
    expect(pubnet.asset?.resultKey).toBe(`stellar-pubnet|TWIN|${ISSUER_A}`);
    expect(testnet.holders[0]?.balance).toBe("4.0000000");
    expect(pubnet.holders[0]?.balance).toBe("9.0000000");
    expect(calls).toHaveLength(2);
  });
});

describe("Horizon reads keep code, issuer, and network together", () => {
  it("requests the matching network host and ignores a balance for a different issuer", async () => {
    const urls: string[] = [];
    const testnet = getStellarNetwork("stellar-testnet");
    const pubnet = getStellarNetwork("stellar-pubnet");

    expect(testnet && pubnet).toBeTruthy();
    if (!testnet || !pubnet) return;

    const testnetHost = new URL(getStellarDataApiUrls(testnet)[0]).host;
    const pubnetHost = new URL(getStellarDataApiUrls(pubnet)[0]).host;

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      urls.push(url);

      if (url.includes("/ledgers")) {
        return json({ _embedded: { records: [{ sequence: 77, closed_at: "2026-04-01T00:00:00Z" }] } });
      }

      if (url.includes("/assets?")) {
        return json({
          _embedded: {
            records: [{
              asset_code: "USDC",
              asset_issuer: ISSUER_A,
              amount: "2.0000000",
              balances: { authorized: "2.0000000", authorized_to_maintain_liabilities: "0.0000000", unauthorized: "0.0000000" },
              liquidity_pools_amount: "0.0000000",
              claimable_balances_amount: "0.0000000",
              contracts_amount: "0.0000000",
              num_accounts: 1,
            }],
          },
        });
      }

      if (url.includes("/accounts?")) {
        return json({
          _embedded: {
            records: [{
              account_id: PUB_A,
              balances: [
                { asset_code: "USDC", asset_issuer: ISSUER_B, balance: "9.0000000" },
                { asset_code: "USDC", asset_issuer: ISSUER_A, balance: "2.0000000" },
              ],
            }],
          },
          _links: {},
        });
      }

      return json({});
    }));

    const reader = createHorizonHolderReader();
    const testnetAsset = parseAssetIdentity(`USDC:${ISSUER_A}`, "stellar-testnet");
    const pubnetAsset = parseAssetIdentity(`USDC:${ISSUER_A}`, "stellar-pubnet");

    expect(testnetAsset.ok && pubnetAsset.ok).toBe(true);
    if (!testnetAsset.ok || !pubnetAsset.ok) return;

    const supply = await reader.readSupply(testnetAsset.asset);
    await reader.readSupply(pubnetAsset.asset);
    const page = await reader.readTrustlinePage(testnetAsset.asset, null, 500);

    expect(supply.ledger).toBe(77);
    expect(page.records).toEqual([{ accountId: PUB_A, balance: "2.0000000" }]);
    expect(urls.some((url) => url.includes(testnetHost) && url.includes(`asset_issuer=${ISSUER_A}`))).toBe(true);
    expect(urls.some((url) => url.includes(pubnetHost) && url.includes(`asset_issuer=${ISSUER_A}`))).toBe(true);
    expect(urls.some((url) => url.includes("/accounts?") && url.includes("limit=200"))).toBe(true);
    expect(urls.some((url) => url.includes("limit=500"))).toBe(false);

    vi.unstubAllGlobals();
  });
});

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function scriptedReader(
  byKey: Record<string, { balance: string; accountId: string; ledger: number }>,
  calls: string[],
) {
  return {
    async readSupply(asset: { resultKey: string; canonical: string }) {
      calls.push(asset.resultKey);
      const row = byKey[asset.resultKey];

      if (!row) throw new Error(`missing ${asset.resultKey}`);

      return {
        ledger: row.ledger,
        ledgerClosedAt: "2026-04-01T00:00:00Z",
        issued: row.balance,
        authorized: row.balance,
        authorizedToMaintainLiabilities: "0.0000000",
        unauthorized: "0.0000000",
        liquidityPools: "0.0000000",
        claimableBalances: "0.0000000",
        contracts: "0.0000000",
        numAccounts: 1,
      };
    },
    async readTrustlinePage(asset: { resultKey: string }) {
      const row = byKey[asset.resultKey];

      return { records: row ? [{ accountId: row.accountId, balance: row.balance }] : [], nextCursor: null };
    },
    async readLiquidityPools() {
      return { records: [], truncated: false };
    },
    async readClaimableBalances() {
      return { records: [], truncated: false };
    },
    async readDistributionAccounts() {
      return { accounts: [], tomlRead: true };
    },
  };
}
