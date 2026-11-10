import { isSupportedEnsNetwork } from "./chainIdentity";
import { classifyEnsResolution } from "./classify";
import { inspectConfusableLabels } from "./confusables";
import { EnsResolutionError } from "./errors";
import { extractForwardStep } from "./forwardResolver";
import { normalizeEnsName } from "./normalize";
import { extractOwnershipEvidence } from "./ownership";
import { createDefaultEnsReader, type EnsRegistryReader } from "./registryReader";
import { extractReverseStep } from "./reverseResolver";
import { ensResolutionRequestSchema, type EnsResolutionResult } from "./schema";

export async function verifyEnsResolution(
  rawInput: unknown,
  deps: { reader?: EnsRegistryReader } = {},
): Promise<EnsResolutionResult> {
  const parsed = ensResolutionRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new EnsResolutionError("Invalid ENS resolution request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedEnsNetwork(input.network)) {
    throw new EnsResolutionError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const normalizedName = input.ensName ? normalizeEnsName(input.ensName) : null;
  const reader = deps.reader ?? createDefaultEnsReader();

  let snapshot;
  try {
    snapshot = await reader.readEnsSnapshot({
      network: input.network,
      ensName: normalizedName ?? undefined,
      targetAddress: input.targetAddress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ENS provider unavailable";
    return {
      network: input.network,
      state: "unavailable",
      classification: "unresolved",
      normalizedName,
      confusables: inspectConfusableLabels(normalizedName ?? ""),
      forward: { normalizedName: normalizedName ?? "", registryResolver: null, forwardAddress: null, blockNumber: 0 },
      reverse: { queriedAddress: input.targetAddress ?? null, reverseName: null, reverseForwardAddress: null, blockNumber: 0 },
      ownership: { registrant: null, controller: null, nameWrapperWrapped: false, expiresAtTimestamp: null, expiredAtRecordedTime: false },
      coverage: { reachedProvider: false, recordedBlock: null, forwardResolved: false, reverseResolved: false, ownershipRead: false },
      warnings: [msg],
    };
  }

  const effectiveName = normalizedName ?? snapshot.reverseName ?? snapshot.normalizedName;
  const confusables = inspectConfusableLabels(effectiveName);
  const forward = extractForwardStep({ ...snapshot, normalizedName: effectiveName });
  const reverse = extractReverseStep(snapshot);
  const ownership = extractOwnershipEvidence(snapshot);
  const classification = classifyEnsResolution({ forward, reverse, ownership });

  const warnings: string[] = [];
  if (confusables.mixedScripts || confusables.zeroWidthCharacters || confusables.flaggedCharacters.length > 0) {
    warnings.push(
      `Confusable Unicode characters detected: ${confusables.flaggedCharacters.map((c) => `${c.char} (${c.codePointHex} ${c.script})`).join(", ")}`,
    );
  }
  if (classification === "mismatched") {
    warnings.push("Forward and reverse ENS records disagree: never trust the reverse name alone.");
  }
  if (classification === "expired") {
    warnings.push("ENS registration has expired at the recorded timestamp.");
  }

  return {
    network: input.network,
    state: "complete",
    classification,
    normalizedName: effectiveName || null,
    confusables,
    forward,
    reverse,
    ownership,
    coverage: {
      reachedProvider: true,
      recordedBlock: snapshot.recordedBlock,
      forwardResolved: Boolean(forward.forwardAddress),
      reverseResolved: Boolean(reverse.reverseName),
      ownershipRead: Boolean(ownership.registrant || ownership.controller),
    },
    warnings,
  };
}
