import { classifyController } from "./controllerClassification";
import { multisigDetail } from "./multisigDetails";
import { timelockDelay } from "./timelockDetails";
import type { ControllerView, PrivilegeRecord } from "./schema";

/** One row per controller address, listing every contract that address can change. */
export function groupByController(records: PrivilegeRecord[]): ControllerView[] {
  const groups = new Map<string, ControllerView>();
  for (const record of records) {
    const key = record.controller.trim().toLowerCase() || "(unknown)";
    const existing = groups.get(key);
    const kind = classifyController(record);
    const multi = multisigDetail(record);
    const delay = timelockDelay(record);
    if (!existing) {
      groups.set(key, {
        address: record.controller.trim() === "" ? "(unknown)" : record.controller,
        kind,
        threshold: multi?.threshold ?? null,
        signerCount: multi?.signerCount ?? null,
        delaySeconds: delay,
        contracts: [record.contract],
        capabilities: [record.role],
      });
      continue;
    }
    if (!existing.contracts.includes(record.contract)) existing.contracts.push(record.contract);
    if (!existing.capabilities.includes(record.role)) existing.capabilities.push(record.role);
    if (existing.kind === "single_key" && kind !== "single_key") existing.kind = kind;
    if (multi && existing.threshold === null) {
      existing.threshold = multi.threshold;
      existing.signerCount = multi.signerCount;
    }
    if (delay !== null && existing.delaySeconds === null) existing.delaySeconds = delay;
  }
  return [...groups.values()].sort((a, b) => b.contracts.length - a.contracts.length);
}
