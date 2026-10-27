import { z } from "zod";
import { DOMAIN_LOOKALIKE_LIMITS } from "./limits";
export const domainCheckRequestSchema = z.object({ url: z.string().url().max(2048), officialDomains: z.array(z.string().min(1).max(253)).min(1).max(DOMAIN_LOOKALIKE_LIMITS.maxOfficialDomains), stellarTomlUrl: z.string().url().optional() });
export type DomainCheckRequest = z.infer<typeof domainCheckRequestSchema>;
export type ExternalSignal = { state: "available" | "unknown"; source: string; sourceUrl: string; observedAt: string; value: string | number | boolean | null; reason?: string };
export type DomainCheckReport = { inputUrl: string; hostname: string; asciiHostname: string; registrableDomain: string; official: boolean; closestOfficial: string; distance: number; differingCharacters: Array<{ position: number; input: string; official: string }>; homoglyphs: Array<{ character: string; resembles: string; position: number }>; registration: ExternalSignal; certificate: ExternalSignal; metadata: ExternalSignal; verdict: "official" | "lookalike" | "suspicious" | "unverified"; coverageNotice: string; readOnly: true };
