import { describe, expect, it, vi } from "vitest";
import { fetchAttestation } from "@/server/research/cctp-transfers/attestationClient";
import { addressToBytes32, buildCctpMessageHex, stubIrisFetch } from "./fixtures";

describe("fetchAttestation", () => {
  it("parses a complete message, including the Circle-reported destination mint tx hash", async () => {
    const message = buildCctpMessageHex({
      sourceDomain: 0,
      destinationDomain: 27,
      nonceHex: "a".repeat(64),
      senderAddress: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
      recipientBytes32: addressToBytes32("0x0000000000000000000000000000000000000001"),
      burnTokenAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
      mintRecipientBytes32: addressToBytes32("0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4"),
      amountBaseUnits: "500000",
      messageSenderAddress: "0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4",
      maxFeeBaseUnits: "50",
      feeExecutedBaseUnits: "50",
    });

    const fetchImpl = stubIrisFetch({
      messages: [{ message, eventNonce: "0xaaaa", cctpVersion: 2, status: "complete", destinationMintTxHash: "stellar-tx-hash" }],
      sourceTxHash: "0xabc",
    });

    const result = await fetchAttestation(0, "0xabc", "testnet", fetchImpl);

    expect(result.state).toBe("completed");
    expect(result.status).toBe("complete");
    expect(result.feeExecutedBaseUnits).toBe("50");
    expect(result.destinationMintTxHashReported).toBe("stellar-tx-hash");
  });

  it("reports pending on a 404 (not yet observed by Circle)", async () => {
    const fetchImpl = stubIrisFetch({ error: "Message not found for provided parameters" }, 404);
    const result = await fetchAttestation(0, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("pending");
    expect(result.status).toBe("not_found");
  });

  it("reports unknown on a rate limit response", async () => {
    const fetchImpl = stubIrisFetch({}, 429);
    const result = await fetchAttestation(0, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("unknown");
  });

  it("reports pending_confirmations without a fee until Circle attests", async () => {
    const message = buildCctpMessageHex({
      sourceDomain: 0,
      destinationDomain: 27,
      nonceHex: "b".repeat(64),
      senderAddress: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
      recipientBytes32: addressToBytes32("0x0000000000000000000000000000000000000001"),
      burnTokenAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
      mintRecipientBytes32: addressToBytes32("0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4"),
      amountBaseUnits: "500000",
      messageSenderAddress: "0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4",
    });
    const fetchImpl = stubIrisFetch({ messages: [{ message, status: "pending_confirmations" }], sourceTxHash: "0xabc" });
    const result = await fetchAttestation(0, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("pending");
    expect(result.status).toBe("pending_confirmations");
  });

  it("reports unknown when the request times out", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("AbortError"))) as unknown as typeof fetch;
    const result = await fetchAttestation(0, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("unknown");
  });
});
