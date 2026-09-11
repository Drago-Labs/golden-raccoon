import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getTerms, POST as postTerms } from "@/app/api/x402/terms/route";
import { GET as getReceipt } from "@/app/api/x402/receipts/[id]/route";
import { GET as getSettlements, POST as postSettlements } from "@/app/api/x402/settlements/route";
import { receiptManager } from "@/server/x402/settlement/receipts";
import { settlementLedger } from "@/server/x402/settlement/ledger";

describe("x402 API routes integration", () => {
  it("serves terms and generates time-locked price quotes", async () => {
    const termsReq = new NextRequest("http://localhost:3000/api/x402/terms");
    const termsRes = await getTerms(termsReq);
    expect(termsRes.status).toBe(200);
    const termsJson = await termsRes.json();
    expect(termsJson.receiptRetentionSeconds).toBeGreaterThan(0);
    expect(termsJson.quoteTtlSeconds).toBeGreaterThan(0);

    const quoteReq = new NextRequest("http://localhost:3000/api/x402/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resource: "/api/x402/deep-scan",
        chainFamily: "evm",
        network: "eip155:8453",
        asset: "USDC",
        payTo: "0x1111111111111111111111111111111111111111",
      }),
    });
    const quoteRes = await postTerms(quoteReq);
    expect(quoteRes.status).toBe(201);
    const quoteJson = await quoteRes.json();
    expect(quoteJson.quoteId).toMatch(/^quot_/);
    expect(quoteJson.priceUsd).toBe("$0.99");

    const queryReq = new NextRequest(
      `http://localhost:3000/api/x402/terms?quoteId=${quoteJson.quoteId}`,
    );
    const queryRes = await getTerms(queryReq);
    expect(queryRes.status).toBe(200);
    const queryJson = await queryRes.json();
    expect(queryJson.quote.id).toBe(quoteJson.quoteId);
    expect(queryJson.quoteValid).toBe(true);
  });

  it("handles receipt inspection and redemption", async () => {
    const receipt = await receiptManager.issueReceipt({
      settlementId: "set_route_test",
      resource: "/api/x402/deep-scan",
      result: { scanScore: 100, passed: true },
      payer: "0x1234567890123456789012345678901234567890",
    });

    const infoReq = new NextRequest(`http://localhost:3000/api/x402/receipts/${receipt.id}`);
    const infoRes = await getReceipt(infoReq, { params: { id: receipt.id } });
    expect(infoRes.status).toBe(200);
    const infoJson = await infoRes.json();
    expect(infoJson.receipt.id).toBe(receipt.id);
    expect(infoJson.redeemed).toBe(false);

    const redeemReq = new NextRequest(
      `http://localhost:3000/api/x402/receipts/${receipt.id}?resource=/api/x402/deep-scan`,
    );
    const redeemRes = await getReceipt(redeemReq, { params: { id: receipt.id } });
    expect(redeemRes.status).toBe(200);
    const redeemJson = await redeemRes.json();
    expect(redeemJson.redeemed).toBe(true);
    expect(redeemJson.result).toEqual({ scanScore: 100, passed: true });

    const mismatchReq = new NextRequest(
      `http://localhost:3000/api/x402/receipts/${receipt.id}?resource=/api/x402/other`,
    );
    const mismatchRes = await getReceipt(mismatchReq, { params: { id: receipt.id } });
    expect(mismatchRes.status).toBe(403);
  });

  it("queries settlements and processes refunds", async () => {
    const idempKey = "idemp_api_refund_test";
    await settlementLedger.begin({
      idempotencyKey: idempKey,
      requestId: "req_api_ref",
      protectedResource: "/api/x402/deep-scan",
      requestBodyHash: "7".repeat(64),
      chainFamily: "evm",
      network: "eip155:8453",
      asset: "USDC",
      amount: "0.99",
      payTo: "0x1111111111111111111111111111111111111111",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await settlementLedger.recordWorkFailure(idempKey, "Deep scan internal error");

    const owedReq = new NextRequest("http://localhost:3000/api/x402/settlements?owed=true");
    const owedRes = await getSettlements(owedReq);
    expect(owedRes.status).toBe(200);
    const owedJson = await owedRes.json();
    expect(owedJson.settlements.some((s: { idempotencyKey: string }) => s.idempotencyKey === idempKey)).toBe(true);

    const refundReq = new NextRequest("http://localhost:3000/api/x402/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "refund",
        idempotencyKey: idempKey,
      }),
    });
    const refundRes = await postSettlements(refundReq);
    expect(refundRes.status).toBe(200);
    const refundJson = await refundRes.json();
    expect(refundJson.success).toBe(true);
    expect(refundJson.settlement.status).toBe("refunded");
  });
});
