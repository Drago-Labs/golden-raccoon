import { describe, expect, it } from "vitest";
import { hashContent, snapshotIdFor } from "@/server/research/policy-changes/contentHash";

describe("hashContent", () => {
  it("is deterministic for identical text", () => {
    expect(hashContent("hello")).toBe(hashContent("hello"));
  });

  it("differs for different text", () => {
    expect(hashContent("hello")).not.toBe(hashContent("hello world"));
  });
});

describe("snapshotIdFor", () => {
  it("is deterministic for the same inputs", () => {
    const a = snapshotIdFor("project", "2026-01-01T00:00:00.000Z", "hash");
    const b = snapshotIdFor("project", "2026-01-01T00:00:00.000Z", "hash");
    expect(a).toBe(b);
  });

  it("differs when the content hash differs", () => {
    const a = snapshotIdFor("project", "2026-01-01T00:00:00.000Z", "hash-a");
    const b = snapshotIdFor("project", "2026-01-01T00:00:00.000Z", "hash-b");
    expect(a).not.toBe(b);
  });
});
