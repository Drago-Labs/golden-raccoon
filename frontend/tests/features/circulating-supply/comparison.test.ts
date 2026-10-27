import { describe, expect, it } from "vitest";
import { compareReported } from "@/server/research/circulating-supply/comparison";
import { request } from "./fixtures";
describe("comparison", () => { it("keeps disagreeing reports side by side", () => { const rows = compareReported(request.reportedSources, "800000"); expect(rows).toHaveLength(2); expect(rows.map((row) => row.gap)).toEqual(["0", "50000"]); }); });
