import {
  ADMIN_CHANGED_TOPIC,
  OWNERSHIP_TRANSFERRED_TOPIC,
  ROLE_ADMIN_CHANGED_TOPIC,
  ROLE_GRANTED_TOPIC,
  ROLE_REVOKED_TOPIC,
  DEFAULT_ADMIN_ROLE,
} from "@/server/research/authority-history/topics";
import {
  AuthorityProviderError,
  type AuthorityRpc,
  type RpcLog,
} from "@/server/research/authority-history/rpc";
import { padHex } from "viem";

export const walletA = "0x1111111111111111111111111111111111111111";
export const walletB = "0x2222222222222222222222222222222222222222";
export const contract = "0xcccccccccccccccccccccccccccccccccccccccc";
export const ownerOld = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const ownerNew = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const roleAccount = "0xdddddddddddddddddddddddddddddddddddddddd";
export const proxyAdminOld = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
export const proxyAdminNew = "0xffffffffffffffffffffffffffffffffffffffff";

export const MINTER_ROLE =
  "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6";

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

function topicAddr(address: string) {
  return padHex(address as `0x${string}`, { size: 32 });
}

function packedAdmins(previous: string, next: string) {
  return `0x${previous.slice(2).padStart(64, "0")}${next.slice(2).padStart(64, "0")}`;
}

export function ownershipLog(overrides: Partial<RpcLog> = {}): RpcLog {
  return {
    address: contract,
    topics: [OWNERSHIP_TRANSFERRED_TOPIC, topicAddr(ownerOld), topicAddr(ownerNew)],
    data: "0x",
    blockNumber: "0x64",
    blockHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    logIndex: "0x0",
    ...overrides,
  };
}

export function roleGrantedLog(overrides: Partial<RpcLog> = {}): RpcLog {
  return {
    address: contract,
    topics: [ROLE_GRANTED_TOPIC, MINTER_ROLE, topicAddr(roleAccount), topicAddr(ownerNew)],
    data: "0x",
    blockNumber: "0x65",
    blockHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    transactionHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    logIndex: "0x0",
    ...overrides,
  };
}

export function roleRevokedLog(overrides: Partial<RpcLog> = {}): RpcLog {
  return {
    address: contract,
    topics: [ROLE_REVOKED_TOPIC, MINTER_ROLE, topicAddr(roleAccount), topicAddr(ownerNew)],
    data: "0x",
    blockNumber: "0x66",
    blockHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    transactionHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
    logIndex: "0x0",
    ...overrides,
  };
}

export function roleAdminChangedLog(overrides: Partial<RpcLog> = {}): RpcLog {
  return {
    address: contract,
    topics: [ROLE_ADMIN_CHANGED_TOPIC, MINTER_ROLE, DEFAULT_ADMIN_ROLE, DEFAULT_ADMIN_ROLE],
    data: "0x",
    blockNumber: "0x67",
    blockHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    transactionHash: "0x4444444444444444444444444444444444444444444444444444444444444444",
    logIndex: "0x0",
    ...overrides,
  };
}

export function adminChangedLog(overrides: Partial<RpcLog> = {}): RpcLog {
  return {
    address: contract,
    topics: [ADMIN_CHANGED_TOPIC],
    data: packedAdmins(proxyAdminOld, proxyAdminNew),
    blockNumber: "0x68",
    blockHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    transactionHash: "0x5555555555555555555555555555555555555555555555555555555555555555",
    logIndex: "0x0",
    ...overrides,
  };
}

export class FixtureRpc implements AuthorityRpc {
  logsResult: RpcLog[] = [];
  logError: Error | null = null;
  /** Per-block hash map. Missing entries count as missing hashes. */
  hashes = new Map<string, string>([
    ["100", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    ["101", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    ["102", "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
    ["103", "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
    ["104", "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
    ["1000", "0xstable0000000000000000000000000000000000000000000000000000000000"],
  ]);
  /** Sequential overrides for snapshot revalidation (block 1000). */
  snapshotHashReads: string[] = [];
  snapshotBlock = 1000n;

  async blockNumber() {
    return this.snapshotBlock;
  }

  async blockHash(block: bigint) {
    if (block === this.snapshotBlock && this.snapshotHashReads.length > 0) {
      return this.snapshotHashReads.shift() ?? null;
    }
    return this.hashes.get(block.toString()) ?? null;
  }

  async logs() {
    if (this.logError) throw this.logError;
    return this.logsResult;
  }
}

export function rateLimitedLogs() {
  return new AuthorityProviderError("too many requests", "rate_limit", true);
}

export function request(overrides: Record<string, unknown> = {}) {
  return {
    walletAddress: walletA,
    network: "ethereum" as const,
    contractAddress: contract,
    fromBlock: 1n,
    toBlock: 1000n,
    ...overrides,
  };
}

