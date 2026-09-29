import type { z } from "zod";
import { HorizonSignerSource, type SignerSource } from "./evidenceReader";
import type { AccountSignersResult, accountSignersRequestSchema } from "./schema";
import { buildOperationMatrix, sumSignerWeights } from "./thresholds";

type Request = z.infer<typeof accountSignersRequestSchema> & {
  walletAddress: string;
  accountAddress: string;
};

export async function inspectAccountSigners(
  request: Request,
  dependencies: { source?: SignerSource; now?: () => Date } = {},
): Promise<AccountSignersResult> {
  const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const sorobanAuthorization = {
    state: "unsupported" as const,
    note: "Soroban contract authorization is contract-specific and is not modeled as classic threshold reachability.",
  };

  try {
    const evidence = await (dependencies.source ?? new HorizonSignerSource()).read({
      account: request.accountAddress,
      network: request.network,
    });

    if (evidence.accountMissing) {
      return {
        walletAddress: request.walletAddress,
        accountAddress: request.accountAddress,
        network: request.network,
        state: "unavailable",
        generatedAt,
        observation: { ledger: evidence.ledger, closeTime: evidence.closeTime, source: evidence.source },
        thresholds: null,
        signers: [],
        totalWeight: 0,
        operations: [],
        sorobanAuthorization,
        warnings: ["Account was not found on this network; no authorization reachability is claimed."],
        coverageMessage: "Account signer evidence is unavailable.",
      };
    }

    const totalWeight = sumSignerWeights(evidence.signers.map((signer) => signer.weight));
    const operations = buildOperationMatrix(evidence.thresholds, totalWeight);
    const warnings: string[] = [];
    if (evidence.thresholds.masterWeight === 0) {
      warnings.push("Master key weight is zero; authorization depends on additional signers.");
    }
    if (evidence.signers.some((signer) => signer.kind === "unknown")) {
      warnings.push("One or more signer types are unrecognized; weights are still counted.");
    }

    return {
      walletAddress: request.walletAddress,
      accountAddress: request.accountAddress,
      network: request.network,
      state: warnings.length ? "partial" : "complete",
      generatedAt,
      observation: { ledger: evidence.ledger, closeTime: evidence.closeTime, source: evidence.source },
      thresholds: evidence.thresholds,
      signers: evidence.signers,
      totalWeight,
      operations,
      sorobanAuthorization,
      warnings,
      coverageMessage: warnings.length
        ? "Signer policy observed with explicit caveats; reachability is not key possession."
        : "Signer thresholds and classic operation reachability observed at the recorded ledger.",
    };
  } catch (error) {
    return {
      walletAddress: request.walletAddress,
      accountAddress: request.accountAddress,
      network: request.network,
      state: "unavailable",
      generatedAt,
      observation: { ledger: null, closeTime: null, source: null },
      thresholds: null,
      signers: [],
      totalWeight: 0,
      operations: [],
      sorobanAuthorization,
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
      coverageMessage: "Account signer evidence is unavailable.",
    };
  }
}
