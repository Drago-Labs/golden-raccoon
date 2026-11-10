import { describe, expect, it } from "vitest";
import { scanRuntimeBytecode } from "@/server/research/metamorphic-check";

describe("scanRuntimeBytecode", () => {
  it("detects executable SELFDESTRUCT and skips 0xff inside PUSH immediate bytes", () => {
    expect(scanRuntimeBytecode("0x6000ff").hasSelfDestruct).toBe(true);
    expect(scanRuntimeBytecode("0x60ff5000").hasSelfDestruct).toBe(false);
  });
});
