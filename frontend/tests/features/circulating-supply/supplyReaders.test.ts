import { describe, expect, it } from "vitest";
import { decimalToUnits } from "@/server/research/circulating-supply/stellarSupplyReader";
import { tokenIdentity } from "@/server/research/circulating-supply/tokenIdentity";
import { request } from "./fixtures";
describe("supply readers", () => { it("normalises identities and fixed-point Stellar amounts", () => { expect(tokenIdentity(request.token)).toContain("1:0x"); expect(decimalToUnits("12.345", 7)).toBe("123450000"); }); });
