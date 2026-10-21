import { describe, expect, it } from "vitest";
import { classifyCratesProvenance, classifyNpmProvenance, classifyNpmProvenanceSkipped } from "@/server/research/package-provenance/provenance";
import { unifiedRelease } from "./fixtures";

describe("classifyNpmProvenance", () => {
  it("marks a release verified when an attestation decoded cleanly", () => {
    const result = classifyNpmProvenance({ outcome: "ok", sourceRepository: "https://github.com/stellar/example-sdk", workflowPath: ".github/workflows/publish.yml", commit: "abc123", buildRunUrl: "https://github.com/stellar/example-sdk/actions/runs/1" });
    expect(result.verdict).toBe("verified");
    expect(result.sourceRepository).toBe("https://github.com/stellar/example-sdk");
  });

  it("marks a release unverified when no attestation was present", () => {
    const result = classifyNpmProvenance({ outcome: "none" });
    expect(result.verdict).toBe("unverified");
    expect(result.sourceRepository).toBeNull();
  });

  it("marks a release unavailable when the attestation fetch failed", () => {
    const result = classifyNpmProvenance({ outcome: "unavailable", issues: ["timeout"] });
    expect(result.verdict).toBe("unavailable");
    expect(result.notes).toContain("timeout");
  });
});

describe("classifyNpmProvenanceSkipped", () => {
  it("marks a release unavailable with a budget note, not a failure note", () => {
    const result = classifyNpmProvenanceSkipped();
    expect(result.verdict).toBe("unavailable");
    expect(result.notes[0]).toMatch(/budget/);
  });
});

describe("classifyCratesProvenance", () => {
  it("marks a release verified when Trusted Publishing data is present", () => {
    const release = unifiedRelease({ cratesTrustedPublishing: { provider: "github", repository: "stellar/example-crate", runId: "42", sha: "deadbeef" } });
    const result = classifyCratesProvenance(release);
    expect(result.verdict).toBe("verified");
    expect(result.sourceRepository).toBe("https://github.com/stellar/example-crate");
    expect(result.commit).toBe("deadbeef");
    expect(result.buildRunUrl).toBe("https://github.com/stellar/example-crate/actions/runs/42");
  });

  it("marks a release unverified when no Trusted Publishing data is present", () => {
    const release = unifiedRelease({ cratesTrustedPublishing: null });
    const result = classifyCratesProvenance(release);
    expect(result.verdict).toBe("unverified");
  });
});
