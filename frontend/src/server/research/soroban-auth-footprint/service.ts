import type { z } from "zod";
import { assertEnvelopeBounds, parseSimulationAuthTree } from "./decode";
import type { SorobanAuthResult, sorobanAuthRequestSchema } from "./schema";

type Request = z.infer<typeof sorobanAuthRequestSchema> & { walletAddress: string };

const PASSPHRASE: Record<"stellar-testnet" | "stellar-pubnet", string> = {
  "stellar-testnet": "Test SDF Network ; September 2015",
  "stellar-pubnet": "Public Global Stellar Network ; September 2015",
};

export async function inspectSorobanAuthFootprint(
  request: Request,
  dependencies: { now?: () => Date; evaluatedLedger?: number | null } = {},
): Promise<SorobanAuthResult> {
  const generatedAt = (dependencies.now?.() ?? new Date()).toISOString();
  const expectedPassphrase = request.networkPassphrase ?? PASSPHRASE[request.network];
  const warnings: string[] = [];

  try {
    if (request.envelopeXdr) {
      assertEnvelopeBounds(request.envelopeXdr);
      warnings.push("Envelope XDR size/shape accepted; auth claims come from simulation JSON when provided.");
    }

    if (request.networkPassphrase && request.networkPassphrase !== PASSPHRASE[request.network]) {
      return {
        walletAddress: request.walletAddress,
        network: request.network,
        state: "unavailable",
        generatedAt,
        decodingIsNotApproval: true,
        nodes: [],
        warnings: ["Network or envelope passphrase mismatch rejected before decoding claims."],
        coverageMessage: "Passphrase does not match the selected network.",
      };
    }

    if (!request.simulationJson) {
      return {
        walletAddress: request.walletAddress,
        network: request.network,
        state: "partial",
        generatedAt,
        decodingIsNotApproval: true,
        nodes: [],
        warnings: [
          ...warnings,
          "No simulation JSON provided; nested authorization claims were not decoded.",
        ],
        coverageMessage: "Envelope bounds checked; auth tree requires simulation JSON.",
      };
    }

    const { nodes, warnings: decodeWarnings } = parseSimulationAuthTree(
      request.simulationJson,
      expectedPassphrase,
      dependencies.evaluatedLedger ?? null,
    );
    warnings.push(...decodeWarnings);

    const flagged = nodes.some((node) => node.flags.length > 0);
    const partial = flagged || warnings.length > 0;

    return {
      walletAddress: request.walletAddress,
      network: request.network,
      state: partial ? "partial" : "complete",
      generatedAt,
      decodingIsNotApproval: true,
      nodes,
      warnings,
      coverageMessage: partial
        ? "Authorization tree decoded with explicit flags; decoding is not approval."
        : "Authorization tree decoded from simulation fixture. Decoding is not approval.",
    };
  } catch (error) {
    return {
      walletAddress: request.walletAddress,
      network: request.network,
      state: "unavailable",
      generatedAt,
      decodingIsNotApproval: true,
      nodes: [],
      warnings: [error instanceof Error ? error.message : "Decode failed"],
      coverageMessage: "Soroban auth footprint evidence is unavailable.",
    };
  }
}
