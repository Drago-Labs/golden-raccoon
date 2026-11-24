import { describe, expect, it } from "vitest";
import { explainCapabilities } from "@/server/research/eoa-delegation/capabilities";
import { supportedDelegationChain } from "@/server/research/eoa-delegation/chainSupport";
import { DelegationInspectionError } from "@/server/research/eoa-delegation/errors";
import { knownImplementation } from "@/server/research/eoa-delegation/knownImplementations";
import { inspectDelegationTarget } from "@/server/research/eoa-delegation/targetInspection";
import { TARGET } from "./fixtures";
describe("delegation capabilities", () => { it("labels unknown targets unknown rather than safe", () => { expect(explainCapabilities({ implementation: null, verifiedSource: null, privilegedFunctions: [] })[0]).toMatch(/Unknown/); }); it("cites privileged verified functions", () => { const target = inspectDelegationTarget(TARGET, { verifiedSource: true, functionNames: ["execute", "name"] }); expect(target.privilegedFunctions).toEqual(["execute"]); expect(knownImplementation(TARGET)).toMatch(/smart account/); expect(explainCapabilities(target)[0]).toMatch(/execute/); }); it("covers chains and typed errors", () => { expect(supportedDelegationChain("ethereum")).toBe(true); expect(supportedDelegationChain("unknown")).toBe(false); expect(new DelegationInspectionError("provider_unavailable", "down").code).toBe("provider_unavailable"); }); });
