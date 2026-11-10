import { describe, expect, it } from "vitest";
import { decodeTimelockCall } from "@/server/research/evm-timelock";

describe("decodeTimelockCall", () => {
  it("decodes known selectors and keeps undecodable calldata raw with target", () => {
    const decoded = decodeTimelockCall({
      index: 0,
      target: "0x1111111111111111111111111111111111111111",
      valueWei: "0",
      data: "0xe177246e0000000000000000000000000000000000000000000000000000000000015180",
    });
    expect(decoded.decoded).toBe(true);
    expect(decoded.functionName).toBe("updateDelay");
    expect(decoded.args).toEqual(["86400"]);

    const raw = decodeTimelockCall({
      index: 1,
      target: "0x1111111111111111111111111111111111111111",
      valueWei: "0",
      data: "0xdeadbeef1234",
    });
    expect(raw.decoded).toBe(false);
    expect(raw.rawData).toBe("0xdeadbeef1234");
  });
});
