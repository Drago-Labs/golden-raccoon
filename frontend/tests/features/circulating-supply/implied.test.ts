import { describe, expect, it } from "vitest";
import { impliedSupply } from "@/server/research/circulating-supply/impliedSupply";
describe("implied supply", () => { it("subtracts excluded balances exactly", () => { expect(impliedSupply("1000000", "200000")).toBe("800000"); }); });
