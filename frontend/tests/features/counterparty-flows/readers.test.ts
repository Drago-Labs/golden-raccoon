import { describe, expect, it } from "vitest";
import { normalizeClaim } from "@/server/research/counterparty-flows/claimReader";
import { assetKey } from "@/server/research/counterparty-flows/paymentReader";
import { normalizePathPayment } from "@/server/research/counterparty-flows/pathPaymentReader";
import { coverageNotice } from "@/server/research/counterparty-flows/coverage";
import { validateAccountInput } from "@/server/research/counterparty-flows/accountInput";
import { CounterpartyFlowsError } from "@/server/research/counterparty-flows/errors";

describe("paymentReader assetKey", () => {
  it("maps native and issued assets", () => {
    expect(assetKey({ asset_type: "native" })).toBe("native");
    expect(assetKey({ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: "GABC" })).toBe("USDC:GABC");
  });
});

describe("pathPaymentReader normalizePathPayment", () => {
  it("uses destination asset for inflows and source asset for outflows", () => {
    const inflow = normalizePathPayment(
      {
        type: "path_payment_strict_receive",
        from: "GB5FXIMTMUOQXH7RPY3L6XNLWGBP3EZ4PAWHS7YMFE64U2HBIWFFWGQI",
        to: "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
        amount: "10.0000000",
        asset_type: "native",
        created_at: "2026-01-07T10:00:00.000Z",
        ledger: 2003,
        id: "path-in",
      },
      "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
    );
    expect(inflow).toMatchObject({ kind: "path_payment", direction: "in", asset: "native", amount: "10.0000000" });

    const outflow = normalizePathPayment(
      {
        type: "path_payment_strict_send",
        from: "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
        to: "GDF2JK5NQKKTCXZ67AMPD7D7CC2YRAOBIZZUHQPQZZ7LJFIGTSLW6JKG",
        source_amount: "30.0000000",
        amount: "29.0000000",
        source_asset_type: "native",
        asset_type: "credit_alphanum4",
        asset_code: "USDC",
        asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGW3QHOBBVYGFX6DOMTHYS",
        created_at: "2026-01-07T10:00:00.000Z",
        ledger: 2003,
        id: "path-out",
      },
      "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
    );
    expect(outflow).toMatchObject({ kind: "path_payment", direction: "out", asset: "native", amount: "30.0000000" });
  });
});

describe("claimReader normalizeClaim", () => {
  it("maps a claim to an inflow from the sponsor", () => {
    const event = normalizeClaim(
      {
        type: "claim_claimable_balance",
        account: "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
        sponsor: "GCDCEILHZVFXFZTDIQQAUGERJKJ7GC4BOX56FGXJM7FZNS72P2E6A3J3",
        amount: "15.0000000",
        created_at: "2026-01-08T10:00:00.000Z",
        ledger: 2004,
        id: "claim-1",
        asset_type: "native",
      },
      "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
    );
    expect(event).toMatchObject({
      kind: "claim",
      direction: "in",
      counterparty: "GCDCEILHZVFXFZTDIQQAUGERJKJ7GC4BOX56FGXJM7FZNS72P2E6A3J3",
      amount: "15.0000000",
    });
  });

  it("skips claims without a recorded counterparty", () => {
    expect(
      normalizeClaim(
        {
          type: "claim_claimable_balance",
          account: "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
          amount: "1.0",
          created_at: "2026-01-08T10:00:00.000Z",
          ledger: 1,
          id: "x",
        },
        "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
      ),
    ).toBeNull();
  });
});

describe("coverage", () => {
  it("describes complete, partial, and unavailable states", () => {
    expect(coverageNotice("complete", 3, false, true)).toMatch(/Complete coverage of 3/);
    expect(coverageNotice("partial", 2, true, false)).toMatch(/truncated/);
    expect(coverageNotice("unavailable", 0, false, false)).toMatch(/unavailable/i);
  });
});

describe("accountInput", () => {
  it("accepts a valid account and rejects a bad one", () => {
    expect(
      validateAccountInput({
        account: "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
        network: "stellar-testnet",
        window: "30d",
      }),
    ).toEqual({
      account: "GAT6WV6IR42RFIFJVAC5I7IGDHVEWGYLUPLLOEQ7LGDIIYGNNFG4SGMQ",
      network: "stellar-testnet",
    });

    expect(() =>
      validateAccountInput({
        account: "not-a-key",
        network: "stellar-testnet",
        window: "30d",
      }),
    ).toThrow(CounterpartyFlowsError);
  });
});
