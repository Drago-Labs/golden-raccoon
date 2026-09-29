import type { z } from "zod";
import { resolveInspectorAsset } from "./assetResolver";
import { HorizonControlSource, type ControlSource } from "./evidenceReader";
import type { IssuerControlResult, issuerControlRequestSchema } from "./schema";
import { buildIssuerFlagSnapshot, buildTrustlineSnapshot } from "./trustlineState";

type Request = z.infer<typeof issuerControlRequestSchema> & {
  walletAddress: string;
  accountAddress: string;
};

export async function inspectIssuerControl(
  request: Request,
  dependencies: { source?: ControlSource; now?: () => Date } = {},
): Promise<IssuerControlResult> {
  const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const resolved = resolveInspectorAsset(request.assetQuery, request.network);

  if (!resolved.asset) {
    return {
      walletAddress: request.walletAddress,
      accountAddress: request.accountAddress,
      network: request.network,
      state: "unavailable",
      generatedAt,
      asset: null,
      observation: { ledger: null, closeTime: null, source: null },
      issuerFlags: {
        state: "unavailable",
        authRequired: null,
        authRevocable: null,
        authImmutable: null,
        authClawbackEnabled: null,
        issuerExists: null,
        issuer: null,
        ledger: null,
        observedAt: null,
        source: null,
        note: resolved.error ?? "Asset identity unresolved",
      },
      trustline: {
        state: "unavailable",
        balance: null,
        limit: null,
        buyingLiabilities: null,
        sellingLiabilities: null,
        account: request.accountAddress,
        assetKey: "unresolved",
        ledger: null,
        observedAt: null,
        source: null,
        note: resolved.error ?? "Asset identity unresolved",
      },
      events: [],
      coverage: {
        pagesRead: 0,
        recordsRead: 0,
        duplicatePage: false,
        truncated: false,
        message: "Asset identity could not be resolved; no observations recorded.",
      },
      warnings: [resolved.error ?? "Asset identity unresolved"],
    };
  }

  try {
    const evidence = await (dependencies.source ?? new HorizonControlSource()).read({
      account: request.accountAddress,
      network: request.network,
      asset: resolved.asset,
      pageSize: request.pageSize,
      maxPages: request.maxPages,
    });

    const warnings: string[] = [];
    if (evidence.accountMissing) warnings.push("Queried account was not found; trustline state is unavailable.");
    if (evidence.issuerFlagsUnavailable) warnings.push("Issuer flag evidence is unavailable.");
    if (evidence.duplicatePage) warnings.push("Duplicate pagination cursor stopped event discovery.");
    if (evidence.truncated) warnings.push("Event pagination limit reached; timeline is incomplete.");
    if (resolved.asset.kind === "soroban_token") {
      warnings.push("Soroban token identity resolved; classic issuer flags and trustlines are not claimed.");
    }

    const issuerFlags = buildIssuerFlagSnapshot({
      asset: resolved.asset,
      flags: evidence.issuerFlags,
      flagsUnavailable: evidence.issuerFlagsUnavailable,
      ledger: evidence.ledger,
      observedAt: evidence.closeTime,
      source: evidence.source,
    });

    const trustline = buildTrustlineSnapshot({
      asset: resolved.asset,
      account: request.accountAddress,
      balances: evidence.accountBalances,
      ledger: evidence.ledger,
      observedAt: evidence.closeTime,
      source: evidence.source,
      balancesUnavailable: evidence.accountMissing || evidence.accountBalances === null,
    });

    const partial =
      warnings.length > 0 ||
      issuerFlags.state === "unavailable" ||
      trustline.state === "unavailable" ||
      evidence.truncated ||
      evidence.duplicatePage;

    return {
      walletAddress: request.walletAddress,
      accountAddress: request.accountAddress,
      network: request.network,
      state: partial ? "partial" : "complete",
      generatedAt,
      asset: resolved.asset,
      observation: { ledger: evidence.ledger, closeTime: evidence.closeTime, source: evidence.source },
      issuerFlags,
      trustline,
      events: evidence.events,
      coverage: {
        pagesRead: evidence.pagesRead,
        recordsRead: evidence.events.length,
        duplicatePage: evidence.duplicatePage,
        truncated: evidence.truncated,
        message: partial
          ? "Issuer-control evidence is incomplete or partially unavailable."
          : "Bounded issuer-control inspection completed with available evidence.",
      },
      warnings,
    };
  } catch (error) {
    return {
      walletAddress: request.walletAddress,
      accountAddress: request.accountAddress,
      network: request.network,
      state: "unavailable",
      generatedAt,
      asset: resolved.asset,
      observation: { ledger: null, closeTime: null, source: null },
      issuerFlags: {
        state: "unavailable",
        authRequired: null,
        authRevocable: null,
        authImmutable: null,
        authClawbackEnabled: null,
        issuerExists: null,
        issuer: resolved.asset.issuer,
        ledger: null,
        observedAt: null,
        source: null,
        note: "Provider failure; no authorized/safe claim is made.",
      },
      trustline: {
        state: "unavailable",
        balance: null,
        limit: null,
        buyingLiabilities: null,
        sellingLiabilities: null,
        account: request.accountAddress,
        assetKey: resolved.asset.assetKey,
        ledger: null,
        observedAt: null,
        source: null,
        note: "Provider failure; no authorized/safe claim is made.",
      },
      events: [],
      coverage: {
        pagesRead: 0,
        recordsRead: 0,
        duplicatePage: false,
        truncated: false,
        message: "Issuer-control evidence is unavailable.",
      },
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
