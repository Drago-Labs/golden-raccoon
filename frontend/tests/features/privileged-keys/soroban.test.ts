import { describe, expect, it } from "vitest";
import { readSorobanAdmins } from "@/server/research/privileged-keys/sorobanAdmins";
import type { PrivilegeRecord } from "@/server/research/privileged-keys/schema";
import { loadFixture } from "./fixtures";

describe("Soroban admin rows are read separately from EVM roles", () => {
  it("returns the upgrade authority and the blank controller", () => {
    const fixture = loadFixture("mixed-chains.json") as { privileges: PrivilegeRecord[] };
    expect(readSorobanAdmins(fixture.privileges).map((row) => row.role)).toEqual(["upgrade", "unknown_admin"]);
  });
});
