import { describe, expect, it, vi } from "vitest";
import { RpcConsistencyError } from "@/server/research/rpc-consistency/errors";
import { compareRpcConsistency } from "@/server/research/rpc-consistency/service";
import { ACCOUNT, conflicting, contractOnlyFixture, lagging, matched, probesFor, unavailable } from "./fixtures";

describe("compareRpcConsistency", () => {
  it("does not call the network when probes are injected", async () => {
    const fetchMock = vi.fn(() => {
      throw new Error("network");
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await compareRpcConsistency(matched.request, probesFor(matched));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.readOnly).toBe(true);
    expect(report.network).toBe("testnet");
    expect(report.fields.every((field) => field.classification === "matched")).toBe(true);
    expect(report.coverage.state).toBe("complete");
    expect(report.providers.map((provider) => provider.latestLedger)).toEqual([5100, 5100]);
  });

  it("classifies a value gap at different ledgers as lag", async () => {
    const report = await compareRpcConsistency(lagging.request, probesFor(lagging));
    const native = report.fields.find((field) => field.fieldId === "native_balance");

    expect(native?.classification).toBe("lagging");
    expect(native?.conflict).toBeNull();
    expect(report.fields.some((field) => field.classification === "conflicting")).toBe(false);
    expect(report.lag.laggingFieldCount).toBeGreaterThan(0);
    expect(report.coverage.state).toBe("partial");
  });

  it("shows both raw values for a same-ledger conflict", async () => {
    const report = await compareRpcConsistency(conflicting.request, probesFor(conflicting));
    const native = report.fields.find((field) => field.fieldId === "native_balance");

    expect(native?.classification).toBe("conflicting");
    expect(native?.conflict?.horizonRaw).toEqual({ asset_type: "native", balance: "10.0000000" });
    expect(native?.conflict?.rpcRaw).toEqual({ balance: "90000000", lastModifiedLedgerSeq: 5000 });
  });

  it("returns a labelled single-source report when Horizon is down", async () => {
    const report = await compareRpcConsistency(unavailable.request, probesFor(unavailable));

    expect(report.coverage.state).toBe("single_source");
    expect(report.providers[0]?.label).toBe("Horizon unavailable");
    expect(report.fields.length).toBeGreaterThan(0);
    expect(report.fields.every((field) => field.classification === "single_source")).toBe(true);
    expect(report.fields[0]?.note).toMatch(/single-source result from Stellar RPC/);
  });

  it("keeps contract data single-source when Horizon does not expose it", async () => {
    const fixture = contractOnlyFixture();
    const report = await compareRpcConsistency(fixture.request, probesFor(fixture));
    const entry = report.fields.find((field) => field.fieldId === "contract_data:counter");

    expect(entry?.classification).toBe("single_source");
    expect(report.coverage.horizonContractDataExposed).toBe(false);
    expect(report.coverage.note).toMatch(/does not expose contract data/i);
    expect(report.target).toEqual({ kind: "contract", id: fixture.request.target });
  });

  it("asks RPC for trustlines Horizon found and the first RPC read missed", async () => {
    if (matched.horizon.status !== "available" || matched.rpc.status !== "available" || !matched.rpc.observation.account) {
      throw new Error("matched fixture should include both accounts");
    }

    const withoutLines = {
      ...matched.rpc,
      observation: {
        ...matched.rpc.observation,
        account: { ...matched.rpc.observation.account, trustlines: [] },
      },
    };
    const readRpc = vi.fn(async (target: { trustlines: Array<{ code: string }> }) =>
      target.trustlines.length > 0 ? matched.rpc : withoutLines,
    );

    const report = await compareRpcConsistency(matched.request, {
      readHorizon: async () => matched.horizon,
      readRpc,
    });

    expect(readRpc).toHaveBeenCalledTimes(2);
    expect(report.fields.find((field) => field.kind === "trustline")?.classification).toBe("matched");
  });

  it("refuses to compare a testnet answer on a mainnet request", async () => {
    await expect(compareRpcConsistency({ ...matched.request, network: "mainnet" }, probesFor(matched))).rejects.toBeInstanceOf(
      RpcConsistencyError,
    );
    await expect(compareRpcConsistency({ ...matched.request, network: "mainnet" }, probesFor(matched))).rejects.toMatchObject({
      code: "network_mismatch",
    });
  });

  it("rejects a target that is not an account or contract", async () => {
    await expect(compareRpcConsistency({ network: "testnet", target: "not-an-id" }, probesFor(matched))).rejects.toMatchObject({
      code: "invalid_target",
    });
  });

  it("reports the account id it was asked about", async () => {
    const report = await compareRpcConsistency(matched.request, probesFor(matched));

    expect(report.target.id).toBe(ACCOUNT);
  });
});
