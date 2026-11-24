import { getEvmNetwork } from "@/lib/evm/config";
import { normalizeEoaAddress } from "./addressInput";
import { buildAuthorizationHistory, type RawAuthorization } from "./authorizationHistory";
import { explainCapabilities } from "./capabilities";
import { createCodeReader, type CodeReader } from "./codeReader";
import { delegationCoverage } from "./coverage";
import { decodeDelegationDesignator } from "./designator";
import type { DelegationReport, DelegationRequest } from "./schema";
import { inspectDelegationTarget, type TargetEvidence } from "./targetInspection";

export async function inspectEoaDelegation(input: DelegationRequest, deps: { readCode?: CodeReader; readHistory?: () => Promise<RawAuthorization[]>; inspectTarget?: (target: string) => Promise<TargetEvidence> } = {}): Promise<DelegationReport> {
  const config = getEvmNetwork(input.network);
  if (!config) throw new Error("Unsupported chain");
  const address = normalizeEoaAddress(input.address);
  try {
    const code = await (deps.readCode ?? createCodeReader(config.rpcUrl))(address);
    const target = decodeDelegationDesignator(code);
    if (!target) return { address, network: input.network, state: "plain", target: null, implementation: null, verifiedSource: null, capabilities: ["No EIP-7702 delegation designator is currently installed."], history: [], coverage: delegationCoverage({ historyAvailable: false, sourceAvailable: false }) };
    const historyRows = deps.readHistory ? await deps.readHistory() : [];
    const evidence = deps.inspectTarget ? await deps.inspectTarget(target) : { verifiedSource: null, functionNames: [] };
    const inspected = inspectDelegationTarget(target, evidence);
    return { address, network: input.network, state: "delegated", target, implementation: inspected.implementation, verifiedSource: inspected.verifiedSource, capabilities: explainCapabilities(inspected), history: buildAuthorizationHistory(historyRows), coverage: delegationCoverage({ historyAvailable: Boolean(deps.readHistory), sourceAvailable: evidence.verifiedSource === true }) };
  } catch (error) {
    return { address, network: input.network, state: "unavailable", target: null, implementation: null, verifiedSource: null, capabilities: [], history: [], coverage: [error instanceof Error ? error.message : "Provider unavailable"] };
  }
}
