import { describe, expect, it } from "vitest"; import { evaluateSequence } from "@/server/research/alert-rule-lab"; import { draft, observation } from "./fixtures";
describe("rule replay semantics", () => {
  it("matches the exact threshold then applies dedupe, hysteresis and cooldown", () => { const timeline = evaluateSequence(draft, [observation("hit", 75, 0), observation("duplicate", 75, 1), observation("recover", 69, 2), observation("cooldown", 80, 30)]); expect(timeline.map((item) => [item.outcome, item.reason])).toEqual([["match", "Threshold matched."], ["suppressed", "Duplicate evidence or value."], ["recovered", "Signal cleared the hysteresis band."], ["suppressed", "Cooldown is active."]]); });
  it("uses inclusive low-is-bad boundaries", () => expect(evaluateSequence({ ...draft, direction: "low_is_bad", threshold: 10 }, [observation("low", 10, 0)])[0].outcome).toBe("match"));
});
