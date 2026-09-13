import { describe, expect, it } from "vitest";
import { PROXY_LIMITS } from "@/server/research/proxy-inspector/schema";
import { inspectProxy } from "@/server/research/proxy-inspector/service";
import {
  ADMIN,
  BEACON,
  BEACON_IMPL,
  BEACON_OWNER,
  DEEP_CHAIN_HEAD,
  IMPLEMENTATION,
  PROXY,
  SECOND_PROXY,
  baseRequest,
  beaconProxyWorld,
  conflictingSlotsWorld,
  createFixtureReader,
  cyclicWorld,
  deepChainWorld,
  directProxyWorld,
  dirtySlotWorld,
  eoaWorld,
  partialReadWorld,
  revertingBeaconWorld,
  unavailableWorld,
  uupsUnknownAuthorityWorld,
  zeroImplementationWorld,
} from "./fixtures";

describe("direct and beacon proxies", () => {
  it("resolves a direct ERC-1967 implementation and cites the slot", async () => {
    const reader = createFixtureReader(directProxyWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("erc1967_direct_proxy");
    expect(report.path).toHaveLength(1);
    expect(report.path[0].to?.address).toBe(IMPLEMENTATION);
    expect(report.path[0].evidence).toContain("0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
  });

  it("resolves a beacon implementation through implementation()", async () => {
    const reader = createFixtureReader(beaconProxyWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("erc1967_beacon_proxy");
    expect(report.path[0].kind).toBe("beacon");
    expect(report.path[0].to?.address).toBe(BEACON_IMPL);
    expect(report.path[0].evidence).toContain(BEACON);
  });

  it("scopes every reported address to the network it was read on", async () => {
    const reader = createFixtureReader(directProxyWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.target).toMatchObject({ network: "ethereum", chainId: 1 });
    expect(report.path[0].to).toMatchObject({ network: "ethereum", chainId: 1 });
    expect(report.authority[0].holder).toMatchObject({ network: "ethereum", chainId: 1 });
  });

  it("reads every observation at one identified block", async () => {
    const reader = createFixtureReader(directProxyWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.checkedAtBlock).toBe("0x1312d00");
    expect(report.checkedAtBlockNumber).toBe(20_000_000);
    expect(reader.log().filter((entry) => entry === "eth_blockNumber")).toHaveLength(1);
  });

  it("reports the observed admin holder and what it does not establish", async () => {
    const reader = createFixtureReader(directProxyWorld);
    const report = await inspectProxy(baseRequest, reader);
    const admin = report.authority.find((entry) => entry.kind === "observed_admin_slot");

    expect(admin?.holder?.address).toBe(ADMIN);
    expect(admin?.holderHasCode).toBe(true);
    expect(admin?.limitation.length).toBeGreaterThan(0);
  });

  it("reports an observed beacon owner separately from the implementation", async () => {
    const reader = createFixtureReader(beaconProxyWorld);
    const report = await inspectProxy(baseRequest, reader);
    const owner = report.authority.find((entry) => entry.kind === "observed_beacon_owner");

    expect(owner?.holder?.address).toBe(BEACON_OWNER);
  });
});

describe("absence of evidence", () => {
  it("does not claim immutability when no admin slot is set", async () => {
    const reader = createFixtureReader(uupsUnknownAuthorityWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("erc1967_direct_proxy");
    expect(report.authority.every((entry) => entry.kind === "not_observed")).toBe(true);

    const serialized = JSON.stringify(report).toLowerCase();

    expect(serialized).not.toContain("immutable contract");
    expect(report.authority[0].limitation).toContain("does not mean the contract is immutable");
  });

  it("flags an authority finding that states its own limit", async () => {
    const reader = createFixtureReader(uupsUnknownAuthorityWorld);
    const report = await inspectProxy(baseRequest, reader);
    const finding = report.findings.find((entry) => entry.findingId === "authority-not-observed");

    expect(finding).toBeDefined();
    expect(finding?.limitation).toContain("not a finding that the contract is immutable");
  });

  it("treats a zero implementation slot as uninformative, not as immutability", async () => {
    const reader = createFixtureReader(zeroImplementationWorld);
    const report = await inspectProxy(baseRequest, reader);
    const finding = report.findings.find((entry) => entry.findingId === "implementation-slot-zero");

    expect(report.classification).toBe("no_proxy_indirection_observed");
    expect(finding?.limitation).toContain("not an immutability claim");
  });
});

describe("cycles, conflicts and read failures", () => {
  it("stops at a cycle instead of walking to the depth bound", async () => {
    const reader = createFixtureReader(cyclicWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("cyclic_indirection");
    expect(report.path.some((hop) => hop.kind === "cycle")).toBe(true);
    expect(report.path[report.path.length - 1].to?.address).toBe(PROXY);
    expect(report.path.filter((hop) => hop.to?.address === SECOND_PROXY)).toHaveLength(1);
  });

  it("reports conflicting slots without naming one as the implementation", async () => {
    const reader = createFixtureReader(conflictingSlotsWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("conflicting_slots");
    expect(report.findings.some((finding) => finding.findingId === "conflicting-indirection-slots")).toBe(true);
    expect(report.summary).toContain("neither is presented as the implementation");
  });

  it("keeps a reverting beacon distinct from an absent implementation", async () => {
    const reader = createFixtureReader(revertingBeaconWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("unsupported_proxy_pattern");
    expect(report.path[0].kind).toBe("unresolved");
    expect(report.summary).toContain("unknown, not absent");
  });

  it("degrades to a partial report when a read fails mid-inspection", async () => {
    const reader = createFixtureReader({
      addresses: {
        [PROXY]: { code: "0x6080", slots: {} },
      },
    });
    const failing = {
      ...reader,
      getStorageAt: async () => {
        throw new Error("provider rate limit");
      },
    };
    const report = await inspectProxy(baseRequest, failing);

    expect(report.coverage.state).toBe("partial");
    expect(report.coverage.failedReadCount).toBeGreaterThan(0);
    expect(report.classification).toBe("unavailable");
  });
});

describe("bounded reads", () => {
  it("never exceeds the published read ceiling on a long chain", async () => {
    const reader = createFixtureReader(deepChainWorld(40));
    const report = await inspectProxy({ network: "ethereum", address: DEEP_CHAIN_HEAD }, reader);

    expect(reader.callCount()).toBeLessThanOrEqual(PROXY_LIMITS.maxRpcCalls);
    expect(report.coverage.rpcCallBudget).toBe(PROXY_LIMITS.maxRpcCalls);
    expect(report.path.length).toBeLessThanOrEqual(PROXY_LIMITS.maxDepth + 1);
  });

  it("marks a chain that outruns the depth bound as truncated", async () => {
    const reader = createFixtureReader(deepChainWorld(40));
    const report = await inspectProxy({ network: "ethereum", address: DEEP_CHAIN_HEAD }, reader);

    expect(report.findings.some((finding) => finding.findingId === "chain-truncated")).toBe(true);
  });
});

describe("distinguishable states", () => {
  it("returns an empty, successful result for an address with no code", async () => {
    const reader = createFixtureReader(eoaWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("not_a_contract");
    expect(report.coverage.state).toBe("empty");
    expect(report.path).toHaveLength(0);
  });

  it("returns an unavailable result when the target code read fails", async () => {
    const reader = createFixtureReader(unavailableWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("unavailable");
    expect(report.coverage.state).toBe("unavailable");
    expect(report.targetCode.unavailableReason).toContain("provider unavailable");
  });

  it("returns a complete result for a contract with no proxy indirection", async () => {
    const reader = createFixtureReader(partialReadWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("no_proxy_indirection_observed");
    expect(report.coverage.state).toBe("complete");
  });

  it("reports a dirty slot as unsupported rather than truncating it to an address", async () => {
    const reader = createFixtureReader(dirtySlotWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.classification).toBe("unsupported_proxy_pattern");
    expect(report.slots.find((slot) => slot.slotKey === "erc1967Implementation")?.isDirty).toBe(true);
    expect(report.slots.find((slot) => slot.slotKey === "erc1967Implementation")?.decodedAddress).toBeNull();
  });
});

describe("read-only guarantee", () => {
  it("declares that it wrote nothing and changed no score", async () => {
    const reader = createFixtureReader(directProxyWorld);
    const report = await inspectProxy(baseRequest, reader);

    expect(report.readOnly).toBe(true);
    expect(report.scoreUnchanged).toBe(true);
  });

  it("issues only read methods", async () => {
    const reader = createFixtureReader(directProxyWorld);
    await inspectProxy(baseRequest, reader);

    for (const entry of reader.log()) {
      expect(entry).toMatch(/^eth_(blockNumber|getCode|getStorageAt|call)/);
    }
  });
});

describe("request validation", () => {
  it("rejects an address that is not 20 bytes", async () => {
    const reader = createFixtureReader(directProxyWorld);

    await expect(inspectProxy({ network: "ethereum", address: "0x1234" }, reader)).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("rejects a network it has no configuration for", async () => {
    const reader = createFixtureReader(directProxyWorld);

    await expect(inspectProxy({ network: "not-a-chain", address: PROXY }, reader)).rejects.toMatchObject({
      code: "unsupported_network",
    });
  });
});
