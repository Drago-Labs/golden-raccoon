/**
 * Public entry point for the CCTP transfer tracker.
 *
 * Decodes the source burn, queries Circle's attestation service, and
 * independently confirms destination completion, then reconciles the
 * burned and minted amounts. Each step is reported as completed,
 * pending, failed, or unknown with its own evidence — never collapsed
 * into a single "it worked" / "it didn't" answer.
 */
import { summarizeCoverage } from "./coverage";
import type { DomainInfo } from "./domainMap";
import { domainInfo, resolveSourceChain } from "./domainMap";
import { CctpTransferError } from "./errors";
import { decodeMessageHeader } from "./messageFormat";
import {
  CCTP_TRANSFER_SCHEMA_VERSION,
  cctpTransferRequestSchema,
  type AttestationStep,
  type BurnStep,
  type CctpTransferReport,
  type DestinationStep,
  type NetworkMode,
} from "./schema";
import { reconcileAmount } from "./stepState";

export type CctpTransferDeps = {
  decodeSourceBurn: (sourceChainName: string, sourceDomain: number, transactionHash: string, network: NetworkMode) => Promise<BurnStep>;
  fetchAttestation: (sourceDomain: number, transactionHash: string, network: NetworkMode) => Promise<AttestationStep>;
  checkEvmNonceUsed: (destination: DomainInfo, nonceHex: string, network: NetworkMode) => Promise<DestinationStep>;
  checkStellarNonceUsed: (nonceHex: string, network: NetworkMode) => Promise<DestinationStep>;
};

function effectiveNonceAndDestination(burn: BurnStep, attestation: AttestationStep): { nonce: string | null; destinationDomain: number | null } {
  if (burn.nonce && burn.destinationDomain !== null) {
    return { nonce: burn.nonce, destinationDomain: burn.destinationDomain };
  }
  if (attestation.attestedMessageHex) {
    const header = decodeMessageHeader(attestation.attestedMessageHex);
    if (header) return { nonce: header.nonce, destinationDomain: header.destinationDomain };
  }
  return { nonce: burn.nonce, destinationDomain: burn.destinationDomain };
}

export async function trackCctpTransfer(input: unknown, deps: CctpTransferDeps): Promise<CctpTransferReport> {
  const parsed = cctpTransferRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new CctpTransferError("invalid_request", "The CCTP transfer request could not be read.", parsed.error.flatten());
  }

  const source = resolveSourceChain(parsed.data.sourceChain);
  if (!source) {
    throw new CctpTransferError("unknown_source_chain", "That source chain is not recognized.");
  }

  const network = parsed.data.network;
  const evaluatedAt = parsed.data.evaluatedAt ? new Date(Date.parse(parsed.data.evaluatedAt)).toISOString() : new Date().toISOString();

  const [burn, attestation] = await Promise.all([
    deps.decodeSourceBurn(source.chainName, source.domain, parsed.data.transactionHash, network),
    deps.fetchAttestation(source.domain, parsed.data.transactionHash, network),
  ]);

  const { nonce, destinationDomain } = effectiveNonceAndDestination(burn, attestation);
  const destinationInfo = destinationDomain !== null ? domainInfo(destinationDomain) : null;

  let destination: DestinationStep;
  if (!nonce || !destinationInfo) {
    destination = {
      state: "unknown",
      destinationChain: destinationDomain !== null ? (destinationInfo?.chainName ?? `Unknown domain ${destinationDomain}`) : "not yet known",
      nonceUsed: null,
      issues: ["The destination could not be checked because the transfer's nonce or destination domain is not yet known."],
    };
  } else if (destinationInfo.kind === "stellar") {
    destination = await deps.checkStellarNonceUsed(nonce, network);
  } else if (destinationInfo.kind === "evm") {
    destination = await deps.checkEvmNonceUsed(destinationInfo, nonce, network);
  } else {
    destination = {
      state: "unknown",
      destinationChain: destinationInfo.chainName,
      nonceUsed: null,
      issues: [`This tool does not have a destination check configured for ${destinationInfo.chainName}.`],
    };
  }

  return {
    schemaVersion: CCTP_TRANSFER_SCHEMA_VERSION,
    evaluatedAt,
    network,
    sourceChain: source.chainName,
    sourceDomain: source.domain,
    transactionHash: parsed.data.transactionHash,
    burn,
    attestation,
    destination,
    amountReconciliation: reconcileAmount(burn, attestation),
    coverage: summarizeCoverage(burn, attestation, destination),
    transferVerdict: null,
    readOnly: true,
  };
}
