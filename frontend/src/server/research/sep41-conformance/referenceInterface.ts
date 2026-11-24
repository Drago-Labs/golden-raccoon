/**
 * Reference SEP-41 Token Interface used for conformance diffs.
 * Documented version: SEP-41 as published in stellar-protocol ecosystem/sep-0041.md
 * (functions from the common Soroban TokenInterface; mint/clawback are events only).
 */

export const SEP41_REFERENCE_VERSION = "SEP-41/2024-11" as const;

export type SpecParam = {
  name: string;
  type: string;
};

export type ReferenceFunction = {
  name: string;
  inputs: SpecParam[];
  outputs: SpecParam[];
  /** Read-only entry points that this feature may simulate without authorization. */
  readOnly: boolean;
};

export type ReferenceEventShape = {
  name: "transfer" | "mint" | "burn" | "approve" | "clawback";
  /** Required topic symbols/roles after the event name, in order. */
  topicRoles: string[];
  /** Accepted data encodings for the event payload. */
  dataFormats: Array<"i128" | "vec_i128_u32" | "map">;
  requiredMapKeys: string[];
};

/** Required SEP-41 functions (name + arg/return types). */
export const SEP41_REFERENCE_FUNCTIONS: readonly ReferenceFunction[] = [
  {
    name: "allowance",
    inputs: [
      { name: "from", type: "Address" },
      { name: "spender", type: "Address" },
    ],
    outputs: [{ name: "", type: "i128" }],
    readOnly: true,
  },
  {
    name: "approve",
    inputs: [
      { name: "from", type: "Address" },
      { name: "spender", type: "Address" },
      { name: "amount", type: "i128" },
      { name: "live_until_ledger", type: "u32" },
    ],
    outputs: [],
    readOnly: false,
  },
  {
    name: "balance",
    inputs: [{ name: "id", type: "Address" }],
    outputs: [{ name: "", type: "i128" }],
    readOnly: true,
  },
  {
    name: "transfer",
    inputs: [
      { name: "from", type: "Address" },
      { name: "to", type: "Address" },
      { name: "amount", type: "i128" },
    ],
    outputs: [],
    readOnly: false,
  },
  {
    name: "transfer_from",
    inputs: [
      { name: "spender", type: "Address" },
      { name: "from", type: "Address" },
      { name: "to", type: "Address" },
      { name: "amount", type: "i128" },
    ],
    outputs: [],
    readOnly: false,
  },
  {
    name: "burn",
    inputs: [
      { name: "from", type: "Address" },
      { name: "amount", type: "i128" },
    ],
    outputs: [],
    readOnly: false,
  },
  {
    name: "burn_from",
    inputs: [
      { name: "spender", type: "Address" },
      { name: "from", type: "Address" },
      { name: "amount", type: "i128" },
    ],
    outputs: [],
    readOnly: false,
  },
  {
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "u32" }],
    readOnly: true,
  },
  {
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "String" }],
    readOnly: true,
  },
  {
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "String" }],
    readOnly: true,
  },
] as const;

/** Event shapes SEP-41 requires when those operations occur. */
export const SEP41_REFERENCE_EVENTS: readonly ReferenceEventShape[] = [
  {
    name: "transfer",
    topicRoles: ["from", "to"],
    dataFormats: ["i128", "map"],
    requiredMapKeys: ["amount"],
  },
  {
    name: "approve",
    topicRoles: ["from", "spender"],
    dataFormats: ["vec_i128_u32", "map"],
    requiredMapKeys: ["amount", "live_until_ledger"],
  },
  {
    name: "burn",
    topicRoles: ["from"],
    dataFormats: ["i128", "map"],
    requiredMapKeys: ["amount"],
  },
  {
    name: "mint",
    topicRoles: ["to"],
    dataFormats: ["i128", "map"],
    requiredMapKeys: ["amount"],
  },
  {
    name: "clawback",
    topicRoles: ["from"],
    dataFormats: ["i128", "map"],
    requiredMapKeys: ["amount"],
  },
] as const;

/** Read-only functions this feature is allowed to simulate without signatures. */
export const SEP41_READ_SIMULATION_FUNCTIONS = ["decimals", "name", "symbol", "balance"] as const;

export type Sep41ReadSimulationFunction = (typeof SEP41_READ_SIMULATION_FUNCTIONS)[number];
