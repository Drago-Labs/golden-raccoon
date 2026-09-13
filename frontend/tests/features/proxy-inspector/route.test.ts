import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/insights/proxy-inspector/route";
import { PROXY_LIMITS } from "@/server/research/proxy-inspector/schema";
import {
  BEACON_IMPL,
  IMPLEMENTATION,
  PROXY,
  beaconProxyWorld,
  createRpcFetchStub,
  cyclicWorld,
  directProxyWorld,
  eoaWorld,
  unavailableWorld,
} from "./fixtures";

function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/insights/proxy-inspector", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/insights/proxy-inspector", () => {
  it("returns a direct-proxy report through the production reader", async () => {
    vi.stubGlobal("fetch", createRpcFetchStub(directProxyWorld));

    const response = await POST(post({ network: "ethereum", address: PROXY }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.report.classification).toBe("erc1967_direct_proxy");
    expect(payload.report.path[0].to.address).toBe(IMPLEMENTATION);
  });

  it("resolves a beacon implementation over the wire format", async () => {
    vi.stubGlobal("fetch", createRpcFetchStub(beaconProxyWorld));

    const response = await POST(post({ network: "ethereum", address: PROXY }));
    const payload = await response.json();

    expect(payload.report.classification).toBe("erc1967_beacon_proxy");
    expect(payload.report.path[0].to.address).toBe(BEACON_IMPL);
  });

  it("returns a successful empty result for an account with no code", async () => {
    vi.stubGlobal("fetch", createRpcFetchStub(eoaWorld));

    const response = await POST(post({ network: "ethereum", address: PROXY }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("empty");
  });

  it("returns an unavailable result rather than an error when the provider fails", async () => {
    vi.stubGlobal("fetch", createRpcFetchStub(unavailableWorld));

    const response = await POST(post({ network: "ethereum", address: PROXY }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.report.coverage.state).toBe("unavailable");
  });

  it("reports a cycle without exceeding the read budget", async () => {
    vi.stubGlobal("fetch", createRpcFetchStub(cyclicWorld));

    const response = await POST(post({ network: "ethereum", address: PROXY }));
    const payload = await response.json();

    expect(payload.report.classification).toBe("cyclic_indirection");
    expect(payload.report.coverage.rpcCallsUsed).toBeLessThanOrEqual(PROXY_LIMITS.maxRpcCalls);
  });

  it("never performs a write method", async () => {
    const methods: string[] = [];

    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      methods.push(JSON.parse(String(init?.body ?? "{}")).method);
      return createRpcFetchStub(directProxyWorld)(url, init);
    });

    await POST(post({ network: "ethereum", address: PROXY }));

    expect(methods.length).toBeGreaterThan(0);
    for (const method of methods) {
      expect(["eth_blockNumber", "eth_getCode", "eth_getStorageAt", "eth_call"]).toContain(method);
    }
  });

  it("rejects an unconfigured network without issuing a read", async () => {
    const fetchMock = vi.fn(createRpcFetchStub(directProxyWorld));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(post({ network: "not-a-chain", address: PROXY }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: "unsupported_network" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed address", async () => {
    vi.stubGlobal("fetch", createRpcFetchStub(directProxyWorld));

    const response = await POST(post({ network: "ethereum", address: "0xnothex" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_request" });
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(post("{not json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
  });

  it("rejects an oversized declared payload before reading it", async () => {
    const response = await POST(
      post({ network: "ethereum", address: PROXY }, { "content-length": String(PROXY_LIMITS.maxRequestBytes + 1) }),
    );

    expect(response.status).toBe(413);
  });
});
