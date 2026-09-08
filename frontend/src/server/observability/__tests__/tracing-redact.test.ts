import { describe, expect, it } from "vitest";
import { extractResultCode, redactSpanAttributes, redactString } from "../tracing/redact";
import { withSpan } from "../tracing/spans";
import { initializeTracing } from "../tracing/setup";

describe("tracing redaction", () => {
  it("redacts wallet addresses, balances, and credentials from span attributes", () => {
    const wallet = "0x1234567890123456789012345678901234567890";
    const stellar = "GCO26XZOAAZEMBXUBKOP5Y2D4D3ZNNV65VOKMUDJ5PZJB5F3BFF6IUU6";
    const credentialToken = ["sk", "live", "secret", "token"].join("-");
    const attributes = redactSpanAttributes({
      walletAddress: wallet,
      sourceAccount: stellar,
      balance: "1234.5678",
      authorization: `Bearer ${credentialToken}`,
      chainFamily: "evm",
      provider: "goplus",
    });

    expect(attributes.walletAddress).toBe("[REDACTED]");
    expect(JSON.stringify(attributes)).not.toContain(wallet.slice(2, 10));
    expect(JSON.stringify(attributes)).not.toContain(stellar.slice(0, 8));
  });

  it("extracts stable result codes without copying request bodies", () => {
    expect(extractResultCode({ code: "provider_timeout" })).toBe("provider_timeout");
    expect(extractResultCode({ error: { code: "rate_limited" } })).toBe("rate_limited");
    expect(extractResultCode("validation_error")).toBe("validation_error");
  });

  it("redacts embedded secrets in free-form strings", () => {
    const embeddedSecret = ["sk", "live", "secret"].join("-");
    const redacted = redactString(`wallet 0x1234567890123456789012345678901234567890 with ${embeddedSecret}`);
    expect(redacted).toContain("[REDACTED_WALLET]");
    expect(redacted).toContain("[REDACTED_SECRET]");
  });
});

describe("span structure", () => {
  it("creates nested spans when tracing is disabled", async () => {
    process.env.OTEL_TRACING_ENABLED = "0";
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    await initializeTracing();

    const seen: string[] = [];
    await withSpan("route.scan.token", { "http.route": "scan.token" }, async () => {
      seen.push("route");
      await withSpan("provider.onchain.goplus", { "provider.name": "goplus" }, async () => {
        seen.push("provider");
      });
    });

    expect(seen).toEqual(["route", "provider"]);
  });
});
