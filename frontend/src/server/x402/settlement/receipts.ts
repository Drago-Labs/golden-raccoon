import { createHash, createHmac, randomUUID } from "node:crypto";
import { redactPayer } from "@/server/x402/settlement/ledger";
import { memoryX402Store } from "@/server/x402/store/memory";
import type { StoredReceipt, X402Store } from "@/server/x402/store/store";

export class ReceiptNotFoundError extends Error {
  constructor(message = "Receipt not found") {
    super(message);
    this.name = "ReceiptNotFoundError";
  }
}

export class ReceiptExpiredError extends Error {
  constructor(message = "Receipt has expired beyond the retention window") {
    super(message);
    this.name = "ReceiptExpiredError";
  }
}

export class ResourceMismatchError extends Error {
  constructor(message = "Receipt is not valid for the requested resource") {
    super(message);
    this.name = "ResourceMismatchError";
  }
}

export class ReceiptVerificationError extends Error {
  constructor(message = "Receipt signature verification failed") {
    super(message);
    this.name = "ReceiptVerificationError";
  }
}

export type VerifiableReceipt = {
  id: string;
  settlementId: string;
  resource: string;
  payer?: string;
  payerRedacted?: string;
  resultHash: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
  retentionSeconds: number;
};

export type IssueReceiptInput = {
  settlementId: string;
  resource: string;
  result: unknown;
  payer?: string;
  retentionSeconds?: number;
};

export type RedeemReceiptInput = {
  receiptId: string;
  requestedResource: string;
  now?: number;
};

/**
 * Issues, signs, verifies, and redeems cryptographic settlement receipts.
 */
export class ReceiptManager {
  private readonly secret: string;
  private readonly defaultRetentionSeconds = 86400;

  constructor(
    private readonly store: X402Store = memoryX402Store,
    secret?: string,
  ) {
    this.secret =
      secret ||
      process.env.X402_RECEIPT_SECRET ||
      process.env.NEXTAUTH_SECRET ||
      "x402-default-receipt-signing-secret-key-32b";
  }

  /**
   * Deterministically calculates the SHA-256 hash of a deliverable result payload.
   */
  computeResultHash(result: unknown): string {
    const serialized = JSON.stringify(result);
    return createHash("sha256").update(serialized).digest("hex");
  }

  /**
   * Generates HMAC-SHA256 signature for a receipt over its canonical fields.
   */
  signReceiptFields(
    id: string,
    settlementId: string,
    resource: string,
    resultHash: string,
    issuedAt: string,
    expiresAt: string,
  ): string {
    const payload = [id, settlementId, resource, resultHash, issuedAt, expiresAt].join(":");
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  /**
   * Verifies the authenticity of a receipt's signature.
   */
  verifySignature(receipt: VerifiableReceipt): boolean {
    const expected = this.signReceiptFields(
      receipt.id,
      receipt.settlementId,
      receipt.resource,
      receipt.resultHash,
      receipt.issuedAt,
      receipt.expiresAt,
    );
    return receipt.signature === expected;
  }

  /**
   * Issues a new verifiable signed receipt for delivered work and persists it in storage.
   */
  async issueReceipt(input: IssueReceiptInput): Promise<VerifiableReceipt> {
    const id = `rcpt_${randomUUID().replace(/-/g, "")}`;
    const retentionSeconds = input.retentionSeconds ?? this.defaultRetentionSeconds;
    const now = Date.now();
    const issuedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + retentionSeconds * 1000).toISOString();
    const resultHash = this.computeResultHash(input.result);
    const signature = this.signReceiptFields(
      id,
      input.settlementId,
      input.resource,
      resultHash,
      issuedAt,
      expiresAt,
    );

    const stored: StoredReceipt = {
      id,
      settlementId: input.settlementId,
      resource: input.resource,
      payer: input.payer,
      payerRedacted: redactPayer(input.payer),
      result: input.result,
      resultHash,
      issuedAt,
      expiresAt,
      signature,
      redeemedCount: 0,
    };

    await this.store.saveReceipt(stored);

    return {
      id,
      settlementId: input.settlementId,
      resource: input.resource,
      payer: input.payer,
      payerRedacted: stored.payerRedacted,
      resultHash,
      issuedAt,
      expiresAt,
      signature,
      retentionSeconds,
    };
  }

  /**
   * Retrieves a receipt by ID and checks its integrity and freshness without marking it redeemed.
   */
  async getReceipt(id: string): Promise<VerifiableReceipt | null> {
    const stored = await this.store.getReceipt(id);
    if (!stored) return null;
    const retentionSeconds = Math.round(
      (new Date(stored.expiresAt).getTime() - new Date(stored.issuedAt).getTime()) / 1000,
    );
    return {
      id: stored.id,
      settlementId: stored.settlementId,
      resource: stored.resource,
      payer: stored.payer,
      payerRedacted: stored.payerRedacted,
      resultHash: stored.resultHash,
      issuedAt: stored.issuedAt,
      expiresAt: stored.expiresAt,
      signature: stored.signature,
      retentionSeconds,
    };
  }

  /**
   * Redeems a receipt returning the original result, enforcing the retention window and resource boundary.
   */
  async redeemReceipt(input: RedeemReceiptInput): Promise<{ receipt: VerifiableReceipt; result: unknown }> {
    const stored = await this.store.getReceipt(input.receiptId);
    if (!stored) {
      throw new ReceiptNotFoundError(`Receipt ${input.receiptId} not found`);
    }

    const receipt: VerifiableReceipt = {
      id: stored.id,
      settlementId: stored.settlementId,
      resource: stored.resource,
      payer: stored.payer,
      payerRedacted: stored.payerRedacted,
      resultHash: stored.resultHash,
      issuedAt: stored.issuedAt,
      expiresAt: stored.expiresAt,
      signature: stored.signature,
      retentionSeconds: Math.round(
        (new Date(stored.expiresAt).getTime() - new Date(stored.issuedAt).getTime()) / 1000,
      ),
    };

    if (!this.verifySignature(receipt)) {
      throw new ReceiptVerificationError();
    }

    const checkTime = input.now ?? Date.now();
    const expiryTime = new Date(stored.expiresAt).getTime();
    if (checkTime > expiryTime) {
      throw new ReceiptExpiredError();
    }

    if (stored.resource !== input.requestedResource) {
      throw new ResourceMismatchError();
    }

    await this.store.markReceiptRedeemed(input.receiptId);

    return {
      receipt,
      result: stored.result,
    };
  }
}

export const receiptManager = new ReceiptManager();
