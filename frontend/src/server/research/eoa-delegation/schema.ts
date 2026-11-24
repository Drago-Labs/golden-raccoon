import { isAddress } from "viem";
import { z } from "zod";
import { supportedDelegationChain } from "./chainSupport";

export const delegationRequestSchema = z.object({
  address: z.string().refine(isAddress, "Invalid EVM address"),
  network: z.string().refine(supportedDelegationChain, "Unsupported chain"),
});
export type DelegationRequest = z.infer<typeof delegationRequestSchema>;
export type AuthorizationRecord = { transactionHash: string; blockNumber: number; target: string; revoked: boolean };
export type DelegationReport = {
  address: string; network: string; state: "delegated" | "plain" | "unavailable";
  target: string | null; implementation: string | null; verifiedSource: boolean | null;
  capabilities: string[]; history: AuthorizationRecord[]; coverage: string[];
};
