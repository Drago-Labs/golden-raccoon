import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "104.16.0.1", family: 4 }]);
  return { lookup, default: { lookup } };
});

import { PackageProvenanceError } from "@/server/research/package-provenance/errors";
import { fetchNpmAttestationBundle, fetchNpmPackage } from "@/server/research/package-provenance/npmRegistry";
import { inspectPackageProvenance } from "@/server/research/package-provenance/service";
import { cratesCrateFixture, noopDeps, npmAttestationBundleFixture, npmPackumentFixture, request, stubResponse } from "./fixtures";

describe("inspectPackageProvenance", () => {
  it("rejects a malformed request", async () => {
    await expect(inspectPackageProvenance({ registry: "npm" }, noopDeps())).rejects.toBeInstanceOf(PackageProvenanceError);
  });

  it("rejects a package name that is not valid for the registry", async () => {
    await expect(inspectPackageProvenance(request({ packageName: "not a valid name!!" }), noopDeps())).rejects.toMatchObject({ code: "invalid_package_name" });
  });

  it("builds a complete npm report with maintainer changes, provenance, and tag matches", async () => {
    const packumentFetchImpl = vi.fn(async () => stubResponse(200, npmPackumentFixture({ withAttestations: true })));
    const attestationFetchImpl = vi.fn(async () => stubResponse(200, npmAttestationBundleFixture("https://github.com/stellar/example-sdk", "abc123")));

    const deps = {
      ...noopDeps(),
      fetchNpmPackage: (name: string) => fetchNpmPackage(name, packumentFetchImpl as unknown as typeof fetch),
      fetchNpmAttestationBundle: (name: string, version: string) => fetchNpmAttestationBundle(name, version, attestationFetchImpl as unknown as typeof fetch),
      fetchGithubTags: async () => ({ outcome: "ok" as const, tags: ["v1.2.0", "v1.1.0", "v1.0.0"] }),
    };

    const report = await inspectPackageProvenance(request(), deps);

    expect(report.registry).toBe("npm");
    expect(report.releases.map((r) => r.version)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
    expect(report.maintainerChanges).toEqual([{ fromVersion: "1.1.0", toVersion: "1.2.0", added: ["mallory"], removed: [] }]);
    expect(report.releases[0].provenance.verdict).toBe("verified");
    expect(report.releases[0].provenance.sourceRepository).toBe("https://github.com/stellar/example-sdk");
    expect(report.releases.every((r) => r.tagMatch.state === "matched")).toBe(true);
    expect(report.coverage.state).toBe("complete");
    expect(report.supplyChainVerdict).toBeNull();
  });

  it("builds a crates.io report using embedded Trusted Publishing data without an extra fetch", async () => {
    const { fetchCratesPackage } = await import("@/server/research/package-provenance/cratesRegistry");
    const crateFetchImpl = vi.fn(async () => stubResponse(200, cratesCrateFixture({ withTrustpub: true })));

    const deps = {
      ...noopDeps(),
      fetchCratesPackage: (name: string) => fetchCratesPackage(name, crateFetchImpl as unknown as typeof fetch),
      fetchGithubTags: async () => ({ outcome: "not_found" as const, issues: ["repository not found"] }),
    };

    const report = await inspectPackageProvenance(request({ registry: "crates", packageName: "example-crate" }), deps);

    expect(report.registry).toBe("crates");
    expect(report.releases[0].provenance.verdict).toBe("verified");
    expect(report.releases[0].maintainers).toBeNull();
    expect(report.coverage.state).toBe("partial");
  });

  it("leaves coverage unavailable when the registry cannot be reached", async () => {
    const deps = { ...noopDeps(), fetchNpmPackage: async () => ({ outcome: "timeout" as const, issues: ["The operation was aborted."] }) };

    const report = await inspectPackageProvenance(request(), deps);

    expect(report.coverage.state).toBe("unavailable");
    expect(report.releases).toEqual([]);
  });

  it("reports empty coverage when the registry has no published releases", async () => {
    const deps = { ...noopDeps(), fetchNpmPackage: async () => ({ outcome: "ok" as const, packageMeta: { name: "@stellar/example-sdk", repository: null, versions: [] } }) };

    const report = await inspectPackageProvenance(request(), deps);

    expect(report.coverage.state).toBe("empty");
  });
});
