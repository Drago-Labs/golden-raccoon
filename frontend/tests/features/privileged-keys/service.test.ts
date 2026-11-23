import { describe, expect, it } from "vitest";
import { PrivilegedKeysError } from "@/server/research/privileged-keys/errors";
import { buildPrivilegedKeyInventory } from "@/server/research/privileged-keys";
import { PRIVILEGED_KEY_LIMITS } from "@/server/research/privileged-keys/limits";
import { parseInventoryInput } from "@/server/research/privileged-keys/projectInput";
import { loadFixture } from "./fixtures";

describe("the inventory service returns a typed state for every fixture", () => {
  it("classifies every controller in the mixed fixture, including the unknown one", () => {
    const result = buildPrivilegedKeyInventory(loadFixture("mixed-chains.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    const kinds = result.report.controllers.map((row) => row.kind).sort();
    expect(kinds).toEqual(["multisig", "timelock", "unknown"]);
    expect(result.report.summary).toEqual({ multisig: 1, timelock: 1, singleKey: 0, unknown: 1 });
  });

  it("reports provider failure without inventing controllers", () => {
    const result = buildPrivilegedKeyInventory(loadFixture("provider-unavailable.json"));
    expect(result).toEqual({ kind: "unavailable", reason: "The RPC did not answer before the timeout." });
  });

  it("rejects a privilege field that is not a list", () => {
    expect(buildPrivilegedKeyInventory({ projectId: "x", privileges: "nope" }).kind).toBe("unknown_format");
    expect(() => parseInventoryInput([])).toThrow(PrivilegedKeysError);
    expect(PRIVILEGED_KEY_LIMITS.maxContracts).toBeGreaterThan(0);
  });
});
