import { isProposalReady, readPendingQueue, type RpcAdapter } from "@/server/stellar/governance";
import type { GovernanceQueueView } from "./schema";

export async function inspectGovernanceQueue(deps: { adapter?: RpcAdapter; env?: NodeJS.ProcessEnv; nowSecs?: number } = {}): Promise<GovernanceQueueView> {
  const result = await readPendingQueue(deps);
  const now = deps.nowSecs ?? result.observedAtSecs;
  return {
    ...result,
    readiness: result.items.map((item) => ({
      id: item.id,
      ready: isProposalReady(item, now),
      note: item.cancelled
        ? "Cancelled — not executable from this view."
        : isProposalReady(item, now)
          ? "Timelock elapsed on the observed clock. This does not mean the proposal is authorized or safe to execute."
          : `Timelock opens at unix ${item.effectiveAt}.`,
    })),
  };
}
