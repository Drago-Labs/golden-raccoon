import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { request } from "./fixtures";

const fetchState = vi.hoisted(() => ({
  npmOutcome: "ok" as string,
}));

vi.mock("@/server/research/package-provenance/npmRegistry", () => ({
  fetchNpmPackage: async () =>
    fetchState.npmOutcome === "ok"
      ? {
          outcome: "ok",
          packageMeta: {
            name: "@stellar/example-sdk",
            repository: "git+https://github.com/stellar/example-sdk.git",
            versions: [{ version: "1.0.0", publishedAt: "2026-01-01T00:00:00.000Z", maintainers: ["alice"], scripts: [], hasAttestations: false }],
          },
        }
      : { outcome: fetchState.npmOutcome, issues: ["simulated failure"] },
  fetchNpmAttestationBundle: async () => ({ outcome: "none" }),
}));

vi.mock("@/server/research/package-provenance/cratesRegistry", () => ({
  fetchCratesPackage: async () => ({ outcome: "not_found", issues: ["crate not found"] }),
}));

vi.mock("@/server/research/package-provenance/tagMatching", () => ({
  fetchGithubTags: async () => ({ outcome: "not_found", issues: ["repository not found"] }),
  parseGithubOwnerRepo: (repo: string | null) => (repo ? { owner: "stellar", repo: "example-sdk" } : null),
  matchReleaseTags: () => ({ state: "unknown", expectedTag: null, note: "stub" }),
}));

const { POST } = await import("@/app/api/insights/package-provenance/route");

function post(body: unknown): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  return new NextRequest("http://localhost/api/insights/package-provenance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

describe("POST /api/insights/package-provenance", () => {
  it("returns a report for a reachable npm package", async () => {
    fetchState.npmOutcome = "ok";

    const response = await POST(post(request()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.packageName).toBe("@stellar/example-sdk");
    expect(body.report.supplyChainVerdict).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 400 for an invalid package name", async () => {
    const response = await POST(post(request({ packageName: "not a valid name!!" })));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_package_name");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await POST(post("not json"));
    expect(response.status).toBe(400);
  });

  it("returns 413 for an oversized payload", async () => {
    const response = await POST(post(request({ padding: "x".repeat(300_000) })));
    expect(response.status).toBe(413);
  });

  it("returns a report with unavailable coverage when the registry times out", async () => {
    fetchState.npmOutcome = "timeout";

    const response = await POST(post(request()));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.report.coverage.state).toBe("unavailable");
  });
});
