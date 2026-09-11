import type { X402ChainFamily } from "@/server/types";
import { memoryX402Store } from "@/server/x402/store/memory";
import type { X402Store } from "@/server/x402/store/store";

export type QuotaConfig = {
  maxRequests?: number;
  maxRequestsPerWindow?: number;
  maxSpendUsd?: number;
  maxSpendPerWindow?: number;
  windowSeconds?: number;
};

export type QuotaDecision = {
  allowed: boolean;
  remainingRequests: number;
  remainingSpendUsd: number;
  reason?: string;
};

type PayerWindowRecord = {
  windowStart: number;
  requestsCount: number;
  spendTotal: number;
};

/**
 * Enforces per-payer quota limits across EVM and Stellar schemes.
 */
export class QuotaEnforcer {
  private defaultPolicy: QuotaConfig = {
    maxRequests: 1000,
    maxSpendUsd: 10000,
    windowSeconds: 86400,
  };
  private readonly customPolicies = new Map<string, QuotaConfig>();
  private readonly windows = new Map<string, PayerWindowRecord>();

  constructor(
    private readonly store: X402Store = memoryX402Store,
    options?: { defaultPolicy?: QuotaConfig },
  ) {
    if (options?.defaultPolicy) {
      const merged = { ...this.defaultPolicy, ...options.defaultPolicy };
      if (options.defaultPolicy.maxRequestsPerWindow !== undefined) {
        merged.maxRequests = options.defaultPolicy.maxRequestsPerWindow;
      }
      if (options.defaultPolicy.maxSpendPerWindow !== undefined) {
        merged.maxSpendUsd = options.defaultPolicy.maxSpendPerWindow;
      }
      this.defaultPolicy = merged;
    }
  }

  private getPolicy(payer: string): QuotaConfig {
    return this.customPolicies.get(payer.toLowerCase()) ?? this.defaultPolicy;
  }

  private getWindowKey(payer: string, chainFamily: X402ChainFamily): string {
    return `${chainFamily}:${payer.toLowerCase()}`;
  }

  private getOrCreateWindow(key: string, windowSeconds: number, now: number): PayerWindowRecord {
    const existing = this.windows.get(key);
    if (!existing || now - existing.windowStart >= windowSeconds * 1000) {
      const fresh: PayerWindowRecord = {
        windowStart: now,
        requestsCount: 0,
        spendTotal: 0,
      };
      this.windows.set(key, fresh);
      return fresh;
    }
    return existing;
  }

  /**
   * Sets a custom quota policy for a specific payer.
   */
  setPolicy(payer: string, config: QuotaConfig): void {
    this.customPolicies.set(payer.toLowerCase(), config);
  }

  /**
   * Checks whether an intended request or spend fits within the payer's quota.
   */
  async checkQuota(
    payer: string,
    chainFamily: X402ChainFamily,
    intendedSpendUsd = 0,
    now = Date.now(),
  ): Promise<QuotaDecision> {
    const policy = this.getPolicy(payer);
    const windowSeconds = policy.windowSeconds ?? 86400;
    const maxRequests = policy.maxRequests ?? policy.maxRequestsPerWindow ?? 1000;
    const maxSpendUsd = policy.maxSpendUsd ?? policy.maxSpendPerWindow ?? 10000;

    const key = this.getWindowKey(payer, chainFamily);
    const window = this.getOrCreateWindow(key, windowSeconds, now);

    const remainingRequests = Math.max(0, maxRequests - window.requestsCount);
    const remainingSpendUsd = Math.max(0, maxSpendUsd - window.spendTotal);

    if (window.requestsCount + 1 > maxRequests) {
      return {
        allowed: false,
        remainingRequests: 0,
        remainingSpendUsd,
        reason: `Quota exceeded: limit is ${maxRequests} requests per window`,
      };
    }

    if (window.spendTotal + intendedSpendUsd > maxSpendUsd) {
      return {
        allowed: false,
        remainingRequests,
        remainingSpendUsd: 0,
        reason: `Quota exceeded: limit is $${maxSpendUsd} per window`,
      };
    }

    return {
      allowed: true,
      remainingRequests: remainingRequests - 1,
      remainingSpendUsd: remainingSpendUsd - intendedSpendUsd,
    };
  }

  /**
   * Consumes quota for a payer upon confirmed settlement.
   */
  async consume(
    payer: string,
    chainFamily: X402ChainFamily,
    spendUsd: number,
    now = Date.now(),
  ): Promise<void> {
    const policy = this.getPolicy(payer);
    const windowSeconds = policy.windowSeconds ?? 86400;
    const key = this.getWindowKey(payer, chainFamily);
    const window = this.getOrCreateWindow(key, windowSeconds, now);

    window.requestsCount += 1;
    window.spendTotal += spendUsd;
  }

  /**
   * Clears in-memory quota tracking windows.
   */
  reset(): void {
    this.windows.clear();
    this.customPolicies.clear();
  }
}

export const quotaEnforcer = new QuotaEnforcer();
