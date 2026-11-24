import { SEP41_CONFORMANCE_LIMITS } from "./limits";
import type { ContractFunctionSpec, ContractSpec, SpecParam } from "./schema";

export type SpecReader = {
  readSpec(contractId: string, network: string): Promise<ContractSpec | null>;
};

type RpcNetwork = {
  rpcUrl: string;
};

const NETWORKS: Record<string, RpcNetwork> = {
  "stellar-testnet": { rpcUrl: "https://soroban-testnet.stellar.org" },
  "stellar-pubnet": { rpcUrl: "https://mainnet.sorobanrpc.com" },
};

function asParam(value: unknown, fallbackName: string): SpecParam {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : fallbackName;
    const type =
      typeof record.type === "string"
        ? record.type
        : typeof record.type_str === "string"
          ? record.type_str
          : "unknown";
    return { name, type };
  }
  return { name: fallbackName, type: String(value ?? "unknown") };
}

/**
 * Normalizes a recorded or RPC-provided function list into ContractFunctionSpec[].
 */
export function normalizeFunctionSpecs(raw: unknown): ContractFunctionSpec[] {
  if (!Array.isArray(raw)) return [];
  const functions: ContractFunctionSpec[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const name =
      typeof record.name === "string"
        ? record.name
        : typeof record.func === "string"
          ? record.func
          : null;
    if (!name) continue;

    const inputsRaw = Array.isArray(record.inputs)
      ? record.inputs
      : Array.isArray(record.parameters)
        ? record.parameters
        : [];
    const outputsRaw = Array.isArray(record.outputs)
      ? record.outputs
      : Array.isArray(record.results)
        ? record.results
        : [];

    functions.push({
      name,
      inputs: inputsRaw.map((item, index) => asParam(item, `arg${index}`)),
      outputs: outputsRaw.map((item, index) => asParam(item, `ret${index}`)),
    });
  }

  return functions;
}

async function fetchJson(url: string, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEP41_CONFORMANCE_LIMITS.rpcTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Default SpecReader that asks Soroban RPC for `getContractSpec` when available,
 * falling back to a null result when the method is unsupported or the contract
 * has no published spec.
 */
export function createHttpSpecReader(): SpecReader {
  return {
    async readSpec(contractId, network) {
      const config = NETWORKS[network];
      if (!config) return null;

      const payload = await fetchJson(config.rpcUrl, {
        jsonrpc: "2.0",
        id: 1,
        method: "getContractSpec",
        params: { contractId },
      });

      if (!payload || typeof payload !== "object") return null;
      const result = (payload as { result?: unknown }).result;
      if (!result || typeof result !== "object") return null;

      const record = result as Record<string, unknown>;
      const functions = normalizeFunctionSpecs(
        record.functions ?? record.funcs ?? record.entries ?? record,
      );
      if (functions.length === 0) return null;

      return {
        contractId,
        functions,
        source: "rpc",
      };
    },
  };
}

/** Builds a ContractSpec from a recorded fixture payload. */
export function contractSpecFromRecorded(
  contractId: string,
  functions: ContractFunctionSpec[],
): ContractSpec {
  return { contractId, functions, source: "recorded" };
}
