import { describe, expect, it } from "vitest";
import { parseEnvMeta, parseSpecMeta } from "@/server/research/wasm-source-meta/envMeta";
import { parseContractMeta } from "@/server/research/wasm-source-meta/metaParser";
import { findSection, parseCustomSections } from "@/server/research/wasm-source-meta/customSections";
import {
  encodeEnvPayload,
  encodeMetaPayload,
  encodeSpecPayload,
  matchingMetaWasm,
  noMetaWasm,
} from "./fixtures";

describe("metaParser", () => {
  it("extracts repository, commit, and SDK fields from contractmetav0", () => {
    const sections = parseCustomSections(matchingMetaWasm);
    const payload = findSection(sections, "contractmetav0")!.payload;
    const meta = parseContractMeta(payload);
    expect(meta.sectionPresent).toBe(true);
    expect(meta.repository).toBe("https://github.com/example/matching-contract");
    expect(meta.commit).toBe("abc123def456");
    expect(meta.sdkVersion).toBe("22.0.0");
    expect(meta.rustVersion).toBe("1.84.0");
    expect(meta.buildTool).toBe("soroban-cli");
  });

  it("reports absent when no meta section exists", () => {
    const meta = parseContractMeta(null);
    expect(meta.sectionPresent).toBe(false);
    expect(meta.repository).toBeNull();
    expect(meta.entries).toEqual([]);
  });

  it("round-trips encoder payload keys", () => {
    const payload = encodeMetaPayload({ rssdkver: "22.0.0", repo: "r" });
    const meta = parseContractMeta(payload);
    expect(meta.sdkVersion).toBe("22.0.0");
    expect(meta.repository).toBe("r");
  });
});

describe("envMeta", () => {
  it("parses interface version from contractenvmetav0", () => {
    const sections = parseCustomSections(matchingMetaWasm);
    const env = parseEnvMeta(findSection(sections, "contractenvmetav0")!.payload);
    expect(env.sectionPresent).toBe(true);
    expect(env.interfaceVersion).toBe("23");
  });

  it("parses spec entry count", () => {
    const sections = parseCustomSections(matchingMetaWasm);
    const spec = parseSpecMeta(findSection(sections, "contractspecv0")!.payload);
    expect(spec.entryCount).toBe(3);
  });

  it("marks sections absent for empty Wasm", () => {
    expect(parseCustomSections(noMetaWasm)).toEqual([]);
    expect(parseEnvMeta(null).sectionPresent).toBe(false);
    expect(parseSpecMeta(null).sectionPresent).toBe(false);
    expect(parseEnvMeta(encodeEnvPayload(1n)).interfaceVersion).toBe("1");
    expect(parseSpecMeta(encodeSpecPayload(0)).entryCount).toBe(0);
  });
});
