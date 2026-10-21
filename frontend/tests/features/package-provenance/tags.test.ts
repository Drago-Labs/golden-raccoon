import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "140.82.112.3", family: 4 }]);
  return { lookup, default: { lookup } };
});

import { fetchGithubTags, matchReleaseTags, parseGithubOwnerRepo } from "@/server/research/package-provenance/tagMatching";
import { stubResponse } from "./fixtures";

describe("parseGithubOwnerRepo", () => {
  it("parses a git+https repository URL", () => {
    expect(parseGithubOwnerRepo("git+https://github.com/stellar/example-sdk.git")).toEqual({ owner: "stellar", repo: "example-sdk" });
  });

  it("parses an ssh-style repository URL", () => {
    expect(parseGithubOwnerRepo("git@github.com:stellar/example-sdk.git")).toEqual({ owner: "stellar", repo: "example-sdk" });
  });

  it("returns null for a non-github host", () => {
    expect(parseGithubOwnerRepo("https://gitlab.com/stellar/example-sdk")).toBeNull();
  });

  it("returns null when no repository was declared", () => {
    expect(parseGithubOwnerRepo(null)).toBeNull();
  });
});

describe("matchReleaseTags", () => {
  it("matches a v-prefixed tag", () => {
    const result = matchReleaseTags("example-sdk", "1.2.0", ["v1.2.0", "v1.1.0"]);
    expect(result).toEqual({ state: "matched", expectedTag: "v1.2.0", note: "Matched tag v1.2.0 in the declared repository." });
  });

  it("matches a scoped-name@version tag", () => {
    const result = matchReleaseTags("@stellar/example-sdk", "1.2.0", ["@stellar/example-sdk@1.2.0"]);
    expect(result.state).toBe("matched");
  });

  it("reports no_matching_tag when nothing lines up", () => {
    const result = matchReleaseTags("example-sdk", "9.9.9", ["v1.0.0"]);
    expect(result.state).toBe("no_matching_tag");
  });
});

describe("fetchGithubTags", () => {
  it("collects tags across a single page", async () => {
    const fetchImpl = vi.fn(async () => stubResponse(200, [{ name: "v1.0.0" }, { name: "v0.9.0" }]));
    const result = await fetchGithubTags("stellar", "example-sdk", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("ok");
    if (result.outcome !== "ok") throw new Error("expected ok");
    expect(result.tags).toEqual(["v1.0.0", "v0.9.0"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports not_found for a missing repository", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, headers: new Headers(), text: async () => "" }) as unknown as Response);
    const result = await fetchGithubTags("stellar", "does-not-exist", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("not_found");
  });

  it("reports rate_limited on a 403", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 403, headers: new Headers(), text: async () => "" }) as unknown as Response);
    const result = await fetchGithubTags("stellar", "example-sdk", fetchImpl as unknown as typeof fetch);
    expect(result.outcome).toBe("rate_limited");
  });
});
