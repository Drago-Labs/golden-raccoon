import { z } from "zod";
import type { GovernanceQueueResult, PendingChange } from "@/server/stellar/governance";

export const governanceQueueRequestSchema = z.object({
  network: z.enum(["testnet", "pubnet"]).default("testnet"),
});

export type GovernanceQueueView = GovernanceQueueResult & {
  readiness: Array<{ id: string; ready: boolean; note: string }>;
};

export type { PendingChange, GovernanceQueueResult };
