import { describe, expect, it } from "vitest";
import { CctpTransferError } from "@/server/research/cctp-transfers/errors";
import { trackCctpTransfer } from "@/server/research/cctp-transfers/service";
import { noopDeps, request } from "./fixtures";

describe("trackCctpTransfer", () => {
  it("rejects a malformed request", async () => {
    await expect(trackCctpTransfer({ sourceChain: "Ethereum" }, noopDeps())).rejects.toBeInstanceOf(CctpTransferError);
  });

  it("rejects an unrecognized source chain", async () => {
    await expect(trackCctpTransfer(request({ sourceChain: "Not A Chain" }), noopDeps())).rejects.toMatchObject({ code: "unknown_source_chain" });
  });

  it("builds a complete report when burn, attestation, and destination all succeed", async () => {
    const deps = {
      ...noopDeps(),
      decodeSourceBurn: async () => ({
        state: "completed" as const,
        blockNumber: 100,
        nonce: `0x${"a".repeat(64)}`,
        burnTokenAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
        depositorAddress: "0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4",
        mintRecipientRaw: `0x${"0".repeat(64)}`,
        mintRecipientDisplay: "CAAAA",
        destinationDomain: 27,
        destinationChain: "Stellar",
        maxFeeBaseUnits: "50",
        minFinalityThreshold: 1000,
        amountBaseUnits: "500000",
        rawMessageHex: "0x00",
        issues: [],
      }),
      fetchAttestation: async () => ({
        state: "completed" as const,
        status: "complete" as const,
        feeExecutedBaseUnits: "50",
        cctpVersion: 2,
        destinationMintTxHashReported: "stellar-hash",
        attestedMessageHex: null,
        issues: [],
      }),
      checkStellarNonceUsed: async () => ({ state: "completed" as const, destinationChain: "Stellar", nonceUsed: true, issues: [] }),
    };

    const report = await trackCctpTransfer(request(), deps);

    expect(report.coverage.state).toBe("complete");
    expect(report.amountReconciliation.netAmountBaseUnits).toBe("499950");
    expect(report.destination.destinationChain).toBe("Stellar");
    expect(report.transferVerdict).toBeNull();
  });

  it("routes an EVM destination domain to checkEvmNonceUsed, not checkStellarNonceUsed", async () => {
    let evmCalled = false;
    let stellarCalled = false;
    const deps = {
      ...noopDeps(),
      decodeSourceBurn: async () => ({
        state: "completed" as const,
        blockNumber: 1,
        nonce: `0x${"b".repeat(64)}`,
        burnTokenAddress: null,
        depositorAddress: null,
        mintRecipientRaw: null,
        mintRecipientDisplay: null,
        destinationDomain: 6,
        destinationChain: "Base",
        maxFeeBaseUnits: "0",
        minFinalityThreshold: 1000,
        amountBaseUnits: "1000",
        rawMessageHex: null,
        issues: [],
      }),
      fetchAttestation: async () => ({ state: "pending" as const, status: "pending_confirmations" as const, feeExecutedBaseUnits: null, cctpVersion: 2, destinationMintTxHashReported: null, attestedMessageHex: null, issues: [] }),
      checkEvmNonceUsed: async (destination: { chainName: string }) => {
        evmCalled = true;
        return { state: "pending" as const, destinationChain: destination.chainName, nonceUsed: false, issues: [] };
      },
      checkStellarNonceUsed: async () => {
        stellarCalled = true;
        return { state: "unknown" as const, destinationChain: "Stellar", nonceUsed: null, issues: [] };
      },
    };

    await trackCctpTransfer(request(), deps);

    expect(evmCalled).toBe(true);
    expect(stellarCalled).toBe(false);
  });

  it("leaves the destination unknown when the burn never resolved a nonce", async () => {
    const report = await trackCctpTransfer(request(), noopDeps());
    expect(report.destination.state).toBe("unknown");
    expect(report.coverage.state).toBe("unavailable");
  });
});
