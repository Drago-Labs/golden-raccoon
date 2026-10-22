import { describe, expect, it } from "vitest";
import { circulatingSupplyRequestSchema } from "@/server/research/circulating-supply/schema";
import missing from "./data/missing-evidence.json";
import { request } from "./fixtures";
describe("exclusions", () => { it("requires evidence on every excluded address", () => { expect(circulatingSupplyRequestSchema.safeParse({ ...request, exclusions: [missing] }).success).toBe(false); expect(circulatingSupplyRequestSchema.safeParse(request).success).toBe(true); }); });
