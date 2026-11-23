import { describe, expect, it } from "vitest";
import { categorizeOutflows } from "@/server/research/treasury-flows/categorization";
import { labelKind } from "@/server/research/treasury-flows/destinationLabels";
import { readOutflows } from "@/server/research/treasury-flows/outflowReader";
import { analyseTreasury } from "@/server/research/treasury-flows/service";
import { loadFixture } from "./fixtures";
describe("unlabeled destinations stay unknown", () => {
  it("does not promote an unlabeled address to an exchange", () => {
    expect(labelKind(undefined)).toBe("unknown");
    expect(labelKind("wallet")).toBe("unknown");
    expect(labelKind("exchange")).toBe("exchange");
    const result = analyseTreasury(loadFixture("undeclared-movement.json"));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.report.outflows[0].kind).toBe("unknown");
    expect(categorizeOutflows(readOutflows((loadFixture("active-treasury.json") as { outflows: unknown }).outflows))[0].kind).toBe("exchange");
  });
});
