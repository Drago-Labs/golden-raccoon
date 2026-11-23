import { describe, expect, it } from "vitest";
import { classifyController } from "@/server/research/privileged-keys/controllerClassification";
import { multisigDetail } from "@/server/research/privileged-keys/multisigDetails";
import { timelockDelay } from "@/server/research/privileged-keys/timelockDetails";
import { buildPrivilegedKeyInventory } from "@/server/research/privileged-keys/service";
import type { PrivilegeRecord } from "@/server/research/privileged-keys/schema";
import { loadFixture } from "./fixtures";

describe("controller classification copies threshold and delay from the fixture", () => {
  it("marks a threshold of 2 as a multisig and a delay of 172800 as a timelock", () => {
    const mixed = loadFixture("mixed-chains.json") as { privileges: PrivilegeRecord[] };
    const safe = mixed.privileges[0];
    const lock = mixed.privileges[1];
    expect(classifyController(safe)).toBe("multisig");
    expect(multisigDetail(safe)).toEqual({ threshold: 2, signerCount: 2 });
    expect(classifyController(lock)).toBe("timelock");
    expect(timelockDelay(lock)).toBe(172800);
    expect(classifyController(mixed.privileges[2])).toBe("unknown");
    const single = loadFixture("single-key-project.json");
    const report = buildPrivilegedKeyInventory(single);
    expect(report.kind).toBe("ready");
    if (report.kind === "ready") expect(report.report.controllers[0].kind).toBe("single_key");
  });
});
