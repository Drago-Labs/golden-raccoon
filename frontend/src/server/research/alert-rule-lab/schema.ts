import { z } from "zod";

export const draftRuleSchema = z.object({
  id: z.string().max(100).default("draft"),
  observationKey: z.string().max(200).optional(),
  threshold: z.number().finite(),
  hysteresis: z.number().finite().min(0).max(1_000_000),
  cooldownMinutes: z.number().finite().min(0).max(1_440),
  direction: z.enum(["high_is_bad", "low_is_bad"]),
  enabled: z.boolean().default(true),
});

export const labRequestSchema = z.object({
  walletAddress: z.string().trim().min(3).max(128),
  chainFamily: z.enum(["evm", "stellar"]),
  network: z.string().trim().min(1).max(80),
  frozenAt: z.string().datetime(),
  draft: draftRuleSchema,
  saved: draftRuleSchema.optional(),
  observations: z.array(z.object({
    id: z.string().max(100),
    walletAddress: z.string().max(128),
    network: z.string().max(80),
    observationKey: z.string().max(200),
    value: z.number().finite().nullable(),
    observedAt: z.string().datetime(),
    evidenceId: z.string().max(200).optional(),
    incomplete: z.boolean().default(false),
  })).max(100),
}).superRefine((value, context) => {
  value.observations.forEach((item, index) => {
    if (item.walletAddress.toLowerCase() !== value.walletAddress.toLowerCase()) context.addIssue({ code: "custom", path: ["observations", index, "walletAddress"], message: "Cross-wallet observation" });
    if (item.network !== value.network) context.addIssue({ code: "custom", path: ["observations", index, "network"], message: "Cross-network observation" });
  });
});

export type LabRequest = z.infer<typeof labRequestSchema>;
export type TimelineItem = { id: string; observedAt: string; value: number | null; outcome: "match" | "suppressed" | "recovered" | "deteriorated" | "missing"; reason: string; ruleFields: string };
export type LabResult = { state: "complete" | "empty" | "partial" | "unavailable"; frozenAt: string; timeline: TimelineItem[]; summary: { draftAlerts: number; savedAlerts: number | null; delta: number | null; coverage: number }; warnings: string[] };
