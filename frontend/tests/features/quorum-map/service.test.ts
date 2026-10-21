import { describe, expect, it } from "vitest";
import { mapQuorum } from "@/server/research/quorum-map";
import { sourceAgeSeconds } from "@/server/research/quorum-map/coverage";
import { QUORUM_LIMITS } from "@/server/research/quorum-map/limits";
import { validatorDirectoryUrl } from "@/server/research/quorum-map/networkIdentity";
import { quorumRequestSchema } from "@/server/research/quorum-map/schema";
import { readValidatorSnapshot } from "@/server/research/quorum-map/validatorSource";
import { depsFor, mainnetFixture, mismatchFixture, nestedFixture, NOW, unavailableDeps } from "./fixtures";

describe("mapQuorum", () => {
  it("reports mainnet dependence without claiming safety", async () => {
    const report = await mapQuorum({ network: "stellar-pubnet" }, depsFor(mainnetFixture), NOW);
    expect(report.state).toBe("complete");
    expect(report.provesSafety).toBe(false);
    expect(report.coverageNotice).toMatch(/does not prove quorum intersection or network safety/);
    expect(report.coverageNotice).not.toMatch(/network is safe/i);
    expect(report.disagreements).toEqual([]);
    expect(report.organizations.find((row) => row.organization === "Alpha")?.removalBreaks).toBe(3);
  });

  it("keeps the nested unknown key and a stale toml disagreement", async () => {
    const nested = await mapQuorum({ network: "stellar-testnet" }, depsFor(nestedFixture), NOW);
    expect(nested.unresolvedKeys).toHaveLength(1);
    const mismatch = await mapQuorum({ network: "stellar-testnet" }, depsFor(mismatchFixture), NOW);
    expect(mismatch.state).toBe("partial");
    expect(mismatch.disagreements.some((row) => row.field === "home_domain")).toBe(true);
    expect(mismatch.sources[0]?.stale).toBe(true);
    expect(mismatch.sources[0]?.ageSeconds).toBe(sourceAgeSeconds(mismatchFixture.fetchedAt, NOW));
    expect(mismatch.coverageNotice).toMatch(/seconds old|stale|incomplete/i);
  });

  it("returns unavailable without inventing organizations", async () => {
    const report = await mapQuorum({ network: "stellar-testnet" }, unavailableDeps(), NOW);
    expect(report.state).toBe("unavailable");
    expect(report.organizations).toEqual([]);
    expect(report.provesSafety).toBe(false);
  });

  it("keeps the pubnet directory off the testnet path", async () => {
    expect(validatorDirectoryUrl("stellar-pubnet")).toBe("https://api.stellarbeat.io/v1");
    expect(validatorDirectoryUrl("stellar-pubnet")).not.toContain("testnet");
    const snapshot = await readValidatorSnapshot("stellar-pubnet", async (url) => {
      expect(String(url)).not.toContain("testnet");
      if (String(url).endsWith("/v1")) {
        return new Response(JSON.stringify({ fetchedAt: NOW.toISOString(), nodes: [] }), { status: 200 });
      }
      return new Response("down", { status: 503 });
    }, NOW);
    expect(snapshot.status).toBe("ok");
    expect(quorumRequestSchema.safeParse({ network: "other" }).success).toBe(false);
    expect(QUORUM_LIMITS.maxDepth).toBeGreaterThan(0);
  });
});
