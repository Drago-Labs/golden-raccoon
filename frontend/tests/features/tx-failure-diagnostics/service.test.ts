import { describe, expect, it, vi } from "vitest";
import { coverageNotice } from "@/server/research/tx-failure-diagnostics/coverage";
import { TxFailureDiagnosticsError } from "@/server/research/tx-failure-diagnostics/errors";
import { diagnoseFailedTransaction } from "@/server/research/tx-failure-diagnostics";
import { TX_FAILURE_LIMITS } from "@/server/research/tx-failure-diagnostics/limits";
import { assertNetworkPassphrase } from "@/server/research/tx-failure-diagnostics/networkIdentity";
import { txFailureRequestSchema } from "@/server/research/tx-failure-diagnostics/schema";
import { badSequenceFixture, depsFor, feeBumpFixture, unavailableDeps, underfundedFixture } from "./fixtures";

describe("diagnoseFailedTransaction", () => {
  it("explains underfunded evidence when the failure ledger snapshot is present", async () => {
    const report = await diagnoseFailedTransaction(
      { hash: underfundedFixture.hash, network: "stellar-testnet" },
      depsFor(underfundedFixture),
    );

    expect(report.state).toBe("complete");
    expect(report.transactionCode).toBe("tx_failed");
    expect(report.transactionLevel).toBe(false);
    expect(report.operations.map((operation) => operation.outcome)).toEqual([
      "would_succeed_alone",
      "aborted_transaction",
      "not_attempted",
    ]);
    expect(report.stateEvidence[0]?.status).toBe("historical");
    expect(report.stateEvidence[0]?.note).toMatch(/Spendable above the base reserve/);
    expect(report.signsOrRetries).toBe(false);
    expect(report.coverageNotice).toBe(coverageNotice("complete", []));
  });

  it("keeps a bad sequence at transaction level", async () => {
    const report = await diagnoseFailedTransaction(
      { hash: badSequenceFixture.hash, network: "stellar-testnet" },
      depsFor(badSequenceFixture),
    );

    expect(report.transactionCode).toBe("tx_bad_seq");
    expect(report.transactionLevel).toBe(true);
    expect(report.operations[0]?.outcome).toBe("not_attempted");
    expect(report.stateEvidence[0]?.note).toMatch(/does not match the envelope/);
  });

  it("labels a fee bump with missing historical state as partial", async () => {
    const report = await diagnoseFailedTransaction(
      { hash: feeBumpFixture.hash, network: "stellar-testnet" },
      depsFor(feeBumpFixture),
    );

    expect(report.state).toBe("partial");
    expect(report.feeBump?.outerCode).toBe("tx_fee_bump_inner_failed");
    expect(report.feeBump?.innerCode).toBe("tx_failed");
    expect(report.coverageNotice).toMatch(/partial/i);
    expect(report.coverageNotice).toMatch(/not replaced with a guessed cause/i);
    expect(report.stateEvidence.every((entry) => entry.status === "missing")).toBe(true);
  });

  it("returns unavailable without operation guesses when the provider is down", async () => {
    const report = await diagnoseFailedTransaction(
      { hash: underfundedFixture.hash, network: "stellar-testnet" },
      unavailableDeps(),
    );

    expect(report.state).toBe("unavailable");
    expect(report.operations).toEqual([]);
    expect(report.transactionCode).toBeNull();
    expect(report.coverageNotice).toMatch(/No cause is inferred/);
  });

  it("rejects a pubnet passphrase on a testnet request before reading", async () => {
    const readTransaction = vi.fn(async () => ({ status: "missing" as const }));
    await expect(
      diagnoseFailedTransaction(
        {
          hash: underfundedFixture.hash,
          network: "stellar-testnet",
          passphrase: "Public Global Stellar Network ; September 2015",
        },
        { readTransaction, readAccount: async () => ({ status: "missing" }) },
      ),
    ).rejects.toBeInstanceOf(TxFailureDiagnosticsError);
    expect(readTransaction).not.toHaveBeenCalled();
    expect(txFailureRequestSchema.safeParse({ hash: "abc", network: "stellar-testnet" }).success).toBe(false);
    expect(() => assertNetworkPassphrase("stellar-pubnet", "Test SDF Network ; September 2015")).toThrow(
      TxFailureDiagnosticsError,
    );
    expect(TX_FAILURE_LIMITS.maxOperations).toBeGreaterThan(0);
  });
});
