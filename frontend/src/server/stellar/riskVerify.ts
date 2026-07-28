import "server-only";

import { rpc, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { createStellarRpcServer } from "@/server/stellar/client";
import { readRiskRecord } from "@/server/stellar/riskRegistry";
import type { StellarNetworkId } from "@/lib/stellar/config";

export type VerifyStage =
  | "not_found"
  | "pending"
  | "duplicate"
  | "try_again_later"
  | "success"
  | "failed";

export type VerifyOutcome = {
  stage: VerifyStage;
  network: string;
  hash: string;
  ledger?: number;
  events?: Array<{
    type: string;
    contractId: string;
    topics: string[];
    data: Record<string, unknown>;
  }>;
  onchainReportHash?: string;
  localReportHash?: string;
  hashMatch?: boolean;
  detail: string;
};

const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse contract events from a successful transaction result.
 * TransactionEvents contains contractEventsXdr (xdr.ContractEvent[][])
 * and transactionEventsXdr (xdr.TransactionEvent[]).
 */
function parseContractEvents(
  events: rpc.Api.TransactionEvents,
): VerifyOutcome["events"] {
  const parsed: VerifyOutcome["events"] = [];

  // Parse contract-level events
  const contractEvents = events.contractEventsXdr ?? [];
  const txnEvents = events.transactionEventsXdr ?? [];

  for (const eventList of contractEvents) {
    for (const event of eventList) {
      parsed.push(parseEvent(event));
    }
  }

  // Raw transaction events
  for (const event of txnEvents) {
    parsed.push({ type: "transaction_event", contractId: "system", topics: [], data: {} });
  }

  return parsed;
}

/**
 * Parse a single ContractEvent XDR type.
 * XDR types use generated accessor methods that vary by SDK version,
 * so we use a try/catch approach to safely extract fields.
 */
function parseEvent(event: xdr.ContractEvent): NonNullable<VerifyOutcome["events"]>[number] {
  const result: NonNullable<VerifyOutcome["events"]>[number] = {
    type: "contract_event",
    contractId: "unknown",
    topics: [],
    data: {},
  };

  try {
    // Attempt to extract contract ID (Hash) from the event
    const eventAny = event as unknown as Record<string, unknown>;
    if (typeof eventAny.contractId === "function") {
      const idVal = (eventAny.contractId as () => unknown)();
      if (idVal instanceof Uint8Array) {
        result.contractId = Buffer.from(idVal).toString("hex");
      } else if (typeof idVal === "string") {
        result.contractId = idVal;
      }
    }
  } catch {
    // contractId may not be present
  }

  try {
    // Extract event type
    const eventAny = event as unknown as Record<string, unknown>;
    const typeMethod = (eventAny.type_ ?? eventAny.type) as unknown;
    if (typeof typeMethod === "function") {
      const typeVal = (typeMethod as () => { name?: string })();
      result.type = typeVal?.name ?? "contract_event";
    }
  } catch {
    // type may not be accessible
  }

  try {
    // Extract topics - ContractEvent has a topics() method returning ScVec
    const eventAny = event as unknown as Record<string, unknown>;
    const topicsMethod = eventAny.topics as unknown;
    if (typeof topicsMethod === "function") {
      const topicVec = (topicsMethod as () => { len(): number; get(i: number): unknown })();
      if (topicVec && typeof topicVec.len === "function") {
        for (let i = 0; i < topicVec.len(); i++) {
          try {
            const topic = topicVec.get(i) as { switch?: () => { name?: string } };
            result.topics.push(topic?.switch?.()?.name ?? "unknown");
          } catch {
            result.topics.push("unknown");
          }
        }
      }
    }
  } catch {
    // topics may not be accessible
  }

  return result;
}

/**
 * Extract human-readable error detail from a failed transaction.
 */
function extractErrorDetail(
  result: rpc.Api.GetFailedTransactionResponse,
): string {
  const baseMsg = "Transaction failed in ledger " + result.ledger;

  try {
    const transactionResult = result.resultXdr;
    const resultCode = transactionResult.result().switch()?.name ?? "Unknown error";

    const opResults = transactionResult.result().results() ?? [];
    const opErrors: string[] = [];
    for (let i = 0; i < opResults.length; i++) {
      const opResult = opResults[i].tr()?.switch()?.name ?? "unknown";
      opErrors.push("Operation " + i + ": " + opResult);
    }

    const hints: string[] = [];
    if (resultCode.includes("INSUFFICIENT")) {
      hints.push("Fee may be too low for the required resources.");
    }
    if (resultCode.includes("BAD_SEQ")) {
      hints.push("Sequence number is stale. Account has been used since this transaction was prepared.");
    }

    const isFootprintExpired = opErrors.some(function (e: string) {
      return e.includes("EXPIRED") || e.includes("RESTORE");
    });
    if (isFootprintExpired) {
      hints.push("Contract state footprint has expired. A restore operation is needed before submission.");
    }

    const hintStr = hints.length > 0 ? " " + hints.join(" ") : "";
    return baseMsg + ": " + resultCode + "." + hintStr + " Operation errors: " + opErrors.join("; ");
  } catch {
    return baseMsg + " with parse error on result XDR.";
  }
}

/**
 * Build a human-readable success detail string.
 */
function buildSuccessDetail(
  result: rpc.Api.GetSuccessfulTransactionResponse,
  events: VerifyOutcome["events"],
  hashMatch: boolean | undefined,
  txHash: string,
): string {
  const parts: string[] = ["Transaction confirmed in ledger " + result.ledger + "."];

  if (events && events.length > 0) {
    parts.push("Emitted " + events.length + " contract event(s).");
  } else {
    parts.push("No contract events were emitted.");
  }

  if (hashMatch === true) {
    parts.push("Onchain report hash matches the local report hash.");
  } else if (hashMatch === false) {
    parts.push("WARNING: Onchain report hash does NOT match the local report hash.");
  } else {
    parts.push("Could not compare onchain report hash.");
  }

  parts.push("Transaction hash: " + txHash + ".");

  return parts.join(" ");
}

/**
 * Poll a transaction hash until it reaches a terminal state.
 */
async function pollToTerminal(
  networkId: StellarNetworkId,
  hash: string,
  localReportHash?: string,
  assetKey?: string,
): Promise<VerifyOutcome> {
  const { network, server } = createStellarRpcServer(networkId);

  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    const result = await server.getTransaction(hash);

    const status = result.status;

    if (status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      if (attempt === MAX_POLLS - 1) {
        return {
          stage: "not_found",
          network: network.id,
          hash,
          detail: "Transaction " + hash + " was not found after " + MAX_POLLS + " polls (" + ((MAX_POLLS * POLL_INTERVAL_MS) / 1000) + "s).",
        };
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (status === rpc.Api.GetTransactionStatus.FAILED) {
      const failedResult = result as rpc.Api.GetFailedTransactionResponse;
      const errorDetail = extractErrorDetail(failedResult);
      return {
        stage: "failed",
        network: network.id,
        hash,
        ledger: failedResult.ledger,
        detail: errorDetail,
      };
    }

    if (status === rpc.Api.GetTransactionStatus.SUCCESS) {
      const successResult = result as rpc.Api.GetSuccessfulTransactionResponse;

      // Compute the transaction hash from the envelope
      const envelope = TransactionBuilder.fromXDR(
        successResult.envelopeXdr.toXDR("base64"),
        network.networkPassphrase,
      );
      const txHashHex = envelope.hash().toString("hex");

      // Parse events
      const events = successResult.events
        ? parseContractEvents(successResult.events)
        : [];

      // Read the onchain record to compare hashes
      let onchainReportHash: string | undefined;
      let hashMatch: boolean | undefined;

      if (assetKey) {
        try {
          const record = await readRiskRecord(network.id as StellarNetworkId, assetKey);
          if (record && typeof record === "object" && "report_hash" in record) {
            const rawHash = (record as Record<string, unknown>).report_hash;
            if (rawHash instanceof Uint8Array) {
              onchainReportHash = Buffer.from(rawHash).toString("hex");
            }
            if (localReportHash && onchainReportHash) {
              hashMatch = onchainReportHash === localReportHash;
            }
          }
        } catch {
          // Record read may fail if state TTL expired
          onchainReportHash = undefined;
        }
      }

      return {
        stage: "success",
        network: network.id,
        hash,
        ledger: successResult.ledger,
        events,
        onchainReportHash,
        localReportHash,
        hashMatch,
        detail: buildSuccessDetail(successResult, events, hashMatch, txHashHex),
      };
    }

    // PENDING or unknown status - keep polling
    await sleep(POLL_INTERVAL_MS);
  }

  return {
    stage: "not_found",
    network: network.id,
    hash,
    detail: "Exceeded maximum poll attempts (" + MAX_POLLS + ").",
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Verify a risk publication by polling the transaction to terminal state,
 * then checking the onchain report hash against the local report hash.
 */
export async function verifyRiskPublication(
  networkId: StellarNetworkId,
  hash: string,
  options?: {
    localReportHash?: string;
    assetKey?: string;
  },
): Promise<VerifyOutcome> {
  return pollToTerminal(networkId, hash, options?.localReportHash, options?.assetKey);
}
