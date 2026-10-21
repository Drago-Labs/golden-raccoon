/**
 * Queries Circle's CCTP V2 attestation service ("Iris") for a source
 * transaction's message status.
 *
 * `/v2/messages/{sourceDomain}?transactionHash={hash}` was spot-checked
 * against a real, recent Sepolia testnet burn before this module was
 * written: the response is `{ messages: [...], sourceTxHash }`, a 404
 * with `{"error": "Message not found..."}` means Iris has not observed
 * the burn yet (expected, not a failure), and a `"complete"` message
 * carries `destinationMintTxHash`. That field is surfaced as Circle's own
 * report, not independently verified — `evmDestination.ts` and
 * `stellarDestination.ts` do that separately.
 */
import { decodeBurnMessageBody, decodeMessageHeader } from "./messageFormat";
import { CCTP_TRANSFER_LIMITS } from "./limits";
import type { AttestationStatus, AttestationStep, NetworkMode } from "./schema";

const IRIS_HOST: Record<NetworkMode, string> = {
  mainnet: "https://iris-api.circle.com",
  testnet: "https://iris-api-sandbox.circle.com",
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function emptyAttestationStep(state: AttestationStep["state"], status: AttestationStatus | null, issues: string[]): AttestationStep {
  return {
    state,
    status,
    feeExecutedBaseUnits: null,
    cctpVersion: null,
    destinationMintTxHashReported: null,
    attestedMessageHex: null,
    issues,
  };
}

export async function fetchAttestation(sourceDomain: number, transactionHash: string, network: NetworkMode, fetchImpl: typeof fetch = fetch): Promise<AttestationStep> {
  const url = `${IRIS_HOST[network]}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(transactionHash)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CCTP_TRANSFER_LIMITS.fetchTimeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = message.toLowerCase().includes("abort") || message.toLowerCase().includes("timeout");
    return emptyAttestationStep("unknown", "unavailable", [timedOut ? "The attestation service request timed out." : message]);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 404) {
    return emptyAttestationStep("pending", "not_found", ["Circle's attestation service has not observed this burn yet."]);
  }
  if (response.status === 429) {
    return emptyAttestationStep("unknown", "unavailable", ["The attestation service rate limit was reached."]);
  }
  if (!response.ok) {
    return emptyAttestationStep("unknown", "unavailable", [`The attestation service returned HTTP ${response.status}.`]);
  }

  let doc: Record<string, unknown>;
  try {
    doc = asRecord(JSON.parse(await response.text()));
  } catch {
    return emptyAttestationStep("unknown", "unavailable", ["The attestation service response could not be parsed."]);
  }

  const messages = Array.isArray(doc.messages) ? doc.messages : [];
  const message = asRecord(messages.slice(0, CCTP_TRANSFER_LIMITS.maxMessagesConsidered)[0]);
  if (!message || Object.keys(message).length === 0) {
    return emptyAttestationStep("unknown", "unavailable", ["The attestation service response had no messages for this transaction."]);
  }

  const status = typeof message.status === "string" ? message.status : null;
  const normalizedStatus: AttestationStatus = status === "complete" ? "complete" : status === "pending_confirmations" ? "pending_confirmations" : "unavailable";

  const rawMessageHex = typeof message.message === "string" ? message.message : null;
  const header = rawMessageHex ? decodeMessageHeader(rawMessageHex) : null;
  const burnBody = header ? decodeBurnMessageBody(header.messageBodyHex) : null;

  const issues: string[] = [];
  if (rawMessageHex && !burnBody) {
    issues.push("The attested message was present but could not be independently decoded.");
  }

  return {
    state: normalizedStatus === "complete" ? "completed" : normalizedStatus === "pending_confirmations" ? "pending" : "unknown",
    status: normalizedStatus,
    feeExecutedBaseUnits: burnBody?.feeExecutedBaseUnits ?? null,
    cctpVersion: typeof message.cctpVersion === "number" ? message.cctpVersion : null,
    destinationMintTxHashReported: typeof message.destinationMintTxHash === "string" ? message.destinationMintTxHash : null,
    attestedMessageHex: rawMessageHex,
    issues,
  };
}
