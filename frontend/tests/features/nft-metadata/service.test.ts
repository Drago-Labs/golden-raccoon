import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ readPublicHttpsText: vi.fn() }));
vi.mock("@/server/security/publicHttpsText", () => ({ readPublicHttpsText: mocks.readPublicHttpsText }));

import { inspectNftMetadata } from "@/server/research/nft-metadata/service";
import ipfsCollection from "./data/ipfs-collection.json";
import mutableHttpCollection from "./data/mutable-http-collection.json";
import providerUnavailable from "./data/provider-unavailable.json";
import unresolvableUri from "./data/unresolvable-uri.json";
import { contractAddress, recordedNftRpc, wallet } from "./fixtures";

type HttpFixture = Record<string, { status: "ok" | "error"; body?: string; errorMessage?: string }>;

function installHttpFixture(http: HttpFixture) {
  mocks.readPublicHttpsText.mockImplementation(async (url: string) => {
    const entry = http[url];
    if (!entry) throw new Error(`Unexpected fetch in fixture: ${url}`);
    if (entry.status === "error") throw new Error(entry.errorMessage ?? "fetch failed");
    return entry.body ?? "";
  });
}

const network = "ethereum";
const request = { walletAddress: wallet, network, walletNetwork: network, contractAddress };

describe("inspectNftMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports a complete state for a fully IPFS-pinned, resolving collection", async () => {
    installHttpFixture(ipfsCollection.http as HttpFixture);
    const rpc = recordedNftRpc(ipfsCollection.rpc as never);

    const result = await inspectNftMetadata(request, { rpc });

    expect(result.state).toBe("complete");
    expect(result.standard).toBe("erc721");
    expect(result.contractUri.hosting?.kind).toBe("ipfs");
    expect(result.contractUri.hosting?.pinned).toBe(true);
    expect(result.samples).toHaveLength(3);
    expect(result.samples.every((sample) => sample.resolution.resolved)).toBe(true);
  });

  it("flags a centralized HTTP collection as mutable and surfaces a detected base-URI setter", async () => {
    installHttpFixture(mutableHttpCollection.http as HttpFixture);
    const rpc = recordedNftRpc(mutableHttpCollection.rpc as never);

    const result = await inspectNftMetadata(request, { rpc });

    expect(result.state).toBe("complete");
    expect(result.standard).toBe("erc1155");
    expect(result.contractUri.hosting?.kind).toBe("http");
    expect(result.contractUri.hosting?.pinned).toBe(false);
    const setter = result.mutability.baseUriSetterSignals.find((signal) => signal.name === "setURI(string)");
    expect(setter?.detected).toBe(true);
  });

  it("shows unresolvable sample URIs as failures rather than omitting them", async () => {
    installHttpFixture(unresolvableUri.http as HttpFixture);
    const rpc = recordedNftRpc(unresolvableUri.rpc as never);

    const result = await inspectNftMetadata(request, { rpc });

    expect(result.state).toBe("partial");
    expect(result.samples).toHaveLength(3);
    expect(result.samples.find((sample) => sample.tokenId === "1")?.resolution.resolved).toBe(false);
    expect(result.samples.find((sample) => sample.tokenId === "2")?.resolution.resolved).toBe(false);
    expect(result.samples.find((sample) => sample.tokenId === "3")?.uri).toBeNull();
  });

  it("reports unavailable when the provider cannot be reached at all", async () => {
    installHttpFixture(providerUnavailable.http as HttpFixture);
    const rpc = recordedNftRpc(providerUnavailable.rpc as never);

    const result = await inspectNftMetadata(request, { rpc });

    expect(result.state).toBe("unavailable");
    expect(result.samples).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("throws a typed error for an unsupported network before touching the provider", async () => {
    await expect(
      inspectNftMetadata({ ...request, network: "not-a-network", walletNetwork: "not-a-network" }),
    ).rejects.toThrow(/unsupported network/i);
  });
});
