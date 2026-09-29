import { describe, expect, it } from "vitest";
import { inspectPathPayment, normalizeAssetKey } from "@/server/research/path-payment";
import { normalizePathRecord } from "@/server/research/path-payment/normalize";
import { issuerA, issuerB, source, wallet } from "./fixtures";

const request = {
  walletAddress: wallet,
  network: "stellar-testnet" as const,
  walletNetwork: "stellar-testnet" as const,
  mode: "strict_send" as const,
  sourceAsset: "XLM",
  destinationAsset: `USD:${issuerA}`,
  amount: "1.0000000",
};

describe("path-payment domain", () => {
  it("keeps same-symbol assets with different issuers distinct in hops", async () => {
    const result = await inspectPathPayment(request, { source: source() });
    const hopAssets = result.routes[0]?.hops.flatMap((hop) => [hop.fromAssetKey, hop.toAssetKey]) ?? [];
    expect(hopAssets).toContain(`classic:USD:${issuerA}`);
    expect(hopAssets).toContain(`classic:USD:${issuerB}`);
    expect(normalizeAssetKey(`USD:${issuerA}`)).not.toBe(normalizeAssetKey(`USD:${issuerB}`));
  });

  it("does not invert strict-send and strict-receive semantics", () => {
    const send = normalizePathRecord(
      {
        source_amount: "1.0000000",
        destination_amount: "2.5000000",
        source_asset_type: "native",
        destination_asset_type: "credit_alphanum4",
        destination_asset_code: "USD",
        destination_asset_issuer: issuerA,
        path: [],
      },
      "strict_send",
      "send",
    );
    const receive = normalizePathRecord(
      {
        source_amount: "1.0000000",
        destination_amount: "2.5000000",
        source_asset_type: "native",
        destination_asset_type: "credit_alphanum4",
        destination_asset_code: "USD",
        destination_asset_issuer: issuerA,
        path: [],
      },
      "strict_receive",
      "receive",
    );
    expect(send.warnings[0]).toMatch(/locks source amount/i);
    expect(receive.warnings[0]).toMatch(/locks destination amount/i);
  });

  it("marks stale quotes and incomplete simulation as non-executable", async () => {
    const result = await inspectPathPayment(request, {
      source: source({ quoteAgeSeconds: 120 }),
      maxQuoteAgeSeconds: 30,
    });
    expect(result.primaryFailure).toBe("stale_quote");
    expect(result.routes[0]?.failure).toBe("stale_quote");
    expect(result.routes[0]?.simulated).toBe(false);
  });

  it("reports no_path and provider failure explicitly", async () => {
    expect((await inspectPathPayment(request, { source: source({ routes: [], noPath: true }) })).primaryFailure).toBe(
      "no_path",
    );
    expect(
      (
        await inspectPathPayment(request, {
          source: { read: async () => { throw new Error("offline"); } },
        })
      ).primaryFailure,
    ).toBe("provider_failure");
  });
});
