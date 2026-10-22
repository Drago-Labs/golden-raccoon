import { describe, expect, it } from "vitest";
import { reconcileCirculatingSupply } from "@/server/research/circulating-supply";
import { supplyCoverage } from "@/server/research/circulating-supply/coverage";
import { reportedSources } from "@/server/research/circulating-supply/reportedSources";
import { CIRCULATING_SUPPLY_LIMITS } from "@/server/research/circulating-supply/limits";
import { deps, request } from "./fixtures";
describe("service", () => { it("reconciles a recorded snapshot exactly", async () => { const report = await reconcileCirculatingSupply(request, deps); expect(report.impliedSupply).toBe("800000"); expect(report.comparisons).toHaveLength(2); expect(report.readOnly).toBe(true); expect(supplyCoverage(1, 2)).toMatch(/independently/); expect(reportedSources(request.reportedSources)[0]?.name).toBe("Index provider"); expect(CIRCULATING_SUPPLY_LIMITS.timeoutMs).toBeGreaterThan(0); }); it("keeps provider failure unknown", async () => { const report = await reconcileCirculatingSupply(request, { read: async () => { throw new Error("timeout"); } }); expect(report.state).toBe("unavailable"); expect(report.impliedSupply).toBeNull(); }); });
