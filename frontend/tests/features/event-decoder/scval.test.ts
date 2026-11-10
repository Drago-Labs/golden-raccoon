import { describe, expect, it } from "vitest";
import { decodeScVal } from "@/server/research/event-decoder";

describe("decodeScVal", () => {
  it("decodes large i128 hi/lo pairs using exact BigInt arithmetic without precision loss", () => {
    // hi = 1, lo = 0 -> 2^64 = 18446744073709551616
    expect(decodeScVal({ type: "i128", hi: "1", lo: "0" })).toBe("18446744073709551616");

    // Nested vectors and maps
    expect(
      decodeScVal({
        type: "map",
        entries: [{ key: { type: "symbol", value: "admin" }, val: { type: "address", value: "GADMIN" } }],
      }),
    ).toBe("{admin: GADMIN}");
  });
});
