import { describe, expect, it } from "vitest";
import { buildAuthorityHistory } from "@/server/research/authority-history/service";
import { separateAuthorityFamilies } from "@/server/research/authority-history/reconstruction";
import {
  FixtureRpc,
  adminChangedLog,
  contract,
  ownershipLog,
  proxyAdminNew,
  rateLimitedLogs,
  request,
  roleAccount,
  roleAdminChangedLog,
  roleGrantedLog,
  roleRevokedLog,
  ownerNew,
  walletA,
} from "./fixtures";

describe("authority history grants and revokes", () => {
  it("reconstructs a granted role holder from a complete range", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [ownershipLog(), roleGrantedLog()];
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc, now: () => new Date("2026-01-01T00:00:00Z") });

    expect(report.coverage.state).toBe("complete");
    expect(report.coverage.reconstructionValid).toBe(true);
    expect(report.roleMatrix).toEqual([
      expect.objectContaining({ account: roleAccount, family: "application", reconstructed: true }),
    ]);
    expect(report.observedOwners).toContainEqual(
      expect.objectContaining({ address: ownerNew, family: "application" }),
    );
    expect(report.readOnly).toBe(true);
    expect(report.authorityUnchanged).toBe(true);
  });

  it("removes a revoked role from the reconstructed matrix", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [roleGrantedLog(), roleRevokedLog()];
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc });

    expect(report.roleMatrix).toHaveLength(0);
    expect(report.timeline.map((event) => event.kind)).toEqual(["RoleGranted", "RoleRevoked"]);
  });
});

describe("admin changes and proxy separation", () => {
  it("records RoleAdminChanged with exact role ids", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [roleAdminChangedLog()];
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc });

    expect(report.roleAdmins).toHaveLength(1);
    expect(report.roleAdmins[0].roleId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(report.roleAdmins[0].adminRoleId).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("keeps ERC-1967 proxy admin separate from application roles", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [ownershipLog(), roleGrantedLog(), adminChangedLog()];
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc });
    const families = separateAuthorityFamilies(report.events);

    expect(families.proxyAdmin).toHaveLength(1);
    expect(families.proxyAdmin[0].kind).toBe("AdminChanged");
    expect(families.application.every((event) => event.kind !== "AdminChanged")).toBe(true);
    expect(report.observedOwners.find((owner) => owner.family === "proxy_admin")?.address).toBe(proxyAdminNew);
    expect(report.roleMatrix.every((holder) => holder.family === "application")).toBe(true);
  });
});

describe("indexing gaps and reorgs", () => {
  it("invalidates reconstructed state when a block hash changes", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [ownershipLog()];
    // Event block 100 will be re-read as a different hash.
    rpc.hashes.set("100", "0xreorgedaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc });

    expect(report.coverage.reorgDetected).toBe(true);
    expect(report.coverage.reconstructionValid).toBe(false);
    expect(report.roleMatrix).toHaveLength(0);
    expect(report.observedOwners).toHaveLength(0);
    expect(report.coverage.message).toMatch(/incomplete|all-clear/i);
  });

  it("marks log rate limits partial and never claims an all-clear", async () => {
    const rpc = new FixtureRpc();
    rpc.logError = rateLimitedLogs();
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc });

    expect(report.coverage.state).toBe("partial");
    expect(report.coverage.logCoverageComplete).toBe(false);
    expect(report.coverage.reconstructionValid).toBe(false);
    expect(report.coverage.message).toMatch(/Do not treat this as an all-clear/i);
    expect(report.coverage.message).not.toMatch(/proves that no authority exists(?!\.)/i);
  });

  it("treats an empty complete range as empty, not as proof of no authority", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [];
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc });

    expect(report.coverage.state).toBe("empty");
    expect(report.coverage.message).toMatch(/does not prove/i);
    expect(report.coverage.unsupportedModels.join(" ")).toMatch(/custom access/i);
    expect(report.contractAddress).toBe(contract);
    expect(report.walletAddress).toBe(walletA);
  });

  it("invalidates reconstruction when an event block hash is missing", async () => {
    const rpc = new FixtureRpc();
    rpc.logsResult = [ownershipLog()];
    rpc.hashes.delete("100");
    rpc.snapshotHashReads = [
      "0xstable0000000000000000000000000000000000000000000000000000000000",
      "0xstable0000000000000000000000000000000000000000000000000000000000",
    ];

    const report = await buildAuthorityHistory(request(), { rpc });

    expect(report.coverage.missingBlockHashes).toBeGreaterThan(0);
    expect(report.coverage.reconstructionValid).toBe(false);
  });
});
