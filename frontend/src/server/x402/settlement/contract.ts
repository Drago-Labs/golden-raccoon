import type { X402ChainFamily } from "@/server/types";
import { proofConsumer, ProofConsumer } from "@/server/x402/settlement/consume";
import { settlementLedger, SettlementLedger } from "@/server/x402/settlement/ledger";
import { receiptManager, ReceiptManager, type VerifiableReceipt } from "@/server/x402/settlement/receipts";
import type {
  SettlementObservation,
  SettlementRecord,
  SettlementRequest,
} from "@/server/x402/settlement/types";
import { pricingEngine, PricingEngine } from "@/server/x402/metering/pricing";
import { usageTracker, UsageTracker } from "@/server/x402/metering/usage";
import { quotaEnforcer, QuotaEnforcer } from "@/server/x402/metering/quota";
import { memoryX402Store } from "@/server/x402/store/memory";
import type { X402Store, X402StoreFilter } from "@/server/x402/store/store";

export interface SettlementContract {
  readonly chainFamily: X402ChainFamily;
  begin(
    request: SettlementRequest,
    quoteId?: string,
  ): Promise<{ record: SettlementRecord; idempotent: boolean }>;
  consumeProof(proof: string, settlementId: string): Promise<void>;
  reconcile(
    idempotencyKey: string,
    observation: SettlementObservation,
  ): Promise<SettlementRecord>;
  deliverWork(
    idempotencyKey: string,
    resource: string,
    result: unknown,
    payer?: string,
  ): Promise<{ record: SettlementRecord; receipt: VerifiableReceipt }>;
  recordWorkFailure(idempotencyKey: string, reason: string): Promise<SettlementRecord>;
  redeemReceipt(
    receiptId: string,
    requestedResource: string,
    now?: number,
  ): Promise<{ receipt: VerifiableReceipt; result: unknown }>;
  getOwedRefunds(payer?: string): Promise<SettlementRecord[]>;
  processRefund(idempotencyKey: string): Promise<SettlementRecord>;
  getSettlement(idempotencyKey: string): Promise<SettlementRecord | null>;
  listSettlements(filter?: X402StoreFilter): Promise<SettlementRecord[]>;
}

/**
 * Universal implementation of the settlement contract suite shared identically by EVM and Stellar schemes.
 */
export class UniversalSettlementContract implements SettlementContract {
  constructor(
    public readonly chainFamily: X402ChainFamily,
    private readonly ledger: SettlementLedger = settlementLedger,
    private readonly consumer: ProofConsumer = proofConsumer,
    private readonly receipts: ReceiptManager = receiptManager,
    private readonly pricing: PricingEngine = pricingEngine,
    private readonly usage: UsageTracker = usageTracker,
    private readonly quota: QuotaEnforcer = quotaEnforcer,
    private readonly store: X402Store = memoryX402Store,
  ) {}

  /**
   * Initializes a settlement record, optionally verifying an active price quote.
   */
  async begin(
    request: SettlementRequest,
    quoteId?: string,
  ): Promise<{ record: SettlementRecord; idempotent: boolean }> {
    if (request.chainFamily !== this.chainFamily) {
      throw new Error(
        `Settlement contract chain family mismatch: expected ${this.chainFamily}, got ${request.chainFamily}`,
      );
    }

    if (quoteId) {
      const quoteValidation = await this.pricing.validatePaymentAgainstQuote(quoteId, {
        amount: request.amount,
        asset: request.asset,
        network: request.network,
        chainFamily: request.chainFamily,
        payTo: request.payTo,
      });
      if (!quoteValidation.valid) {
        throw new Error(`Quote validation failed: ${quoteValidation.reason}`);
      }
      request.priceQuoted = quoteValidation.quote?.priceUsd;
    }

    if (request.payer) {
      const quotaStatus = await this.quota.checkQuota(
        request.payer,
        this.chainFamily,
        Number(request.amount),
      );
      if (!quotaStatus.allowed) {
        throw new Error(quotaStatus.reason ?? "Quota exceeded");
      }
    }

    return this.ledger.begin(request);
  }

  /**
   * Atomically consumes a payment proof ensuring sequential and concurrent duplicate presentations fail.
   */
  async consumeProof(proof: string, settlementId: string): Promise<void> {
    return this.consumer.consumeProof(proof, settlementId, this.chainFamily);
  }

