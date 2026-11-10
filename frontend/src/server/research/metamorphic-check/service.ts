import { isSupportedMetamorphicNetwork } from "./chainIdentity";
import { compareCodeHashes } from "./codeHashHistory";
import { buildMetamorphicCoverage } from "./coverage";
import { isCreate2Deployment } from "./create2";
import { createDefaultMetamorphicReader, type MetamorphicChainReader } from "./creationReader";
import { MetamorphicCheckError } from "./errors";
import { evaluateForkRules } from "./forkRules";
import { analyzeInitCode } from "./initCodePatterns";
import { scanRuntimeBytecode } from "./opcodeScanner";
import {
  metamorphicCheckRequestSchema,
  type MetamorphicCheckResult,
  type MetamorphicClassification,
} from "./schema";

export async function inspectMetamorphicContract(
  rawInput: unknown,
  deps: { reader?: MetamorphicChainReader } = {},
): Promise<MetamorphicCheckResult> {
  const parsed = metamorphicCheckRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new MetamorphicCheckError("Invalid metamorphic check request", "invalid_request", false);
  }
  const input = parsed.data;
  if (!isSupportedMetamorphicNetwork(input.network)) {
    throw new MetamorphicCheckError(`Unsupported network: ${input.network}`, "unsupported_network", false);
  }

  const reader = deps.reader ?? createDefaultMetamorphicReader();
  let evidence;
  try {
    evidence = await reader.readContractEvidence({
      network: input.network,
      contractAddress: input.contractAddress,
      blockNumber: input.blockNumber,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "RPC unavailable";
    return {
      network: input.network,
      contractAddress: input.contractAddress,
      state: "unavailable",
      classification: "inconclusive",
      creation: {
        found: false,
        txHash: null,
        creationKind: "unknown",
        factoryAddress: null,
        salt: null,
        initCodeHex: null,
        deploymentBlock: null,
      },
      opcodes: { hasSelfDestruct: false, selfDestructOffsets: [], hasDelegateCall: false, delegateCallOffsets: [] },
      initCodePatterns: { externalCodeCopyInInit: false, dynamicRuntimeLoader: false },
      forkRules: evaluateForkRules(input.network, input.blockNumber ?? null),
      codeHashHistory: { samples: [], historicalCodeChangeDetected: false },
      coverage: buildMetamorphicCoverage({
        reachedProvider: false,
        creationTxFound: false,
        runtimeBytecodeRead: false,
        codeHashSamplesRead: 0,
      }),
      warnings: [msg],
    };
  }

  const opcodes = scanRuntimeBytecode(evidence.runtimeBytecodeHex);
  const initCodePatterns = analyzeInitCode(evidence.creation.initCodeHex);
  const forkRules = evaluateForkRules(input.network, input.blockNumber ?? evidence.creation.deploymentBlock);
  const codeHashHistory = compareCodeHashes(evidence.codeHashSamples);

  const warnings: string[] = [];
  let classification: MetamorphicClassification;

  if (!evidence.creation.found) {
    classification = "inconclusive";
    warnings.push("Creation transaction unavailable: cannot confirm whether deployment used CREATE2.");
  } else if (
    codeHashHistory.historicalCodeChangeDetected ||
    (isCreate2Deployment(evidence.creation) &&
      (opcodes.hasSelfDestruct || initCodePatterns.externalCodeCopyInInit) &&
      !forkRules.postCancunSelfDestructRestricted)
  ) {
    classification = "redeployable_metamorphic";
    warnings.push("Contract exhibits CREATE2 + SELFDESTRUCT / dynamic init-code metamorphic pattern.");
  } else if (
    isCreate2Deployment(evidence.creation) &&
    opcodes.hasSelfDestruct &&
    forkRules.postCancunSelfDestructRestricted
  ) {
    classification = "post_eip6780_mitigated";
    warnings.push("CREATE2 + SELFDESTRUCT present, but EIP-6780 restricts non-same-tx storage/code deletion.");
  } else {
    classification = "ordinary_immutable_creation";
  }

  const state = evidence.creation.found ? "complete" : "partial";

  return {
    network: input.network,
    contractAddress: input.contractAddress,
    state,
    classification,
    creation: evidence.creation,
    opcodes,
    initCodePatterns,
    forkRules,
    codeHashHistory,
    coverage: buildMetamorphicCoverage({
      reachedProvider: true,
      creationTxFound: evidence.creation.found,
      runtimeBytecodeRead: evidence.runtimeBytecodeHex.length > 2,
      codeHashSamplesRead: evidence.codeHashSamples.length,
    }),
    warnings,
  };
}
