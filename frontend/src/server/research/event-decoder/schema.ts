import { z } from "zod";
import type { EventDecoderState } from "./errors";
import { EVENT_DECODER_LIMITS } from "./limits";
import { SUPPORTED_EVENT_NETWORKS, type EventDecoderNetwork } from "./networkIdentity";

export const eventDecoderRequestSchema = z
  .object({
    contractId: z.string().trim().regex(/^C[A-Z2-7]{55}$/, "Expected Soroban contract ID (C...)"),
    startLedger: z.number().int().positive(),
    endLedger: z.number().int().positive(),
    topicFilter: z.string().trim().optional(),
    network: z.enum(SUPPORTED_EVENT_NETWORKS),
  })
  .refine((v) => v.endLedger >= v.startLedger, {
    message: "endLedger must be >= startLedger",
    path: ["endLedger"],
  })
  .refine((v) => v.endLedger - v.startLedger <= EVENT_DECODER_LIMITS.maxLedgerSpan, {
    message: `Ledger span cannot exceed ${EVENT_DECODER_LIMITS.maxLedgerSpan}`,
    path: ["endLedger"],
  });

export type EventDecoderRequest = z.infer<typeof eventDecoderRequestSchema>;

export type RawScVal =
  | { type: "symbol" | "address" | "string" | "bool" | "u32" | "u64" | "i64"; value: string }
  | { type: "i128" | "u128"; hi?: string; lo?: string; value?: string }
  | { type: "vec"; items: RawScVal[] }
  | { type: "map"; entries: Array<{ key: RawScVal; val: RawScVal }> };

export type RawContractEvent = {
  eventId: string;
  ledger: number;
  txHash: string;
  topics: RawScVal[];
  data: RawScVal;
};

export type RawEventWindowResponse = {
  earliestRetainedLedger: number;
  latestLedger: number;
  pages: RawContractEvent[][];
};

export type SpecFieldDef = {
  name: string;
  type: string;
  location: "topic" | "data";
  topicIndex?: number;
};

export type ContractEventSpecDef = {
  name: string;
  signatureSymbol: string;
  topicCount: number;
  dataType: string;
  fields: SpecFieldDef[];
};

export type DecodedField = {
  name: string;
  type: string;
  location: "topic" | "data";
  value: string;
};

export type DecodedContractEvent = {
  eventId: string;
  ledger: number;
  txHash: string;
  matchedSpecName: string | null;
  mismatchReason: string | null;
  fields: DecodedField[];
  rawTopicsDisplay: string[];
  rawDataDisplay: string;
};

export type RetentionAssessment = {
  requestedStartLedger: number;
  requestedEndLedger: number;
  earliestRetainedLedger: number;
  latestLedger: number;
  outsideRetention: boolean;
  unretainedLedgerCount: number;
  statusMessage: string;
};

export type CoverageNotice = {
  reachedProvider: boolean;
  specFound: boolean;
  eventsDecoded: number;
  eventsUnmatched: number;
  deduplicatedCount: number;
  retention: RetentionAssessment | null;
  message: string;
};

export type EventDecoderReport = {
  network: EventDecoderNetwork;
  contractId: string;
  state: EventDecoderState;
  events: DecodedContractEvent[];
  retention: RetentionAssessment | null;
  coverage: CoverageNotice;
  warnings: string[];
};
