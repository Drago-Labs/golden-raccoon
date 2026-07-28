import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/server/security/rateLimit";
import { getWatchlistEntry, deleteWatchlistEntry, updateWatchlistEntry } from "@/server/storage";
import { runTokenScan } from "@/server/scan/tokenScan";

const rescanBodySchema = z.object({
  action: z.literal("rescan"),
  walletAddress: z.string().min(1).optional(),
});

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const deleted = deleteWatchlistEntry(id);

  if (!deleted) {
    return NextResponse.json({ error: "not_found", detail: "Watchlist entry not found." }, { status: 404 });
  }

  return NextResponse.json({ status: "deleted", id });
}

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const rateLimited = checkRateLimit(request, { namespace: "watchlist:rescan", limit: 10, windowMs: 60_000 });

  if (rateLimited) {
    return rateLimited;
  }

  const { id } = await props.params;
  const entry = getWatchlistEntry(id);

  if (!entry) {
    return NextResponse.json({ error: "not_found", detail: "Watchlist entry not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = rescanBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const walletAddress = parsed.data.walletAddress ?? entry.walletAddress;

  // Build the query from the asset identifier
  const query = entry.assetType === "stellar_native" ? "XLM" : entry.assetIdentifier;

  try {
    const scan = await runTokenScan(query, entry.network, walletAddress);

    // Preserve previous scan data — always store the latest result
    const scanStatus =
      scan.dataQuality?.mode === "unavailable"
        ? "unavailable"
        : scan.dataQuality?.mode === "partial" || scan.dataQuality?.mode === "conflicting" || scan.dataQuality?.mode === "stale"
          ? "stale"
          : "complete";

    const updated = updateWatchlistEntry(id, {
      latestScanAt: scan.scannedAt,
      latestScanStatus: scanStatus,
      latestVerdict: scan.verdict,
      latestRiskScore: scan.overallRiskScore,
      previousScanAvailable: true,
    });

    return NextResponse.json({
      entry: updated ?? entry,
      scan,
    });
  } catch (error) {
    // A failed provider call must leave the prior scan visible and mark it stale
    const staleEntry = updateWatchlistEntry(id, {
      latestScanStatus: "stale",
      previousScanAvailable: Boolean(entry.latestScanAt),
    });

    return NextResponse.json(
      {
        error: "scan_failed",
        detail: error instanceof Error ? error.message : "Rescan failed unexpectedly.",
        entry: staleEntry ?? entry,
      },
      { status: 502 },
    );
  }
}
