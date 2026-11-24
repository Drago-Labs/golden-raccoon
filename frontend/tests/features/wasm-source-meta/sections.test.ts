import { describe, expect, it } from "vitest";
import { findSection, parseCustomSections } from "@/server/research/wasm-source-meta/customSections";
import {
  buildWasm,
  conflictingMetaWasm,
  encodeMetaPayload,
  matchingMetaWasm,
  noMetaWasm,
} from "./fixtures";

describe("customSections", () => {
  it("parses fixture Wasm custom sections without executing them", () => {
    const sections = parseCustomSections(matchingMetaWasm);
    expect(sections.map((section) => section.name)).toEqual([
      "contractmetav0",
      "contractenvmetav0",
      "contractspecv0",
    ]);
    expect(findSection(sections, "contractmetav0")?.payload.length).toBeGreaterThan(0);
  });

  it("returns empty list when no custom sections exist", () => {
    expect(parseCustomSections(noMetaWasm)).toEqual([]);
  });

  it("reads conflicting fixture section names", () => {
    const sections = parseCustomSections(conflictingMetaWasm);
    expect(findSection(sections, "contractmetav0")).not.toBeNull();
    expect(findSection(sections, "missing")).toBeNull();
  });

  it("preserves meta payload bytes from the encoder", () => {
    const payload = encodeMetaPayload({ repo: "https://example.com" });
    const sections = parseCustomSections(buildWasm([{ name: "contractmetav0", payload }]));
    expect(findSection(sections, "contractmetav0")?.payload).toEqual(payload);
  });
});
