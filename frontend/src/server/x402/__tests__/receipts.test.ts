import { describe, expect, it } from "vitest";
import {
  ReceiptManager,
  ReceiptExpiredError,
  ReceiptNotFoundError,
  ResourceMismatchError,
  ReceiptVerificationError,
} from "@/server/x402/settlement/receipts";
import { MemoryX402Store } from "@/server/x402/store/memory";

describe("x402 verifiable settlement receipts", () => {
  it("issues a verifiable receipt and redeems to original result within retention window", async () => {
    const store = new MemoryX402Store();
    const manager = new ReceiptManager(store, "secret-key-12345");
    const resultPayload = {
      score: 95,
      findings: ["contract verified", "no reentrancy"],
      scannedAt: 123456789,
    };

    const receipt = await manager.issueReceipt({
      settlementId: "set_100",
      resource: "/api/x402/deep-scan",
      result: resultPayload,
      payer: "0x1111222233334444555566667777888899990000",
      retentionSeconds: 300,
    });

    expect(receipt.id).toMatch(/^rcpt_/);
    expect(receipt.resource).toBe("/api/x402/deep-scan");
    expect(receipt.payerRedacted).toBe("0x1111...0000");
    expect(receipt.signature).toBeTruthy();
    expect(manager.verifySignature(receipt)).toBe(true);

    const redeemed = await manager.redeemReceipt({
      receiptId: receipt.id,
      requestedResource: "/api/x402/deep-scan",
      now: Date.now(),
    });

    expect(redeemed.receipt.id).toBe(receipt.id);
    expect(redeemed.result).toEqual(resultPayload);
  });

  it("refuses a receipt when requested for a different resource boundary", async () => {
    const store = new MemoryX402Store();
    const manager = new ReceiptManager(store, "secret-key-12345");

    const receipt = await manager.issueReceipt({
      settlementId: "set_101",
      resource: "/api/x402/deep-scan",
      result: { ok: true },
    });

    await expect(
      manager.redeemReceipt({
        receiptId: receipt.id,
        requestedResource: "/api/x402/other-endpoint",
      }),
    ).rejects.toBeInstanceOf(ResourceMismatchError);
  });

  it("refuses a receipt after its retention window has expired", async () => {
    const store = new MemoryX402Store();
    const manager = new ReceiptManager(store, "secret-key-12345");
    const now = Date.now();

    const receipt = await manager.issueReceipt({
      settlementId: "set_102",
      resource: "/api/x402/deep-scan",
      result: { auditPassed: true },
      retentionSeconds: 60,
    });

    const expiredTime = now + 65 * 1000;
    await expect(
      manager.redeemReceipt({
        receiptId: receipt.id,
        requestedResource: "/api/x402/deep-scan",
        now: expiredTime,
      }),
    ).rejects.toBeInstanceOf(ReceiptExpiredError);
  });

  it("fails signature verification when receipt fields are tampered with", async () => {
    const store = new MemoryX402Store();
    const manager = new ReceiptManager(store, "secret-key-12345");

    const receipt = await manager.issueReceipt({
      settlementId: "set_103",
      resource: "/api/x402/deep-scan",
      result: { value: 42 },
    });

    const tamperedReceipt = {
      ...receipt,
      resource: "/api/x402/admin",
    };

    expect(manager.verifySignature(tamperedReceipt)).toBe(false);
  });

  it("throws ReceiptNotFoundError when attempting to redeem an unknown receipt ID", async () => {
    const store = new MemoryX402Store();
    const manager = new ReceiptManager(store);

    await expect(
      manager.redeemReceipt({
        receiptId: "rcpt_nonexistent_id",
        requestedResource: "/api/x402/deep-scan",
      }),
    ).rejects.toBeInstanceOf(ReceiptNotFoundError);
  });
});
