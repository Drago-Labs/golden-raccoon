import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "data");

function loadJson(name: string) {
  return JSON.parse(readFileSync(join(dataDir, name), "utf8")) as {
    account: string;
    network: "stellar-testnet" | "stellar-pubnet";
    windowStart: string;
    windowEnd: string;
    labels?: Record<string, { label: string; evidence: string }>;
    events: Array<{ kind: string; [key: string]: unknown }>;
    reason?: string;
  };
}

const exchangeHeavy = loadJson("exchange-heavy.json");
const inactiveAccount = loadJson("inactive-account.json");
const providerUnavailable = loadJson("provider-unavailable.json");

vi.mock("@/server/security/rateLimit", () => ({ checkRateLimit: () => null }));

vi.mock("@/server/research/counterparty-flows/paymentReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/counterparty-flows/paymentReader")>();
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "data");
  const load = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const exchange = load("exchange-heavy.json");
  const diverse = load("diverse-flows.json");
  const inactive = load("inactive-account.json");
  const unavailable = load("provider-unavailable.json");
  const all = [exchange, diverse, inactive];

  return {
    ...actual,
    readPayments: async (_network: string, account: string) => {
      if (account === unavailable.account) return { status: "unavailable", reason: unavailable.reason };
      const fixture = all.find((entry) => entry.account === account);
      if (!fixture) return { status: "missing" };
      return {
        status: "ok",
        events: fixture.events.filter((event: { kind: string }) => event.kind === "payment"),
        truncated: false,
        reachedWindowStart: true,
      };
    },
  };
});

vi.mock("@/server/research/counterparty-flows/pathPaymentReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/counterparty-flows/pathPaymentReader")>();
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "data");
  const load = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const exchange = load("exchange-heavy.json");
  const diverse = load("diverse-flows.json");
  const inactive = load("inactive-account.json");
  const unavailable = load("provider-unavailable.json");
  const all = [exchange, diverse, inactive];

  return {
    ...actual,
    readPathPayments: async (_network: string, account: string) => {
      if (account === unavailable.account) return { status: "unavailable", reason: unavailable.reason };
      const fixture = all.find((entry) => entry.account === account);
      if (!fixture) return { status: "missing" };
      return {
        status: "ok",
        events: fixture.events.filter((event: { kind: string }) => event.kind === "path_payment"),
        truncated: false,
        reachedWindowStart: true,
      };
    },
  };
});

vi.mock("@/server/research/counterparty-flows/claimReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/counterparty-flows/claimReader")>();
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "data");
  const load = (name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
  const exchange = load("exchange-heavy.json");
  const diverse = load("diverse-flows.json");
  const inactive = load("inactive-account.json");
  const unavailable = load("provider-unavailable.json");
  const all = [exchange, diverse, inactive];

  return {
    ...actual,
    readClaims: async (_network: string, account: string) => {
      if (account === unavailable.account) return { status: "unavailable", reason: unavailable.reason };
      const fixture = all.find((entry) => entry.account === account);
      if (!fixture) return { status: "missing" };
      return {
        status: "ok",
        events: fixture.events.filter((event: { kind: string }) => event.kind === "claim"),
        truncated: false,
        reachedWindowStart: true,
      };
    },
  };
});

vi.mock("@/server/research/counterparty-flows/counterpartyLabels", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/counterparty-flows/counterpartyLabels")>();
  const { readFileSync } = await import("node:fs");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "data");
  const exchange = JSON.parse(readFileSync(join(dir, "exchange-heavy.json"), "utf8"));
  return {
    ...actual,
    defaultIdentityResolver: actual.createDirectoryResolver(exchange.labels ?? {}),
  };
});

const { POST } = await import("@/app/api/insights/counterparty-flows/route");

function post(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/insights/counterparty-flows", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/insights/counterparty-flows", () => {
  it("returns a no-store profile", async () => {
    const response = await POST(
      post({
        account: exchangeHeavy.account,
        network: exchangeHeavy.network,
        windowStart: exchangeHeavy.windowStart,
        windowEnd: exchangeHeavy.windowEnd,
      }),
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.eventCount).toBe(3);
    expect(payload.report.readOnly).toBe(true);
  });

  it("returns 503 when the provider is unavailable", async () => {
    const response = await POST(
      post({
        account: providerUnavailable.account,
        network: providerUnavailable.network,
        windowStart: providerUnavailable.windowStart,
        windowEnd: providerUnavailable.windowEnd,
      }),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).report.state).toBe("unavailable");
  });

  it("returns an empty profile for an inactive account", async () => {
    const response = await POST(
      post({
        account: inactiveAccount.account,
        network: inactiveAccount.network,
        windowStart: inactiveAccount.windowStart,
        windowEnd: inactiveAccount.windowEnd,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).report.totals).toEqual([]);
  });

  it("rejects invalid JSON and oversized bodies", async () => {
    expect((await (await POST(post("{"))).json()).error).toBe("invalid_json");
    const oversized = await POST(
      post(
        {
          account: exchangeHeavy.account,
          network: exchangeHeavy.network,
          windowStart: exchangeHeavy.windowStart,
          windowEnd: exchangeHeavy.windowEnd,
        },
        { "content-length": "999999" },
      ),
    );
    expect(oversized.status).toBe(413);
  });
});
