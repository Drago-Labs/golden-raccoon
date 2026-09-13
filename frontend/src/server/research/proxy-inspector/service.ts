import { getEvmNetwork } from "@/lib/evm/config";
import { authorityEvidence } from "./authorityEvidence";
import { resolveBeacon } from "./beaconResolver";
import { classify } from "./classification";
import { hasCode } from "./codeReader";
import { addNode } from "./implementationGraph";
import type { ProxyResult } from "./schema";
import { ERC1967_SLOTS, addressFromSlot } from "./standardSlots";
import { JsonRpcReader, type RpcReader } from "./storageReader";

export async function inspectProxy(input: { network: string; contractAddress: string; blockNumber?: number }, deps: { reader?: RpcReader } = {}): Promise<ProxyResult> {
  const config = getEvmNetwork(input.network);
  if (!config) throw new Error("Unsupported network");
  const reader = deps.reader ?? new JsonRpcReader(config.rpcUrl);
  const observations: ProxyResult["observations"] = [];
  const nodes: ProxyResult["nodes"] = [];
  const edges: ProxyResult["edges"] = [];
  try {
    const observed = input.blockNumber ?? Number.parseInt(String(await reader.call("eth_blockNumber", [])), 16);
    const block = "0x" + observed.toString(16);
    const code = await hasCode(reader, input.contractAddress, block);
    observations.push({ kind: "code", address: input.contractAddress, detail: code ? "bytecode present" : "no bytecode", ok: code });
    addNode(nodes, { address: input.contractAddress, role: "proxy", code });
    const slots = await Promise.all(Object.entries(ERC1967_SLOTS).map(async ([name, slot]) => {
      const raw = String(await reader.call("eth_getStorageAt", [input.contractAddress, slot, block]));
      observations.push({ kind: "slot", address: input.contractAddress, detail: name + "=" + raw, ok: true });
      return [name, addressFromSlot(raw)] as const;
    }));
    const values = Object.fromEntries(slots) as Record<keyof typeof ERC1967_SLOTS, string | null>;
    const conflict = Boolean(values.implementation && values.beacon);
    let target = values.implementation;
    if (values.beacon) {
      addNode(nodes, { address: values.beacon, role: "beacon", code: await hasCode(reader, values.beacon, block) });
      edges.push({ from: input.contractAddress, to: values.beacon, kind: "beacon" });
      try { target = await resolveBeacon(reader, values.beacon, block); observations.push({ kind: "call", address: values.beacon, detail: "implementation()=" + target, ok: Boolean(target) }); }
      catch { observations.push({ kind: "call", address: values.beacon, detail: "implementation() reverted", ok: false }); }
    }
    if (target) {
      const seen = new Set([input.contractAddress.toLowerCase(), values.beacon?.toLowerCase()]);
      if (seen.has(target.toLowerCase())) observations.push({ kind: "call", address: target, detail: "cycle detected", ok: false });
      else { addNode(nodes, { address: target, role: "implementation", code: await hasCode(reader, target, block) }); edges.push({ from: values.beacon ?? input.contractAddress, to: target, kind: "implementation" }); }
    }
    const classification = classify({ code, implementation: values.implementation, beacon: values.beacon, conflict });
    return { network: input.network, blockNumber: observed, state: observations.some((o) => !o.ok) ? "partial" : target || !code ? "complete" : "empty", classification, nodes, edges, authority: authorityEvidence(values.admin), observations, warnings: conflict ? ["Implementation and beacon slots conflict."] : [] };
  } catch (error) {
    return { network: input.network, blockNumber: null, state: "unavailable", classification: "unavailable", nodes, edges, authority: authorityEvidence(null), observations, warnings: [error instanceof Error ? error.message : "RPC unavailable"] };
  }
}
