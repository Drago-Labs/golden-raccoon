import { parseWatchlistCsv } from "@/server/discovery/watchlistCsv";
import { NextResponse, NextRequest } from "next/server";
import { resolveWalletSession } from "@/server/security/walletSession";
import { getWatchlistIdentityKey } from "@/server/identity/tokenIdentity";
import { addWatchlistEntriesBulk } from "@/server/storage";
import { WatchlistExportRow, WatchlistImportDryRunResult, WatchlistImportDryRunRowResult } from "@/server/types";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ROWS = 1000;

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get("wallet");
  const isDryRun = url.searchParams.get("dry_run") === "true";
  
  if (!wallet) {
    return NextResponse.json({ error: "wallet is required" }, { status: 400 });
  }

  const session = resolveWalletSession(request, { suppliedWallet: wallet });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let entries: WatchlistExportRow[] = [];

  const contentType = request.headers.get("content-type") || "";
  
  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (contentType.includes("application/json")) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.entries)) {
        return NextResponse.json({ error: "Invalid JSON format. Expected { entries: [] }" }, { status: 400 });
      }
      entries = data.entries;
    } else if (contentType.includes("text/csv")) {
      entries = parseWatchlistCsv(text, MAX_ROWS) as unknown as WatchlistExportRow[];
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
    }
  } catch (e) {
    return NextResponse.json({ error: "Failed to parse input" }, { status: 400 });
  }

  if (entries.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows. Maximum is ${MAX_ROWS}` }, { status: 413 });
  }

  const result: WatchlistImportDryRunResult = {
    validCount: 0,
    duplicateCount: 0,
    collisionCount: 0,
    invalidCount: 0,
    totalRows: entries.length,
    results: [],
  };

  const seenIdentities = new Set<string>();

  const { listWatchlistEntries } = require("@/server/storage");
  const existingEntries = listWatchlistEntries(wallet);
  const existingIdentities = new Set(existingEntries.map((e: any) => e.identityKey));

  for (let i = 0; i < entries.length; i++) {
    const row = entries[i];
    const rowResult: WatchlistImportDryRunRowResult = {
      index: i,
      row,
      status: "valid",
      errors: [],
    };

    if (row.version !== "1.0.0") {
      rowResult.status = "invalid";
      rowResult.errors.push("Unknown or unsupported schema version");
    }

    if (!row.chain) {
      rowResult.status = "invalid";
      rowResult.errors.push("Missing chain");
    }

    if (rowResult.status === "valid") {
       const identityKey = getWatchlistIdentityKey(row);
       rowResult.canonicalIdentityKey = identityKey;
       
       if (seenIdentities.has(identityKey)) {
         rowResult.status = "duplicate";
         rowResult.errors.push("Duplicate identity in import");
       } else if (existingIdentities.has(identityKey)) {
         rowResult.status = "duplicate";
         rowResult.errors.push("Identity already exists in watchlist");
       } else {
         seenIdentities.add(identityKey);
       }
    }

    if (rowResult.status === "valid") {
      result.validCount++;
    } else if (rowResult.status === "invalid") {
      result.invalidCount++;
    } else if (rowResult.status === "duplicate") {
      result.duplicateCount++;
    }
    result.results.push(rowResult);
  }

  if (isDryRun) {
    return NextResponse.json(result);
  }

  if (result.invalidCount > 0) {
     return NextResponse.json({ error: "Cannot apply import with invalid rows", result }, { status: 400 });
  }


  // Apply the valid rows
  const toAdd = [];
  for (const r of result.results) {
    if (r.status === "valid" || r.status === "duplicate") {
       toAdd.push({
         walletAddress: wallet,
         chain: r.row.chain!,
         network: r.row.network,
         assetType: r.row.assetType as any,
         contractAddress: r.row.contractAddress,
         pairAddress: r.row.pairAddress,
         symbol: r.row.symbol,
         tokenName: r.row.tokenName,
         assetKey: r.row.assetKey,
         issuer: r.row.issuer,
         source: r.row.source as any || "manual_watchlist",
         note: r.row.note,
         identityKey: r.canonicalIdentityKey!
       });
    }
  }

  const { appliedCount } = addWatchlistEntriesBulk(toAdd);
  return NextResponse.json({ success: true, appliedCount, result });

}