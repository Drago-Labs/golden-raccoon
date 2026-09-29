import type { z } from "zod";
import { normalizeAssetKey } from "./assets";
import { HorizonPathSource, type PathSource } from "./evidenceReader";
import type { PathPaymentResult, pathPaymentRequestSchema, RouteFailure } from "./schema";

type Request = z.infer<typeof pathPaymentRequestSchema> & { walletAddress: string };

export async function inspectPathPayment(
  request: Request,
  dependencies: { source?: PathSource; now?: () => Date; maxQuoteAgeSeconds?: number } = {},
): Promise<PathPaymentResult> {
  const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const sourceAssetKey = normalizeAssetKey(request.sourceAsset);
  const destinationAssetKey = normalizeAssetKey(request.destinationAsset);

  if (!sourceAssetKey || !destinationAssetKey) {
    return {
      walletAddress: request.walletAddress,
      network: request.network,
      mode: request.mode,
      state: "unavailable",
      generatedAt,
      observation: { ledger: null, closeTime: null, source: null, quoteAgeSeconds: null },
      sourceAssetKey: request.sourceAsset,
      destinationAssetKey: request.destinationAsset,
      routes: [],
      primaryFailure: "provider_failure",
      coverageMessage: "Asset identities could not be normalized.",
      warnings: ["Provide native/XLM or CODE:ISSUER asset keys; same-symbol issuers stay distinct."],
    };
  }

  if (sourceAssetKey === destinationAssetKey) {
    return {
      walletAddress: request.walletAddress,
      network: request.network,
      mode: request.mode,
      state: "unavailable",
      generatedAt,
      observation: { ledger: null, closeTime: null, source: null, quoteAgeSeconds: null },
      sourceAssetKey,
      destinationAssetKey,
      routes: [],
      primaryFailure: "no_path",
      coverageMessage: "Source and destination assets are identical; no path is meaningful.",
      warnings: [],
    };
  }

  try {
    const evidence = await (dependencies.source ?? new HorizonPathSource()).read({
      network: request.network,
      mode: request.mode,
      sourceAsset: sourceAssetKey,
      destinationAsset: destinationAssetKey,
      amount: request.amount,
    });

    const maxAge = dependencies.maxQuoteAgeSeconds ?? 30;
    const warnings: string[] = [];
    let primaryFailure: RouteFailure = "none";
    const routes = evidence.routes.map((route) => {
      const next = { ...route, warnings: [...route.warnings] };
      if (evidence.quoteAgeSeconds > maxAge) {
        next.failure = "stale_quote";
        next.estimated = true;
        next.simulated = false;
        next.warnings.push("Quote age exceeds freshness bound; not presented as executable.");
      }
      if (!next.simulated && next.failure === "none") {
        next.warnings.push("Estimate only — simulation was not completed.");
      }
      return next;
    });

    if (evidence.noPath) {
      primaryFailure = "no_path";
      warnings.push("Horizon returned no paths for these assets and amount.");
    }
    if (evidence.quoteAgeSeconds > maxAge) {
      primaryFailure = "stale_quote";
      warnings.push("Quote is stale and must not be treated as executable.");
    }
    if (routes.some((route) => !route.simulated)) {
      if (primaryFailure === "none") primaryFailure = "incomplete_simulation";
      warnings.push("Routes are estimates without a completed simulation.");
    }

    const partial = warnings.length > 0 || primaryFailure !== "none";
    return {
      walletAddress: request.walletAddress,
      network: request.network,
      mode: request.mode,
      state: evidence.noPath ? "unavailable" : partial ? "partial" : "complete",
      generatedAt,
      observation: {
        ledger: evidence.ledger,
        closeTime: evidence.closeTime,
        source: evidence.source,
        quoteAgeSeconds: evidence.quoteAgeSeconds,
      },
      sourceAssetKey,
      destinationAssetKey,
      routes,
      primaryFailure: evidence.noPath ? "no_path" : primaryFailure,
      coverageMessage: evidence.noPath
        ? "No path found for the requested assets and amount."
        : partial
          ? "Path estimates available with explicit freshness/simulation limits."
          : "Bounded path inspection completed.",
      warnings,
    };
  } catch (error) {
    return {
      walletAddress: request.walletAddress,
      network: request.network,
      mode: request.mode,
      state: "unavailable",
      generatedAt,
      observation: { ledger: null, closeTime: null, source: null, quoteAgeSeconds: null },
      sourceAssetKey,
      destinationAssetKey,
      routes: [],
      primaryFailure: "provider_failure",
      coverageMessage: "Path-payment evidence is unavailable.",
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
