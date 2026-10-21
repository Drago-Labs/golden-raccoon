import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { lookup, default: { lookup } };
});

import { fetchCratesPackage } from "@/server/research/package-provenance/cratesRegistry";
import { fetchNpmAttestationBundle, fetchNpmPackage } from "@/server/research/package-provenance/npmRegistry";
import { cratesCrateFixture, npmAttestationBundleFixture, npmPackumentFixture, stubResponse } from "./fixtures";

describe("fetchNpmPackage", () => {
  it("parses versions newest-first with maintainers, scripts, and attestation presence", async () => {
    const fixture = npmPackumentFixture({ withAttestations: true, scriptsByVersion: { "1.2.0": { postinstall: "node setup.js" } } });
    const fetchImpl = vi.fn(async () => stubResponse(200, fixture));

    const result = await fetchNpmPackage("@stellar/example-sdk", fetchImpl as unknown as typeof fetch);

    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") throw new Error("expected ok");
    expect(result.packageMeta.repository).toBe("git+https://github.com/stellar/example-sdk.git");
    expect(result.packageMeta.versions.map((v) => v.version)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
    expect(result.packageMeta.versions[0].maintainers).toEqual(["alice", "mallory"]);
    expect(result.packageMeta.versions[0].scripts).toEqual(["postinstall"]);
    expect(result.packageMeta.versions[0].hasAttestations).toBe(true);
    expect(result.packageMeta.versions[1].hasAttestations).toBe(false);
  });

  it("reports not_found for a 404", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), text: async () => "" }) as unknown as Response);
    const result = await fetchNpmPackage("does-not-exist", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("not_found");
  });
});

describe("fetchNpmAttestationBundle", () => {
  it("decodes a SLSA provenance attestation into source, workflow, and commit", async () => {
    const bundle = npmAttestationBundleFixture("https://github.com/stellar/example-sdk", "abc123commit");
    const fetchImpl = vi.fn(async () => stubResponse(200, bundle));

    const result = await fetchNpmAttestationBundle("@stellar/example-sdk", "1.2.0", fetchImpl as unknown as typeof fetch);

    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") throw new Error("expected ok");
    expect(result.sourceRepository).toBe("https://github.com/stellar/example-sdk");
    expect(result.commit).toBe("abc123commit");
    expect(result.workflowPath).toBe(".github/workflows/publish.yml");
  });

  it("reports none when the attestations endpoint 404s", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), text: async () => "" }) as unknown as Response);
    const result = await fetchNpmAttestationBundle("@stellar/example-sdk", "0.1.0", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("none");
  });
});

describe("fetchCratesPackage", () => {
  it("parses versions newest-first with trusted-publishing provenance", async () => {
    const fixture = cratesCrateFixture({ withTrustpub: true });
    const fetchImpl = vi.fn(async () => stubResponse(200, fixture));

    const result = await fetchCratesPackage("example-crate", fetchImpl as unknown as typeof fetch);

    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") throw new Error("expected ok");
    expect(result.crateMeta.repository).toBe("https://github.com/stellar/example-crate");
    expect(result.crateMeta.versions.map((v) => v.version)).toEqual(["0.3.0", "0.2.0", "0.1.0"]);
    expect(result.crateMeta.versions[0].trustedPublishing).toEqual({ provider: "github", repository: "stellar/example-crate", runId: "999", sha: "cccccccccccccccccccccccccccccccccccccccc" });
    expect(result.crateMeta.versions[1].trustedPublishing).toBeNull();
  });

  it("reports not_found for a 404", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), text: async () => "" }) as unknown as Response);
    const result = await fetchCratesPackage("does-not-exist", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("not_found");
  });

  it("reports http_error on a server error", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 503, headers: new Headers(), text: async () => "" }) as unknown as Response);
    const result = await fetchCratesPackage("example-crate", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("http_error");
  });
});
