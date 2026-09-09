import { createHash } from "node:crypto";
import type { X402ChainFamily } from "@/server/types";
import { memoryX402Store } from "@/server/x402/store/memory";
import type { X402Store } from "@/server/x402/store/store";

export class ProofAlreadyConsumedError extends Error {
  constructor(message = "Payment proof has already been consumed") {
    super(message);
    this.name = "ProofAlreadyConsumedError";
  }
}

/**
 * Manages atomic consumption of payment proofs preventing sequential and concurrent reuse.
 */
export class ProofConsumer {
  private readonly inFlightLocks = new Map<string, Promise<void>>();

  constructor(private readonly store: X402Store = memoryX402Store) {}

  /**
   * Computes a deterministic SHA-256 hash representing a raw payment proof string.
   */
  deriveProofHash(proof: string): string {
    const normalized = proof.trim();
    return createHash("sha256").update(normalized).digest("hex");
  }

  private async serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.inFlightLocks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.inFlightLocks.set(key, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.inFlightLocks.get(key) === queued) {
        this.inFlightLocks.delete(key);
      }
    }
  }

  /**
   * Atomically records a payment proof as consumed, throwing an error if it was already consumed.
   */
  async consumeProof(
    proof: string,
    settlementId: string,
    chainFamily: X402ChainFamily,
  ): Promise<void> {
    const proofHash = this.deriveProofHash(proof);
    await this.serialize(proofHash, async () => {
      const alreadyPresent = await this.store.hasProof(proofHash);
      if (alreadyPresent) {
        throw new ProofAlreadyConsumedError();
      }
      const consumed = await this.store.consumeProof(proofHash, settlementId, chainFamily);
      if (!consumed) {
        throw new ProofAlreadyConsumedError();
      }
    });
  }

  /**
   * Checks whether a payment proof has already been consumed.
   */
  async isProofConsumed(proof: string): Promise<boolean> {
    const proofHash = this.deriveProofHash(proof);
    return this.store.hasProof(proofHash);
  }
}

export const proofConsumer = new ProofConsumer();
