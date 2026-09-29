import { ruleFields } from "./draftAdapter";
import { fingerprint, inCooldown } from "./suppression";
import type { LabRequest, TimelineItem } from "./schema";

export function evaluateSequence(rule: LabRequest["draft"], observations: LabRequest["observations"]): TimelineItem[] {
  let active = false; let lastFingerprint: string | null = null; let lastValue: number | null = null; let lastResolvedAt: number | null = null;
  return observations.map((observation) => {
    const base = { id: observation.id, observedAt: observation.observedAt, value: observation.value, ruleFields: ruleFields(rule) };
    if (observation.value === null || observation.incomplete) return { ...base, outcome: "missing" as const, reason: "Observation data is missing or incomplete." };
    if (!rule.enabled) return { ...base, outcome: "suppressed" as const, reason: "Rule is disabled." };
    if (rule.observationKey && rule.observationKey !== observation.observationKey) return { ...base, outcome: "suppressed" as const, reason: "Observation key mismatch." };
    const bad = rule.direction === "low_is_bad" ? observation.value <= rule.threshold : observation.value >= rule.threshold;
    const recovered = rule.direction === "low_is_bad" ? observation.value > rule.threshold + rule.hysteresis : observation.value < Math.max(0, rule.threshold - rule.hysteresis);
    if (active && recovered) { active = false; lastResolvedAt = new Date(observation.observedAt).getTime(); lastFingerprint = null; lastValue = null; return { ...base, outcome: "recovered" as const, reason: "Signal cleared the hysteresis band." }; }
    if (!bad) return { ...base, outcome: "suppressed" as const, reason: "Threshold did not match." };
    const currentFingerprint = fingerprint(observation);
    if (active && (currentFingerprint === lastFingerprint || observation.value === lastValue)) return { ...base, outcome: "suppressed" as const, reason: "Duplicate evidence or value." };
    if (active) { lastFingerprint = currentFingerprint; lastValue = observation.value; return { ...base, outcome: "deteriorated" as const, reason: "Active alert received worsening evidence." }; }
    if (inCooldown(lastResolvedAt, new Date(observation.observedAt).getTime(), rule.cooldownMinutes)) return { ...base, outcome: "suppressed" as const, reason: "Cooldown is active." };
    active = true; lastFingerprint = currentFingerprint; lastValue = observation.value; return { ...base, outcome: "match" as const, reason: "Threshold matched." };
  });
}
