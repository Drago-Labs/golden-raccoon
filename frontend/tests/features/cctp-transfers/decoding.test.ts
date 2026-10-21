import { describe, expect, it } from "vitest";
import { decodeBurnMessageBody, decodeMessageHeader } from "@/server/research/cctp-transfers/messageFormat";
import { decodeSourceBurn } from "@/server/research/cctp-transfers/sourceDecoder";
import { addressToBytes32, buildCctpMessageHex, buildDepositForBurnLog, buildMessageSentLog, stubRpcFetch } from "./fixtures";

const SAMPLE_MESSAGE = buildCctpMessageHex({
  sourceDomain: 0,
  destinationDomain: 27,
  nonceHex: "c5d43240e77e25a22dd8e0b06998101f7880795739a2c5bdb31a4d3a0907a5b6".slice(0, 64),
  senderAddress: "0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa",
  recipientBytes32: addressToBytes32("0x0000000000000000000000000000000000000001"),
  burnTokenAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
  mintRecipientBytes32: addressToBytes32("0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4"),
  amountBaseUnits: "500000",
  messageSenderAddress: "0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4",
  maxFeeBaseUnits: "50",
  feeExecutedBaseUnits: "50",
  expirationBlock: "513588595",
});

describe("decodeMessageHeader / decodeBurnMessageBody", () => {
  it("round-trips a real-shaped CCTP V2 message", () => {
    const header = decodeMessageHeader(SAMPLE_MESSAGE);
    expect(header).not.toBeNull();
    expect(header?.sourceDomain).toBe(0);
    expect(header?.destinationDomain).toBe(27);
    expect(header?.minFinalityThreshold).toBe(1000);

    const body = decodeBurnMessageBody(header!.messageBodyHex);
    expect(body).not.toBeNull();
    expect(body?.amountBaseUnits).toBe("500000");
    expect(body?.maxFeeBaseUnits).toBe("50");
    expect(body?.feeExecutedBaseUnits).toBe("50");
  });

  it("returns null for a message shorter than the fixed header", () => {
    expect(decodeMessageHeader("0x1234")).toBeNull();
  });

  it("returns null for a body shorter than the fixed burn-message length", () => {
    expect(decodeBurnMessageBody("0x1234")).toBeNull();
  });
});

describe("decodeSourceBurn", () => {
  it("decodes a completed burn from a transaction receipt", async () => {
    const depositLog = buildDepositForBurnLog({
      burnTokenAddress: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238",
      amountBaseUnits: "500000",
      depositorAddress: "0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4",
      mintRecipientBytes32: addressToBytes32("0xb38782d98c07f3608ea5d6f24daa0c1458e2b2d4"),
      destinationDomain: 27,
      maxFeeBaseUnits: "50",
      minFinalityThreshold: 1000,
    });
    const messageSentLog = buildMessageSentLog(SAMPLE_MESSAGE);

    const fetchImpl = stubRpcFetch({ receipt: { status: "0x1", blockNumber: "0xb66c15", logs: [depositLog, messageSentLog] } });

    const result = await decodeSourceBurn("Ethereum", 0, "0xabc", "testnet", fetchImpl);

    expect(result.state).toBe("completed");
    expect(result.amountBaseUnits).toBe("500000");
    expect(result.destinationDomain).toBe(27);
    expect(result.destinationChain).toBe("Stellar");
    expect(result.burnTokenAddress).toBe("0x1c7d4b196cb0c7b01d743fbc6116a902379c7238");
  });

  it("reports pending when the transaction is not yet mined", async () => {
    const fetchImpl = stubRpcFetch({ receipt: null });
    const result = await decodeSourceBurn("Ethereum", 0, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("pending");
  });

  it("reports failed when the transaction reverted", async () => {
    const fetchImpl = stubRpcFetch({ receipt: { status: "0x0", blockNumber: "0x1", logs: [] } });
    const result = await decodeSourceBurn("Ethereum", 0, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("failed");
  });

  it("reports unknown for a source chain with no configured RPC", async () => {
    const fetchImpl = stubRpcFetch({});
    const result = await decodeSourceBurn("Noble", 4, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("unknown");
    expect(result.issues[0]).toMatch(/No RPC endpoint/);
  });

  it("reports unknown when the receipt has no CCTP logs", async () => {
    const fetchImpl = stubRpcFetch({ receipt: { status: "0x1", blockNumber: "0x1", logs: [] } });
    const result = await decodeSourceBurn("Ethereum", 0, "0xabc", "testnet", fetchImpl);
    expect(result.state).toBe("unknown");
  });
});
