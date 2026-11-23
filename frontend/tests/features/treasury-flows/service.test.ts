import { describe, expect, it } from "vitest";
import { TreasuryError } from "@/server/research/treasury-flows/errors";
import { TREASURY_LIMITS } from "@/server/research/treasury-flows/limits";
import { analyseTreasury } from "@/server/research/treasury-flows";
import { loadFixture } from "./fixtures";
describe("treasury typed states", () => {
  it("returns unavailable without inventing a balance", () => {
    expect(analyseTreasury(loadFixture("provider-unavailable.json"))).toEqual({ kind: "unavailable", reason: "The horizon endpoint timed out." });
    expect(analyseTreasury([]).kind).toBe("unknown_format");
    expect(new TreasuryError("x", "y").code).toBe("x");
    expect(TREASURY_LIMITS.maxAddresses).toBe(30);
  });
});
