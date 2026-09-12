import type { ReserveCounters, ReserveScenario } from "./schema";
import { validateCounters } from "./sponsorship";

export function applyScenario(before: ReserveCounters, scenario: ReserveScenario): ReserveCounters {
  const after = { ...before };
  const count = scenario.action === "none" ? 0 : scenario.count;
  if (scenario.action === "add_trustline" || scenario.action === "add_entry") after.subentryCount += count;
  if (scenario.action === "remove_trustline" || scenario.action === "remove_entry") after.subentryCount -= count;
  if (scenario.action === "sponsor_entry") after.numSponsoring += count;
  if (scenario.action === "end_sponsoring") after.numSponsoring -= count;
  if (scenario.action === "receive_sponsorship") after.numSponsored += count;
  if (scenario.action === "remove_sponsored") after.numSponsored -= count;
  return validateCounters(after);
}
