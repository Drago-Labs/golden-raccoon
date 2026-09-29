import { z } from "zod";

export const AUTH_LIMITS = {
  maxPayloadChars: 65_536,
  maxAuthEntries: 64,
  maxNestingDepth: 12,
} as const;

export const sorobanAuthRequestSchema = z
  .object({
    walletAddress: z.string().optional(),
    network: z.enum(["stellar-testnet", "stellar-pubnet"]),
    walletNetwork: z.enum(["stellar-testnet", "stellar-pubnet"]),
    networkPassphrase: z.string().min(8).max(200).optional(),
    envelopeXdr: z.string().trim().max(AUTH_LIMITS.maxPayloadChars).optional(),
    simulationJson: z.string().trim().max(AUTH_LIMITS.maxPayloadChars).optional(),
  })
  .superRefine((value, context) => {
    if (value.network !== value.walletNetwork) {
      context.addIssue({ code: "custom", path: ["network"], message: "Network does not match connected wallet" });
    }
    if (!value.envelopeXdr && !value.simulationJson) {
      context.addIssue({
        code: "custom",
        path: ["simulationJson"],
        message: "Provide a bounded envelope XDR and/or simulation JSON",
      });
    }
  });

export type AuthNode = {
  id: string;
  parentId: string | null;
  address: string | null;
  contractId: string | null;
  functionName: string | null;
  argumentHash: string | null;
  nonce: string | null;
  expirationLedger: number | null;
  networkPassphrase: string | null;
  depth: number;
  flags: ("unknown_contract" | "unsupported_scval" | "duplicate" | "conflicting" | "expiring" | "network_mismatch")[];
  note: string;
};

export type SorobanAuthResult = {
  walletAddress: string;
  network: "stellar-testnet" | "stellar-pubnet";
  state: "complete" | "partial" | "unavailable";
  generatedAt: string;
  decodingIsNotApproval: true;
  nodes: AuthNode[];
  warnings: string[];
  coverageMessage: string;
};
