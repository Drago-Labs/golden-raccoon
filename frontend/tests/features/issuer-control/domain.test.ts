import { describe, expect, it } from "vitest";
import { classifyTrustlineState, inspectIssuerControl } from "@/server/research/issuer-control";
import { issuer, otherIssuer, source, wallet } from "./fixtures";

const request = {
  walletAddress: wallet,
  accountAddress: wallet,
  assetQuery: `USD:${issuer}`,
  network: "stellar-testnet" as const,
  walletNetwork: "stellar-testnet" as const,
  pageSize: 20,
  maxPages: 3,
};

describe("issuer-control domain", () => {
  it("keeps same-code assets from different issuers separate", async () => {
    const first = await inspectIssuerControl(request, { source: source() });
    const second = await inspectIssuerControl(
      { ...request, assetQuery: `USD:${otherIssuer}` },
      {
        source: source({
          accountBalances: [
            {
              asset_type: "credit_alphanum4",
              asset_code: "USD",
              asset_issuer: otherIssuer,
              is_authorized: false,
            },
          ],
          issuerFlags: {
            authRequired: false,
            authRevocable: false,
            authImmutable: false,
            authClawbackEnabled: false,
            issuerExists: true,
          },
          events: [],
        }),
      },
    );
    expect(first.asset?.issuer).toBe(issuer);
    expect(second.asset?.issuer).toBe(otherIssuer);
    expect(first.trustline.state).toBe("fully_authorized");
    expect(second.trustline.state).toBe("unauthorized");
    expect(first.asset?.assetKey).not.toBe(second.asset?.assetKey);
  });

  it("never treats missing provider evidence as authorized or safe", async () => {
    const result = await inspectIssuerControl(request, {
      source: source({ accountBalances: null, accountMissing: true, issuerFlagsUnavailable: true, issuerFlags: null }),
    });
    expect(result.trustline.state).toBe("unavailable");
    expect(result.issuerFlags.state).toBe("unavailable");
    expect(result.state).toBe("partial");
  });

  it("classifies maintain-liabilities separately from full authorization", () => {
    expect(
      classifyTrustlineState({
        asset_type: "credit_alphanum4",
        is_authorized: false,
        is_authorized_to_maintain_liabilities: true,
      }),
    ).toBe("authorized_to_maintain_liabilities");
    expect(
      classifyTrustlineState({
        asset_type: "credit_alphanum4",
        is_authorized: true,
        is_authorized_to_maintain_liabilities: false,
      }),
    ).toBe("fully_authorized");
  });

  it("marks clawback events and unavailable provider failures explicitly", async () => {
    const withClawback = await inspectIssuerControl(request, { source: source() });
    expect(withClawback.events[0]?.kind).toBe("trustline_clawed_back");
    expect(withClawback.issuerFlags.authClawbackEnabled).toBe(true);

    const unavailable = await inspectIssuerControl(request, {
      source: { read: async () => { throw new Error("offline"); } },
    });
    expect(unavailable.state).toBe("unavailable");
    expect(unavailable.trustline.state).toBe("unavailable");
  });

  it("marks duplicate and truncated event pagination", async () => {
    const result = await inspectIssuerControl(request, {
      source: source({ duplicatePage: true, truncated: true }),
    });
    expect(result.state).toBe("partial");
    expect(result.coverage.duplicatePage).toBe(true);
    expect(result.coverage.truncated).toBe(true);
  });

  it("treats native XLM as not requiring a trustline", async () => {
    const result = await inspectIssuerControl(
      { ...request, assetQuery: "XLM" },
      { source: source({ issuerFlags: null, events: [] }) },
    );
    expect(result.asset?.kind).toBe("native");
    expect(result.trustline.state).toBe("not_required");
    expect(result.issuerFlags.state).toBe("not_applicable");
  });
});