  /**
   * Reconciles observed chain payment details against the settlement specification.
   */
  async reconcile(
    idempotencyKey: string,
    observation: SettlementObservation,
  ): Promise<SettlementRecord> {
    if (observation.chainFamily !== this.chainFamily) {
      throw new Error(
        `Observation chain family mismatch: expected ${this.chainFamily}, got ${observation.chainFamily}`,
      );
    }
    const record = await this.ledger.reconcile(idempotencyKey, observation);
    return record;
  }

  /**
   * Completes settlement by delivering work, issuing a signed receipt, and recording usage.
   */
  async deliverWork(
    idempotencyKey: string,
    resource: string,
    result: unknown,
    payer?: string,
  ): Promise<{ record: SettlementRecord; receipt: VerifiableReceipt }> {
    const settlement = this.ledger.get(idempotencyKey);
    if (!settlement) {
      throw new Error(`Settlement ${idempotencyKey} not found`);
    }

    const receipt = await this.receipts.issueReceipt({
      settlementId: settlement.id,
      resource,
      result,
      payer: payer ?? settlement.payerRaw,
    });

    const record = await this.ledger.bindWork(idempotencyKey, {
      receiptId: receipt.id,
      resultHash: receipt.resultHash,
    });

    const activePayer = payer ?? settlement.payerRaw;
    if (activePayer) {
      await this.usage.recordSettlementUsage(activePayer, this.chainFamily, {
        amount: record.amount,
        canonicalAsset: record.canonicalAsset,
        success: true,
      });
      await this.quota.consume(activePayer, this.chainFamily, Number(record.amount));
    }

    return { record, receipt };
  }

  /**
   * Marks a settled payment as owed due to a downstream failure in delivering the work.
   */
  async recordWorkFailure(idempotencyKey: string, reason: string): Promise<SettlementRecord> {
    const record = await this.ledger.recordWorkFailure(idempotencyKey, reason);
    if (record.payerRaw) {
      await this.usage.recordSettlementUsage(record.payerRaw, this.chainFamily, {
        amount: record.amount,
        canonicalAsset: record.canonicalAsset,
        success: false,
      });
    }
    return record;
  }

  /**
   * Redeems a verifiable receipt within its retention window for the designated resource.
   */
  async redeemReceipt(
    receiptId: string,
    requestedResource: string,
    now?: number,
  ): Promise<{ receipt: VerifiableReceipt; result: unknown }> {
    return this.receipts.redeemReceipt({ receiptId, requestedResource, now });
  }

  /**
   * Lists all settlements recorded as owed for refund processing.
   */
  async getOwedRefunds(payer?: string): Promise<SettlementRecord[]> {
    const allOwed = this.ledger.listOwed().filter((r) => r.chainFamily === this.chainFamily);
    if (!payer) return allOwed;
    return allOwed.filter(
      (r) =>
        r.payerRaw?.toLowerCase() === payer.toLowerCase() ||
        r.payerRedacted?.toLowerCase() === payer.toLowerCase(),
    );
  }

  /**
   * Transitions an owed settlement record to refunded status.
   */
  async processRefund(idempotencyKey: string): Promise<SettlementRecord> {
    return this.ledger.refund(idempotencyKey);
  }

  /**
   * Retrieves a settlement record by idempotency key.
   */
  async getSettlement(idempotencyKey: string): Promise<SettlementRecord | null> {
    return this.ledger.get(idempotencyKey);
  }

  /**
   * Lists settlement records filtered by criteria.
   */
  async listSettlements(filter?: X402StoreFilter): Promise<SettlementRecord[]> {
    const list = this.ledger.list().filter((r) => r.chainFamily === this.chainFamily);
    if (!filter) return list;
    return list.filter((r) => {
      if (filter.status && r.status !== filter.status) return false;
      if (filter.owed !== undefined && Boolean(r.owed) !== filter.owed) return false;
      if (filter.resource && r.protectedResource !== filter.resource) return false;
      if (filter.payer) {
        const matches =
          r.payerRaw?.toLowerCase() === filter.payer.toLowerCase() ||
          r.payerRedacted?.toLowerCase() === filter.payer.toLowerCase();
        if (!matches) return false;
      }
      return true;
    });
  }
}

export const evmSettlementContract = new UniversalSettlementContract("evm");
export const stellarSettlementContract = new UniversalSettlementContract("stellar");
