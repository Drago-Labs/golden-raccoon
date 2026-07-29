import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import {
  createWatchlistScanRecord,
  deleteWatchlistEntryForWallet,
  getWatchlistEntryForWallet,
  getLatestScanForEntry,
  updateWatchlistEntry,
} from "@/server/storage";
import { runTokenScan } from "@/server/scan/tokenScan";
import { isStellarAccountAddress, isWalletAddressForChain } from "@/lib/chainIdentity";
import type { WatchlistScanStatus } from "@/server/types";

const walletQuerySchema = z.string().min(1);
const rescanBodySchema = z.object({
  action: z.literal("rescan"),
  walletAddress: walletQuerySchema.optional(),
});

function validateWalletAddress(value: string | undefined | null): { ok: true; address: string } | NextResponse {
  if (!value || !value.trim()) {
    return NextResponse.json(
      { error: "missing_wallet", detail: "walletAddress is required to mutate this watchlist entry." },
      { status: 400 },
    );
  }

  const trimmed = value.trim();

  if (!isStellarAccountAddress(trimmed) && !isWalletAddressForChain(trimmed, "ethereum")) {
    return NextResponse.json(
      { error: "invalid_wallet_address", detail: "walletAddress must be a valid EVM or Stellar address." },
      { status: 400 },
    );
  }

  return { ok: true, address: trimmed };
}

function mapScanStatus(dataQualityMode: string | undefined): WatchlistScanStatus {
  switch (dataQualityMode) {
    case "unavailable":
      return "unavailable";
    case "partial":
    case "conflicting":
    case "stale":
      return "stale";
    case "live":
      return "complete";
    default:
      // Unknown modes default to "unavailable" so the UI forces a rescan rather
      // than rendering a misleading green chip on data we don't recognise.
      return "unavailable";
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  // Many proxies/clients refuse DELETE bodies, so accept walletAddress only
  // from a query parameter — keeps the request canonically cacheable.
  const wallet = validateWalletAddress(request.nextUrl.searchParams.get("walletAddress"));

  if (wallet instanceof NextResponse) return wallet;

  const entry = await getWatchlistEntryForWallet(id, wallet.address);

  if (!entry) {
    return NextResponse.json(
      { error: "not_found", detail: "Watchlist entry not found for this wallet." },
      { status: 404 },
    );
  }

  const deleted = await deleteWatchlistEntryForWallet(id, wallet.address);

  if (!deleted) {
    return NextResponse.json(
      { error: "not_found", detail: "Watchlist entry could not be removed." },
      { status: 404 },
    );
  }

  return NextResponse.json({ status: "deleted", id });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:rescan", limit: 10, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const { id } = await props.params;

  const rawBody = await request.json().catch(() => ({}));
  const parsed = rescanBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.flatten() }, { status: 400 });
  }

  // Wallet authority: prefer the body field because the canonical source for
  // mutation is the connected wallet. Enforce that it matches the entry.
  const wallet = validateWalletAddress(parsed.data.walletAddress);

  if (wallet instanceof NextResponse) return wallet;

  const entry = await getWatchlistEntryForWallet(id, wallet.address);

  if (!entry) {
    return NextResponse.json(
      { error: "not_found", detail: "Watchlist entry not found for this wallet." },
      { status: 404 },
    );
  }

  const query = entry.assetType === "stellar_native" ? "XLM" : entry.assetIdentifier;
  const previousScan = await getLatestScanForEntry(entry.id);
  const scanPerformedAt = new Date().toISOString();

  try {
    const scan = await runTokenScan(query, entry.network, entry.walletAddress);
    const scanStatus = mapScanStatus(scan.dataQuality?.mode);
    const scanRecord = await createWatchlistScanRecord({
      watchlistEntryId: entry.id,
      walletAddress: entry.walletAddress,
      chainFamily: entry.chainFamily,
      network: entry.network,
      assetIdentifier: entry.assetIdentifier,
      assetType: entry.assetType,
      query,
      symbol: scan.symbol ?? entry.symbol,
      status: scanStatus,
      verdict: scan.verdict,
      riskScore: scan.overallRiskScore,
      confidence: scan.dataQuality?.reliability,
      summary: scan.summary,
      riskReportId: scan.riskReport?.id,
      dataQualityMode: scan.dataQuality?.mode,
      scanCompleted: true,
      createdAt: scanPerformedAt,
    });

    const previousScanId = previousScan?.id ?? entry.previousScanId;
    const updated = await updateWatchlistEntry(entry.id, {
      latestScanId: scanRecord.id,
      previousScanId,
      latestScanAt: scanRecord.createdAt,
      latestScanStatus: scanStatus,
      latestVerdict: scanRecord.verdict,
      latestRiskScore: scanRecord.riskScore,
      previousVerdict: previousScan?.verdict ?? entry.previousVerdict,
      previousRiskScore: previousScan?.riskScore ?? entry.previousRiskScore,
      previousScanAvailable: Boolean(previousScanId),
    });

    return NextResponse.json({ entry: updated ?? entry, scan, scanRecordId: scanRecord.id });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Rescan failed unexpectedly.";
    const failedRecord = await createWatchlistScanRecord({
      watchlistEntryId: entry.id,
      walletAddress: entry.walletAddress,
      chainFamily: entry.chainFamily,
      network: entry.network,
      assetIdentifier: entry.assetIdentifier,
      assetType: entry.assetType,
      query,
      symbol: entry.symbol,
      status: "failed",
      failureReason: reason,
      scanCompleted: false,
      createdAt: scanPerformedAt,
    });

    const previousReference = previousScan?.id ?? entry.previousScanId;
    const updated = await updateWatchlistEntry(entry.id, {
      latestScanId: failedRecord.id,
      previousScanId: previousReference,
      latestScanStatus: "stale",
      latestScanAt: failedRecord.createdAt,
      // Preserve cached verdict/riskScore from the previous successful scan
      // so the UI continues to surface last-known evidence.
      latestVerdict: previousScan?.verdict ?? entry.latestVerdict,
      latestRiskScore: previousScan?.riskScore ?? entry.latestRiskScore,
      previousVerdict: previousScan?.verdict ?? entry.previousVerdict,
      previousRiskScore: previousScan?.riskScore ?? entry.previousRiskScore,
      previousScanAvailable: Boolean(previousReference),
    });

    return NextResponse.json(
      {
        error: "scan_failed",
        detail: reason,
        entry: updated ?? entry,
        scanRecordId: failedRecord.id,
      },
      { status: 502 },
    );
  }
}
