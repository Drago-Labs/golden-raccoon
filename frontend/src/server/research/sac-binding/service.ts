import { parseClassicAsset } from "./assetIdentity";
import { deriveSacContractId } from "./contractIdDerivation";
import { buildSacCoverage } from "./coverage";
import { SacBindingError, type SacBindingState } from "./errors";
import { classifySacExecutable } from "./executableClassifier";
import { createDefaultInstanceReader, type ContractInstanceProvider } from "./instanceReader";
import { compareSacMetadata } from "./metadataComparison";
import { isSupportedSacNetwork } from "./networkIdentity";
import { resolveCounterpartAsset } from "./reverseLookup";
import { sacBindingRequestSchema, type SacBindingReport } from "./schema";

export type SacBindingDeps = {
  instanceProvider?: ContractInstanceProvider;
};

export async function verifySacBinding(
  rawInput: unknown,
  deps: SacBindingDeps = {},
): Promise<SacBindingReport> {
  const parsed = sacBindingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new SacBindingError("Invalid SAC binding verification request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedSacNetwork(input.network)) {
    throw new SacBindingError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const explicitAsset = input.asset?.trim() ? parseClassicAsset(input.asset) : null;
  const preliminaryDerivation = explicitAsset
    ? deriveSacContractId(explicitAsset, input.network)
    : null;

  const targetContractId =
    input.contractId?.trim() || preliminaryDerivation?.expectedContractId || null;

  if (!targetContractId) {
    throw new SacBindingError("Could not determine target contract ID", "invalid_request", false);
  }

  const provider = deps.instanceProvider ?? createDefaultInstanceReader();
  let instance;
  try {
    instance = await provider.readContractInstance({
      contractId: targetContractId,
      network: input.network,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Soroban RPC provider unavailable";
    return {
      network: input.network,
      state: "unavailable",
      asset: explicitAsset,
      suppliedContractId: input.contractId?.trim() ?? null,
      derivedContractId: preliminaryDerivation?.expectedContractId ?? null,
      derivation: preliminaryDerivation,
      instance: null,
      classification: {
        verdict: "undeployed_sac",
        isGenuineSac: false,
        deployed: false,
        executableKind: "missing",
        explanation: message,
      },
      metadataComparison: null,
      coverage: buildSacCoverage({
        reachedProvider: false,
        ledger: null,
        instanceInspected: false,
        message,
      }),
      warnings: [message],
    };
  }

  const resolvedAsset = resolveCounterpartAsset(input.asset, instance);
  const derivation = resolvedAsset ? deriveSacContractId(resolvedAsset, input.network) : null;
  const derivedContractId = derivation?.expectedContractId ?? null;
  const suppliedContractId = input.contractId?.trim() ?? null;

  const classification = classifySacExecutable({
    derivedContractId,
    suppliedContractId,
    instance,
  });

  const metadataComparison = resolvedAsset
    ? compareSacMetadata(resolvedAsset, instance.reportedMetadata)
    : null;

  const warnings: string[] = [];
  if (classification.verdict === "lookalike_wasm") {
    warnings.push(
      "Impersonation warning: contract uses a custom Wasm executable rather than the built-in Stellar Asset Contract.",
    );
  }
  if (classification.verdict === "undeployed_sac") {
    warnings.push("SAC is derivable from the classic asset but not yet deployed on this network.");
  }

  const state: SacBindingState = instance.deployed ? "complete" : "partial";

  return {
    network: input.network,
    state,
    asset: resolvedAsset,
    suppliedContractId,
    derivedContractId,
    derivation,
    instance,
    classification,
    metadataComparison,
    coverage: buildSacCoverage({
      reachedProvider: true,
      ledger: instance.ledger,
      instanceInspected: instance.deployed,
      message: instance.deployed
        ? "Contract instance executable and token metadata inspected via RPC."
        : "Deterministic SAC address derived; contract instance is not yet deployed on-chain.",
    }),
    warnings,
  };
}
