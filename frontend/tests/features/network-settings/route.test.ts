import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NETWORK_SETTINGS_LIMITS } from "@/server/research/network-settings/limits";
import { networkSettingsRequestSchema } from "@/server/research/network-settings/schema";
import { readCurrentSettings, type RpcSettingsReader } from "@/server/research/network-settings/settingsReader";
import type { NetworkId } from "@/server/research/network-settings/networkIdentity";
import { fixtureTransport, providerUnavailable } from "./fixtures";

const mode = vi.hoisted(() => ({ fail: false }));

vi.mock("@/server/research/network-settings/settingsReader", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/research/network-settings/settingsReader")>();

  return {
    ...actual,
    createRpcSettingsReader(network: NetworkId): RpcSettingsReader {
      return {
        async read(requested) {
          if (mode.fail) {
            throw new (await import("@/server/research/network-settings/errors")).NetworkSettingsError(
              "provider_unavailable",
              providerUnavailable.message,
            );
          }

          return actual.readCurrentSettings(requested, fixtureTransport(network), 1_000);
        },
      };
    },
  };
});

const { POST } = await import("@/app/api/insights/network-settings/route");

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);

  return new NextRequest("http://localhost/api/insights/network-settings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
      ...headers,
    },
    body: payload,
  });
}

beforeEach(() => {
  mode.fail = false;
});

describe("network settings route", () => {
  it("rejects a request that names no known network", () => {
    const parsed = networkSettingsRequestSchema.safeParse({ network: "pubnet" });

    expect(parsed.success).toBe(false);
  });

  it("returns the testnet fixture without calling the network", async () => {
    const response = await POST(post({ network: "testnet" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.network).toBe("testnet");
    expect(body.report.settings.some((setting: { value: string }) => setting.value === "131072")).toBe(true);
    expect(body.report.history.every((upgrade: { network: string }) => upgrade.network === "testnet")).toBe(true);
  });

  it("keeps mainnet settings out of a testnet response", async () => {
    const testnet = await (await POST(post({ network: "testnet" }, { "x-forwarded-for": "203.0.113.11" }))).json();
    const mainnet = await (await POST(post({ network: "mainnet" }, { "x-forwarded-for": "203.0.113.12" }))).json();

    expect(mainnet.report.ledger).not.toBe(testnet.report.ledger);
    expect(mainnet.report.history.map((upgrade: { ledger: number }) => upgrade.ledger)).toEqual([60_000_000]);
  });

  it("returns 400 for invalid JSON and an unknown network", async () => {
    const invalid = await POST(post("{"));
    const unknown = await POST(post({ network: "pubnet" }, { "x-forwarded-for": "203.0.113.13" }));

    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_json" });
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ error: "unknown_network" });
  });

  it("returns 413 when the body exceeds the size bound", async () => {
    const response = await POST(post("x".repeat(NETWORK_SETTINGS_LIMITS.maxRequestBytes + 1), { "x-forwarded-for": "203.0.113.14" }));

    expect(response.status).toBe(413);
  });

  it("returns 503 when the injected reader is unavailable", async () => {
    mode.fail = true;
    const response = await POST(post({ network: "testnet" }, { "x-forwarded-for": "203.0.113.15" }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.report.state).toBe("unavailable");
    expect(body.report.coverage.message).toMatch(/Nothing here is inferred/);
  });

  it("still exposes the reader used by the route", () => {
    expect(readCurrentSettings).toBeTypeOf("function");
  });
});
