import assert from "node:assert";
import { proofConsumer, ProofAlreadyConsumedError } from "../src/server/x402/settlement/consume";

/**
 * Verifies sequential and concurrent payment proof replay rejection.
 */
async function main(): Promise<void> {
  console.log("Starting x402 payment proof replay prevention checks...");

  const sequentialProof = `seq_proof_${Date.now()}`;
  await proofConsumer.consumeProof(sequentialProof, "set_seq_1", "evm");

  let caughtSequential = false;
  try {
    await proofConsumer.consumeProof(sequentialProof, "set_seq_2", "evm");
  } catch (err) {
    if (err instanceof ProofAlreadyConsumedError) caughtSequential = true;
  }
  assert(caughtSequential, "Sequential replay of proof must be rejected with ProofAlreadyConsumedError");

  const concurrentProof = `conc_proof_${Date.now()}`;
  const concurrencyCount = 10;
  const attempts = await Promise.allSettled(
    Array.from({ length: concurrencyCount }, (_, i) =>
      proofConsumer.consumeProof(concurrentProof, `set_conc_${i}`, "stellar"),
    ),
  );

  const fulfilled = attempts.filter((r) => r.status === "fulfilled");
  const rejected = attempts.filter((r) => r.status === "rejected");

  assert.strictEqual(fulfilled.length, 1, "Exactly one concurrent presentation must succeed");
  assert.strictEqual(rejected.length, concurrencyCount - 1, "All concurrent duplicates must be rejected");

  for (const failure of rejected) {
    if (failure.status === "rejected") {
      assert(
        failure.reason instanceof ProofAlreadyConsumedError,
        "All failures must be ProofAlreadyConsumedError",
      );
    }
  }

  console.log("All x402 payment proof replay prevention checks passed successfully.");
}

main().catch((err) => {
  console.error("x402 replay check failed:", err);
  process.exit(1);
});
