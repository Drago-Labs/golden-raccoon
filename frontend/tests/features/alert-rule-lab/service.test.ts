import { describe, expect, it } from "vitest"; import { replayAlertRule } from "@/server/research/alert-rule-lab"; import { observation, request } from "./fixtures";
describe("rule lab report", () => {
  it("sorts deterministically and marks missing coverage as partial", () => { const result = replayAlertRule(request([observation("later", null, 20), observation("earlier", 80, 0)])); expect(result.state).toBe("partial"); expect(result.timeline.map((item) => item.id)).toEqual(["earlier", "later"]); expect(result.summary.coverage).toBe(0.5); expect(result.warnings[0]).toContain("out of order"); });
  it("compares saved and draft counts without mutation", () => { const input = { ...request([observation("hit", 80, 0)]), saved: { ...request([]).draft, threshold: 90 } }; const before = JSON.stringify(input); const result = replayAlertRule(input); expect(result.summary).toMatchObject({ draftAlerts: 1, savedAlerts: 0, delta: 1 }); expect(JSON.stringify(input)).toBe(before); });
  it("distinguishes a valid empty report", () => expect(replayAlertRule(request([])).state).toBe("empty"));
});
