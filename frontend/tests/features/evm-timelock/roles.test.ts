import { describe, expect, it } from "vitest";
import { summarizeTimelockRoles } from "@/server/research/evm-timelock";
import openExec from "./data/open-executor.json";

describe("summarizeTimelockRoles", () => {
  it("flags an open executor role (zero address) and EOA admins", () => {
    const summary = summarizeTimelockRoles(openExec.roles);
    expect(summary.openExecutor).toBe(true);
    expect(summary.eoaAdmins).toEqual(["0x5555555555555555555555555555555555555555"]);
  });
});
