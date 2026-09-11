import { randomUUID } from "node:crypto";
import type { X402ChainFamily } from "@/server/types";
import { memoryX402Store } from "@/server/x402/store/memory";
import type { StoredQuote, X402Store } from "@/server/x402/store/store";

export type PriceQuote = StoredQuote;

export type CreateQuoteOptions = {
  resource: string;
  priceUsd: string;
  amount?: string;
  asset: string;
  network: string;
  chainFamily: X402ChainFamily;
  payTo: string;
  ttlSeconds?: number;
};

export type ValidateQuoteResult = {
  valid: boolean;
  quote?: PriceQuote;
  reason?: string;
};

/**
 * Manages time-locked price quotes ensuring payments in-flight honour the quoted price.
 */
export class PricingEngine {
  private readonly defaultTtlSeconds = 300;

  constructor(
    private readonly store: X402Store = memoryX402Store,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Generates and persists a time-locked price quote for a resource.
   */
  async createQuote(options: CreateQuoteOptions): Promise<PriceQuote> {
    const currentTime = this.now();
    const ttlMs = (options.ttlSeconds ?? this.defaultTtlSeconds) * 1000;
    const quote: PriceQuote = {
      id: `quot_${randomUUID().replace(/-/g, "")}`,
      resource: options.resource,
      priceUsd: options.priceUsd,
      amount: options.amount ?? options.priceUsd,
      asset: options.asset,
      network: options.network,
      chainFamily: options.chainFamily,
      payTo: options.payTo,
      createdAt: new Date(currentTime).toISOString(),
      expiresAt: new Date(currentTime + ttlMs).toISOString(),
    };
    await this.store.saveQuote(quote);
    return quote;
  }

  /**
   * Alias for createQuote.
   */
  async issueQuote(options: CreateQuoteOptions): Promise<PriceQuote> {
    return this.createQuote(options);
  }

  /**
   * Retrieves an existing quote by identifier.
   */
  async getQuote(id: string): Promise<PriceQuote | null> {
    return this.store.getQuote(id);
  }

  /**
   * Checks whether a quote is currently valid and unexpired.
   */
  isQuoteActive(quote: PriceQuote, at = this.now()): boolean {
    const expiry = Date.parse(quote.expiresAt);
    return Number.isFinite(expiry) && expiry > at;
  }

  /**
   * Validates an observed payment against a designated quote.
   */
  async validatePaymentAgainstQuote(
    quoteId: string,
    payment: {
      amount: string;
      asset: string;
      network: string;
      chainFamily: X402ChainFamily;
      payTo: string;
    },
  ): Promise<ValidateQuoteResult> {
    const quote = await this.getQuote(quoteId);
    if (!quote) {
      return { valid: false, reason: "Quote not found" };
    }

    if (!this.isQuoteActive(quote)) {
      return { valid: false, quote, reason: "Quote has expired" };
    }

    if (quote.chainFamily !== payment.chainFamily) {
      return {
        valid: false,
        quote,
        reason: `Chain family mismatch: quote is for ${quote.chainFamily}, got ${payment.chainFamily}`,
      };
    }

    if (quote.network.toLowerCase() !== payment.network.toLowerCase()) {
      return {
        valid: false,
        quote,
        reason: `Network mismatch: quote is for ${quote.network}, got ${payment.network}`,
      };
    }

    if (quote.asset.toLowerCase() !== payment.asset.toLowerCase()) {
      return {
        valid: false,
        quote,
        reason: `Asset mismatch: quote is for ${quote.asset}, got ${payment.asset}`,
      };
    }

    const payToMatches =
      payment.chainFamily === "stellar"
        ? quote.payTo === payment.payTo
        : quote.payTo.toLowerCase() === payment.payTo.toLowerCase();

    if (!payToMatches) {
      return {
        valid: false,
        quote,
        reason: "Recipient mismatch against quote",
      };
    }

    const normalizedQuoteAmount = quote.amount.replace(/^\$/, "");
    const normalizedPaymentAmount = payment.amount.replace(/^\$/, "");
    if (normalizedQuoteAmount !== normalizedPaymentAmount) {
      return {
        valid: false,
        quote,
        reason: `Amount mismatch: quote requires ${quote.amount}, received ${payment.amount}`,
      };
    }

    return { valid: true, quote };
  }
}

export const pricingEngine = new PricingEngine();
