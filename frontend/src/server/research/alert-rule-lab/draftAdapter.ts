import type { LabRequest } from "./schema";
export function ruleFields(rule: LabRequest["draft"]) { return `${rule.direction}; threshold=${rule.threshold}; hysteresis=${rule.hysteresis}; cooldown=${rule.cooldownMinutes}m`; }
