import { multisigDetail } from "./multisigDetails";
import { timelockDelay } from "./timelockDetails";
import type { ControllerKind, PrivilegeRecord } from "./schema";

/**
 * Classification order is deliberate: a delayed controller is a timelock even
 * when it also has a threshold. Otherwise a threshold above one is a multisig.
 * A non-empty controller address with neither is a single key. Anything else
 * stays unknown rather than being guessed.
 */
export function classifyController(record: PrivilegeRecord): ControllerKind {
  if (record.controller.trim() === "") return "unknown";
  if (timelockDelay(record) !== null) return "timelock";
  if (multisigDetail(record) !== null) return "multisig";
  return "single_key";
}
