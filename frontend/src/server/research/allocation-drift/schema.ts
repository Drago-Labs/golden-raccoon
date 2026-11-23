import { z } from 'zod';
import { ALLOCATION_LIMITS } from './limits';

const amount = z.string().regex(/^\d{1,40}(?:\.\d{1,18})?$/);
const key = z.string().trim().min(1).max(200);
export const targetSchema = z.object({
  version: z.literal(1),
  mode: z.enum(['asset', 'group']),
  entries: z.array(z.object({
    key, label: z.string().trim().min(1).max(100),
    basisPoints: z.number().int().min(0).max(10_000),
    members: z.array(key).min(1).max(ALLOCATION_LIMITS.maxHoldings),
  })).min(1).max(ALLOCATION_LIMITS.maxTargets),
});
export const snapshotSchema = z.object({
  walletAddress: z.string().min(1).max(100), network: z.string().min(1).max(40),
  at: z.string().datetime(), source: z.string().min(1).max(150),
  completeValuation: z.boolean(),
  holdings: z.array(z.object({key, label: z.string().max(100), valueUsd: amount, priceUsd: amount.nullable()})).max(ALLOCATION_LIMITS.maxHoldings),
});
export const allocationRequestSchema = z.object({
  walletAddress: z.string().regex(/^(?:0x[a-fA-F0-9]{40}|G[A-Z2-7]{55})$/),
  network: z.enum(['ethereum', 'base', 'goat', 'arbitrum', 'optimism', 'polygon', 'bsc', 'avalanche', 'stellar-testnet', 'stellar-pubnet']),
  windowStart: z.string().datetime(), windowEnd: z.string().datetime(),
  thresholdBps: z.number().int().min(1).max(10_000).default(500),
  targets: targetSchema.optional(),
  history: z.array(snapshotSchema).max(ALLOCATION_LIMITS.maxSnapshots).default([]),
}).superRefine((value, ctx) => {
  const start = Date.parse(value.windowStart), end = Date.parse(value.windowEnd);
  if (start >= end || end - start > ALLOCATION_LIMITS.maxWindowMs) ctx.addIssue({code:'custom',path:['windowStart'],message:'Choose a positive window of at most 90 days.'});
  if (value.network.startsWith('stellar') !== value.walletAddress.startsWith('G')) ctx.addIssue({code:'custom',path:['walletAddress'],message:'Wallet address does not match the selected network.'});
});
export type TargetDefinition = z.infer<typeof targetSchema>;
export type AllocationSnapshot = z.infer<typeof snapshotSchema>;
export type AllocationRequest = z.infer<typeof allocationRequestSchema>;
export type WeightedPosition = {key:string;label:string;valueUnits:bigint;priceUsd:string|null;basisPoints:string|null;targetBps:number};
export type DriftRow = {key:string;label:string;currentUsd:string;currentBps:string|null;targetBps:number;driftBps:string|null;restoreUsd:string|null;restoreQuantity:string|null};
export type DriftPoint = {at:string;rows:DriftRow[]};
export type AllocationReport = {
  state:'complete'|'partial'; walletAddress:string;network:string;
  target:TargetDefinition;current:DriftPoint;history:DriftPoint[];
  crossings:Array<{at:string;key:string;direction:'above'|'below';driftBps:string}>;
  totalUsd:string;coverage:string[];
};
export type AllocationResult = {state:'ready'|'unavailable';snapshot:AllocationSnapshot|null;report:AllocationReport|null;reason?:string};
