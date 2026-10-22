import { resolveNftNetwork } from "./chainIdentity";
import { buildCoverage } from "./coverage";
import { NftMetadataError } from "./errors";
import { DEFAULT_SAMPLE_TOKEN_IDS } from "./limits";
import { assessMutability, type MutabilityResult } from "./mutability";
import { resolveMetadata } from "./resolutionProbe";
import type { NftMetadataRequest, NftMetadataResult, TokenSample } from "./schema";
import { detectStandard, type StandardDetectionResult } from "./standardDetection";
import { createHttpNftRpc, readContractUri, readTokenUriSamples, type NftRpc } from "./uriReader";

const EMPTY_MUTABILITY: MutabilityResult = {
  owner: null,
  baseUriSetterSignals: [],
  freezeFlags: [],
  metadataUpdateScan: { fromBlock: "0", toBlock: "0", metadataUpdateCount: 0, batchMetadataUpdateCount: 0, truncated: false },
};

const EMPTY_STANDARD_DETECTION: StandardDetectionResult = {
  standard: "unknown",
  supportsErc165: false,
  erc721MetadataExtension: false,
  erc4906: false,
};

export async function inspectNftMetadata(input: NftMetadataRequest, deps: { rpc?: NftRpc } = {}): Promise<NftMetadataResult> {
  const network = resolveNftNetwork(input.network);
  if (!network) {
    throw new NftMetadataError("Unsupported network", "unsupported_network", false);
  }

  const rpc = deps.rpc ?? createHttpNftRpc(network.rpcUrl);
  const warnings: string[] = [];

  try {
    const block = input.blockNumber !== undefined ? BigInt(input.blockNumber) : await rpc.blockNumber();

    const standardDetection = await detectStandard(rpc, input.contractAddress, block);
    if (standardDetection.standard === "unknown") {
      warnings.push("Could not detect ERC-721 or ERC-1155 via ERC-165; token-level sampling was skipped.");
    }

    const contractUriRaw = await readContractUri(rpc, input.contractAddress, block);
    const contractUri = await resolveMetadata(contractUriRaw);

    let samples: TokenSample[] = [];
    if (standardDetection.standard !== "unknown") {
      const tokenIds = input.tokenIds?.length ? input.tokenIds : DEFAULT_SAMPLE_TOKEN_IDS;
      const rawSamples = await readTokenUriSamples(rpc, input.contractAddress, tokenIds, standardDetection.standard, block);
      samples = await Promise.all(
        rawSamples.map(async (sample) => ({ ...sample, resolution: await resolveMetadata(sample.uri) })),
      );
    }

    const mutability = await assessMutability(rpc, input.contractAddress, block);
    const coverage = buildCoverage(standardDetection, samples, mutability);

    const contractUriFailed = contractUriRaw !== null && !contractUri.resolved;
    if (contractUriFailed) {
      warnings.push(`contractURI did not resolve: ${contractUri.reason}`);
    }

    const incomplete = standardDetection.standard === "unknown" || contractUriFailed || samples.some((sample) => !sample.resolution.resolved);

    return {
      network: input.network,
      contractAddress: input.contractAddress,
      state: incomplete ? "partial" : "complete",
      standard: standardDetection.standard,
      standardDetection,
      contractUri,
      samples,
      mutability,
      coverage,
      warnings,
    };
  } catch (error) {
    return {
      network: input.network,
      contractAddress: input.contractAddress,
      state: "unavailable",
      standard: "unknown",
      standardDetection: EMPTY_STANDARD_DETECTION,
      contractUri: { uri: null, hosting: null, resolved: false, reason: "provider unavailable", metadata: null, media: null },
      samples: [],
      mutability: EMPTY_MUTABILITY,
      coverage: { standardDetected: false, sampledTokens: 0, resolvedSamples: 0, metadataUpdateScanTruncated: false },
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
