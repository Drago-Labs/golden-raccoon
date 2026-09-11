import { describe, expect, it } from "vitest";
import { ProofConsumer, ProofAlreadyConsumedError } from "@/server/x402/settlement/consume";
import { MemoryX402Store } from "@/server/x402/store/memory";

describe("x402 payment proof consumption and replay prevention", () => {
  it("accepts a proof once and rejects sequential duplicate presentation", async () => {
    const store = new MemoryX402Store();
    const consumer = new ProofConsumer(store);
    const proof = "sig_0xabcdef1234567890abcdef1234567890";

    expect(await consumer.isProofConsumed(proof)).toBe(false);

    await expect(consumer.consumeProof(proof, "set_1", "evm")).resolves.toBeUndefined();
    expect(await consumer.isProofConsumed(proof)).toBe(true);

    await expect(consumer.consumeProof(proof, "set_2", "evm")).rejects.toBeInstanceOf(
      ProofAlreadyConsumedError,
    );
  });

  it("ensures concurrent presentations of the same proof succeed exactly once", async () => {
    const store = new MemoryX402Store();
    const consumer = new ProofConsumer(store);
    const proof = "stellar_proof_base64_payload_string_to_test";

    const attempts = 10;
    const promises = Array.from({ length: attempts }, (_, index) =>
      consumer.consumeProof(proof, `set_${index}`, "stellar"),
    );

    const results = await Promise.allSettled(promises);

    const successful = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    expect(successful).toHaveLength(1);
    expect(failed).toHaveLength(attempts - 1);

    for (const failure of failed) {
      if (failure.status === "rejected") {
        expect(failure.reason).toBeInstanceOf(ProofAlreadyConsumedError);
      }
    }
  });

  it("allows different proofs to be consumed concurrently without contention", async () => {
    const store = new MemoryX402Store();
    const consumer = new ProofConsumer(store);

    const proofs = ["proof_alpha", "proof_beta", "proof_gamma", "proof_delta"];
    const results = await Promise.allSettled(
      proofs.map((proof, index) => consumer.consumeProof(proof, `set_${index}`, "evm")),
    );

    const successful = results.filter((r) => r.status === "fulfilled");
    expect(successful).toHaveLength(proofs.length);
  });
});
