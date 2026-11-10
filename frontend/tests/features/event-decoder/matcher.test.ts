import { describe, expect, it } from "vitest";
import {
  matchEventAgainstSpecs,
  type ContractEventSpecDef,
  type RawEventWindowResponse,
} from "@/server/research/event-decoder";
import tokenTransferFixture from "./data/token-transfer-events.json";
import unmatchedFixture from "./data/unmatched-event.json";

describe("matchEventAgainstSpecs", () => {
  it("matches a token transfer event against TransferEvent spec", () => {
    const specs = tokenTransferFixture.specs as unknown as ContractEventSpecDef[];
    const ev = (tokenTransferFixture.window as unknown as RawEventWindowResponse).pages[0]![0]!;
    const res = matchEventAgainstSpecs(ev, specs);
    expect(res.matched).toBe(true);
    expect(res.specName).toBe("TransferEvent");
    expect(res.fields.find((f) => f.name === "amount")?.value).toBe("18446744073709551616");
  });

  it("reports a clear per-event mismatch reason when no spec definition matches", () => {
    const specs = unmatchedFixture.specs as unknown as ContractEventSpecDef[];
    const ev = (unmatchedFixture.window as unknown as RawEventWindowResponse).pages[0]![0]!;
    const res = matchEventAgainstSpecs(ev, specs);
    expect(res.matched).toBe(false);
    expect(res.mismatchReason).toMatch(/custom_mystery_op/);
  });
});
