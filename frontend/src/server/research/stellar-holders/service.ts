/**
 * Assemble one read-only holder distribution for a single issued asset.
 *
 * The reader is an argument. This module does not open a network connection
 * itself, and it does not remember an earlier asset: every call resolves
 * `network|CODE|ISSUER` again and asks the reader with that identity.
 */
import { parseAssetIdentity } from "./assetIdentity";
import { computeConcentration, exactRatio, formatBaseUnits, parseBaseUnits } from "./concentration";
import { buildHolderCoverage, unavailableCoverage } from "./coverage";
import { HolderDistributionError } from "./errors";
import { classifyIssuerAdjacency } from "./issuerAdjacency";
import { pageHolderTrustlines } from "./holderReader";
import { HOLDER_LIMITS } from "./limits";
import { resolveNetworkIdentity } from "./networkIdentity";
import {
  HOLDER_SCHEMA_VERSION,
  holderDistributionRequestSchema,
  type CanonicalAsset,
  type ConcentrationReport,
  type HolderDistributionReader,
  type HolderDistributionReport,
  type HolderRow,
} from "./schema";
import { buildSupplyBuckets } from "./supplyBuckets";
import type { Concentration } from "./concentration";

export async function measureHolderDistribution(input: unknown, reader: HolderDistributionReader): Promise<HolderDistributionReport> {
  const parsed = holderDistributionRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new HolderDistributionError("invalid_request", "The holder distribution request could not be read.", parsed.error.flatten());
  }

  const network = resolveNetworkIdentity(parsed.data.network);

  if (!network) {
    throw new HolderDistributionError("unsupported_network", "The network is not a Stellar testnet or pubnet.");
  }

  const identity = parseAssetIdentity(parsed.data.asset, network.id);

  if (!identity.ok) {
    throw new HolderDistributionError("invalid_asset", identity.message);
  }

  const asset = identity.asset;
  const pageSize = parsed.data.pageSize ?? HOLDER_LIMITS.pageSizeDefault;
  const maxPages = parsed.data.maxPages ?? HOLDER_LIMITS.maxPages;
  const topN = parsed.data.topN ?? HOLDER_LIMITS.defaultTopN;
  const topNs = [...new Set<number>([...HOLDER_LIMITS.topNs, topN])].sort((left, right) => left - right);

  try {
    const snapshot = await reader.readSupply(asset);
    const paged = await pageHolderTrustlines(
      (cursor, limit) => reader.readTrustlinePage(asset, cursor, limit),
      { pageSize, maxPages, maxHolders: HOLDER_LIMITS.maxHolders },
    );
    const pools = await reader.readLiquidityPools(asset);
    const claimables = await reader.readClaimableBalances(asset);
    const distribution = await reader.readDistributionAccounts(asset);
    const classified = classifyIssuerAdjacency(paged.holders, asset.issuer, distribution.accounts).flatMap((holder) => {
      const baseUnits = parseBaseUnits(holder.balance);

      if (baseUnits <= 0n) return [];

      return [{ ...holder, balance: formatBaseUnits(baseUnits), baseUnits }];
    });
    const buckets = buildSupplyBuckets({
      holderBalances: classified.map((holder) => holder.balance),
      pools: pools.records,
      claimables: claimables.records,
      issued: snapshot.issued,
      contracts: snapshot.contracts,
    });
    const accounts = computeConcentration(classified.map((holder) => holder.baseUnits), topNs);
    const publicFloat = computeConcentration(
      classified.filter((holder) => holder.role === "public").map((holder) => holder.baseUnits),
      topNs,
    );
    const truncated = paged.truncated || pools.truncated || claimables.truncated;
    const coverage = buildHolderCoverage({
      coveredBaseUnits: buckets.observedBaseUnits,
      issuedAmount: snapshot.issued,
      truncated,
      duplicateCursor: paged.duplicateCursor,
      holdersSeen: classified.length,
      pagesRead: paged.pagesRead,
      ledger: snapshot.ledger,
      tomlRead: distribution.tomlRead,
      contractsBaseUnits: buckets.contractsBaseUnits,
    });
    const holders = [...classified]
      .sort((left, right) => {
        if (left.baseUnits === right.baseUnits) return left.accountId < right.accountId ? -1 : 1;

        return left.baseUnits > right.baseUnits ? -1 : 1;
      })
      .map((holder) => toRow(holder, accounts.totalBaseUnits, publicFloat.totalBaseUnits));

    return {
      schemaVersion: HOLDER_SCHEMA_VERSION,
      state: coverage.state,
      readOnly: true,
      network: asset.network,
      asset,
      ledger: snapshot.ledger,
      ledgerClosedAt: snapshot.ledgerClosedAt,
      holders,
      supply: {
        issued: formatBaseUnits(buckets.issuedBaseUnits),
        issuedBaseUnits: buckets.issuedBaseUnits.toString(),
        contracts: formatBaseUnits(buckets.contractsBaseUnits),
        contractsBaseUnits: buckets.contractsBaseUnits.toString(),
        buckets: buckets.buckets,
        pools: buckets.pools,
        claimables: buckets.claimables,
        snapshot: {
          authorized: snapshot.authorized,
          authorizedToMaintainLiabilities: snapshot.authorizedToMaintainLiabilities,
          unauthorized: snapshot.unauthorized,
          liquidityPools: snapshot.liquidityPools,
          claimableBalances: snapshot.claimableBalances,
          contracts: snapshot.contracts,
        },
      },
      concentration: {
        accounts: toConcentration(accounts),
        publicFloat: toConcentration(publicFloat),
      },
      issuerAdjacency: {
        issuer: asset.issuer,
        distributionAccounts: distribution.accounts,
        tomlRead: distribution.tomlRead,
      },
      coverage,
      error: null,
    };
  } catch (error) {
    if (error instanceof HolderDistributionError && error.code !== "provider_unavailable") throw error;

    const message = error instanceof Error ? error.message : "The holder data could not be read.";

    return unavailableReport(asset, message);
  }
}

function toRow(
  holder: { accountId: string; balance: string; baseUnits: bigint; role: HolderRow["role"] },
  accountTotal: bigint,
  publicTotal: bigint,
): HolderRow {
  return {
    accountId: holder.accountId,
    balance: holder.balance,
    baseUnits: holder.baseUnits.toString(),
    role: holder.role,
    shareOfAccounts: exactRatio(holder.baseUnits, accountTotal),
    shareOfPublicFloat: holder.role === "public" ? exactRatio(holder.baseUnits, publicTotal) : null,
  };
}

function toConcentration(concentration: Concentration): ConcentrationReport {
  return {
    defined: concentration.defined,
    holderCount: concentration.holderCount,
    totalBaseUnits: concentration.totalBaseUnits.toString(),
    total: formatBaseUnits(concentration.totalBaseUnits),
    topShares: concentration.topShares.map((share) => ({
      n: share.n,
      share: share.share,
      baseUnits: share.baseUnits.toString(),
      amount: formatBaseUnits(share.baseUnits),
    })),
    gini: concentration.gini,
    herfindahl: concentration.herfindahl,
  };
}

function unavailableReport(asset: CanonicalAsset, message: string): HolderDistributionReport {
  return {
    schemaVersion: HOLDER_SCHEMA_VERSION,
    state: "unavailable",
    readOnly: true,
    network: asset.network,
    asset,
    ledger: null,
    ledgerClosedAt: null,
    holders: [],
    supply: null,
    concentration: null,
    issuerAdjacency: null,
    coverage: unavailableCoverage(message),
    error: { code: "provider_unavailable", message },
  };
}
