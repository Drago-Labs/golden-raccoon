import { trustlineEligibility } from "./assetEligibility";
import { HorizonClaimantSource, type ClaimantSource } from "./claimantReader";
import { ledgerCloseEpoch } from "./ledgerClock";
import { decodePredicate } from "./predicateDecoder";
import { evaluatePredicate } from "./predicateEvaluator";
import { provenanceLabel } from "./provenance";
import type { ClaimableItem, ClaimableResult } from "./schema";
import type { z } from "zod";
import type { claimableRequestSchema } from "./schema";

type Request = z.infer<typeof claimableRequestSchema> & { walletAddress: string };
export async function exploreClaimableBalances(request: Request, dependencies: { source?: ClaimantSource; now?: () => Date } = {}): Promise<ClaimableResult> {
  const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  try {
    const evidence = await (dependencies.source ?? new HorizonClaimantSource()).read({ wallet: request.walletAddress, network: request.network, pageSize: request.pageSize, maxPages: request.maxPages, knownIds: request.knownBalanceIds });
    const clock = ledgerCloseEpoch(evidence.closeTime); const warnings: string[] = [];
    if (!evidence.accountBalances) warnings.push("Trustline evidence unavailable; non-native eligibility remains unknown");
    if (evidence.duplicatePage) warnings.push("Duplicate pagination cursor stopped discovery");
    if (evidence.truncated) warnings.push("Pagination limit reached; discovery is incomplete");
    if (evidence.missingIds.length) warnings.push("Known balances disappeared; no claim outcome is inferred");
    const items: ClaimableItem[] = evidence.records.flatMap((record) => {
      const claimant = record.claimants.find((entry) => entry.destination === request.walletAddress); if (!claimant) return [];
      let predicate = null; let predicateResult: ClaimableItem["predicateResult"] = "unknown"; const reasons: string[] = [];
      try { predicate = decodePredicate(claimant.predicate); predicateResult = evaluatePredicate(predicate, { ledgerCloseEpochSeconds: clock }); } catch (error) { reasons.push(error instanceof Error ? error.message : "Predicate unsupported"); }
      const trustlineState = trustlineEligibility(record.asset, evidence.accountBalances);
      let eligibility: ClaimableItem["eligibility"] = predicateResult === false ? "ineligible" : predicateResult === true && ["authorized", "not_required"].includes(trustlineState) ? "eligible" : "unknown";
      if (predicateResult === "unknown") reasons.push("Predicate needs unavailable relative-time or decoding context");
      if (trustlineState === "unknown") reasons.push("Trustline authorization is unknown");
      if (trustlineState === "missing") { reasons.push("Required authorized trustline is missing"); eligibility = "ineligible"; }
      return [{ id: record.id, asset: record.asset, amount: record.amount, sponsor: record.sponsor ?? null, observationLedger: evidence.ledger, observationTime: evidence.closeTime, predicate, predicateResult, trustlineState, eligibility, reasons, provenance: provenanceLabel(evidence.source, evidence.ledger) }];
    });
    const partial = warnings.length > 0 || items.some((item) => item.predicate === null);
    return { walletAddress: request.walletAddress, network: request.network, state: partial ? "partial" : "complete", generatedAt, observation: { ledger: evidence.ledger, closeTime: evidence.closeTime, source: evidence.source }, items, disappearedIds: evidence.missingIds, coverage: { pagesRead: evidence.pagesRead, recordsRead: evidence.records.length, duplicatePage: evidence.duplicatePage, truncated: evidence.truncated, message: partial ? "Discovery or eligibility evidence is incomplete." : "Bounded discovery completed with available evidence." }, warnings };
  } catch (error) {
    return { walletAddress: request.walletAddress, network: request.network, state: "unavailable", generatedAt, observation: { ledger: null, closeTime: null, source: null }, items: [], disappearedIds: [], coverage: { pagesRead: 0, recordsRead: 0, duplicatePage: false, truncated: false, message: "Claimable balance evidence is unavailable." }, warnings: [error instanceof Error ? error.message : "Provider unavailable"] };
  }
}
