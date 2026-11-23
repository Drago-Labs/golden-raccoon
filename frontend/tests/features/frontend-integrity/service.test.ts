import { describe, expect, it } from "vitest";
import { FRONTEND_INTEGRITY_LIMITS } from "@/server/research/frontend-integrity/limits";
import { analyseFrontendIntegrity } from "@/server/research/frontend-integrity";
import { loadFixture } from "./fixtures";

describe("frontend integrity returns a typed state", () => {
  it("has an empty diff when the page did not change", () => {
    const result = analyseFrontendIntegrity(loadFixture("stable-site.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.report.diff.added).toHaveLength(0);
    expect(result.report.diff.removed).toHaveLength(0);
  });
  it("does not invent a snapshot when the origin times out", () => {
    expect(analyseFrontendIntegrity(loadFixture("provider-unavailable.json")).kind).toBe("unavailable");
    expect(analyseFrontendIntegrity("nope").kind).toBe("unknown_format");
    expect(FRONTEND_INTEGRITY_LIMITS.timeoutMs).toBe(8_000);
  });
});
