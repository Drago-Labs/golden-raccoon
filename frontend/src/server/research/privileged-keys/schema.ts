export type Chain = "evm" | "soroban";
export type ControllerKind = "single_key" | "multisig" | "timelock" | "unknown";

export type Deployment = {
  chain: Chain;
  address: string;
  name: string;
};

/** One privilege row as recorded from a contract read or a fixture. */
export type PrivilegeRecord = {
  contract: string;
  chain: Chain;
  role: string;
  controller: string;
  threshold?: number;
  signers?: string[];
  delaySeconds?: number;
};

export type ControllerView = {
  address: string;
  kind: ControllerKind;
  threshold: number | null;
  signerCount: number | null;
  delaySeconds: number | null;
  contracts: string[];
  capabilities: string[];
};

export type ContractView = {
  address: string;
  chain: Chain;
  name: string;
  controllers: string[];
};

export type Coverage = {
  contractsRead: number;
  chains: Chain[];
  notes: string[];
};

export type InventoryReport = {
  projectId: string;
  controllers: ControllerView[];
  contracts: ContractView[];
  coverage: Coverage;
  summary: { multisig: number; timelock: number; singleKey: number; unknown: number };
};

export function isChain(value: unknown): value is Chain {
  return value === "evm" || value === "soroban";
}
