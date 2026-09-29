import { getEvmNetwork } from "@/lib/evm/config";
import type { AuthorityEvent, AuthorityEventKind, AuthorityFamily } from "./schema";
import type { RpcLog } from "./rpc";
import {
  ADMIN_CHANGED_TOPIC,
  OWNERSHIP_TRANSFERRED_TOPIC,
  ROLE_ADMIN_CHANGED_TOPIC,
  ROLE_GRANTED_TOPIC,
  ROLE_REVOKED_TOPIC,
  readAddress,
  readBytes32,
  readPackedAddresses,
} from "./topics";

function parseLogIndex(value: string | number | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.startsWith("0x")) return Number.parseInt(value, 16);
  if (typeof value === "string" && value.length > 0) return Number.parseInt(value, 10);
  return 0;
}

function kindForTopic(topic: string | undefined): AuthorityEventKind | null {
  switch (topic?.toLowerCase()) {
    case OWNERSHIP_TRANSFERRED_TOPIC.toLowerCase():
      return "OwnershipTransferred";
    case ROLE_GRANTED_TOPIC.toLowerCase():
      return "RoleGranted";
    case ROLE_REVOKED_TOPIC.toLowerCase():
      return "RoleRevoked";
    case ROLE_ADMIN_CHANGED_TOPIC.toLowerCase():
      return "RoleAdminChanged";
    case ADMIN_CHANGED_TOPIC.toLowerCase():
      return "AdminChanged";
    default:
      return null;
  }
}

function familyForKind(kind: AuthorityEventKind): AuthorityFamily {
  return kind === "AdminChanged" ? "proxy_admin" : "application";
}

function explorerTxUrl(network: string, hash: string): string | null {
  const config = getEvmNetwork(network);
  if (!config) return null;
  return `${config.explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

/**
 * Decode one authority log into a typed event.
 *
 * Returns null for malformed topics/data so callers can count gaps without
 * inventing addresses or role ids.
 */
export function decodeAuthorityLog(
  log: RpcLog,
  network: string,
): { event: AuthorityEvent | null; malformed: boolean } {
  const kind = kindForTopic(log.topics[0]);
  if (!kind) return { event: null, malformed: true };

  const contractAddress = log.address?.toLowerCase();
  if (!contractAddress || !/^0x[0-9a-f]{40}$/.test(contractAddress)) {
    return { event: null, malformed: true };
  }

  const blockNumberHex = log.blockNumber;
  if (!blockNumberHex) return { event: null, malformed: true };
  const blockNumber = BigInt(blockNumberHex).toString();
  const blockHash = (log.blockHash ?? "").toLowerCase();
  const transactionHash = (log.transactionHash ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(blockHash) || !/^0x[0-9a-f]{64}$/.test(transactionHash)) {
    return { event: null, malformed: true };
  }

  const family = familyForKind(kind);
  const base = {
    kind,
    family,
    network,
    contractAddress,
    blockNumber,
    blockHash,
    transactionHash,
    logIndex: parseLogIndex(log.logIndex),
    transactionUrl: explorerTxUrl(network, transactionHash),
    previousOwner: null as string | null,
    newOwner: null as string | null,
    roleId: null as string | null,
    account: null as string | null,
    sender: null as string | null,
    previousAdminRole: null as string | null,
    newAdminRole: null as string | null,
    previousAdmin: null as string | null,
    newAdmin: null as string | null,
  };

  if (kind === "OwnershipTransferred") {
    const previousOwner = readAddress(log.topics[1]);
    const newOwner = readAddress(log.topics[2]);
    if (!previousOwner || !newOwner) return { event: null, malformed: true };
    return { event: { ...base, previousOwner, newOwner }, malformed: false };
  }

  if (kind === "RoleGranted" || kind === "RoleRevoked") {
    const roleId = readBytes32(log.topics[1]);
    const account = readAddress(log.topics[2]);
    const sender = readAddress(log.topics[3]);
    if (!roleId || !account || !sender) return { event: null, malformed: true };
    return { event: { ...base, roleId, account, sender }, malformed: false };
  }

  if (kind === "RoleAdminChanged") {
    const roleId = readBytes32(log.topics[1]);
    const previousAdminRole = readBytes32(log.topics[2]);
    const newAdminRole = readBytes32(log.topics[3]);
    if (!roleId || !previousAdminRole || !newAdminRole) return { event: null, malformed: true };
    return { event: { ...base, roleId, previousAdminRole, newAdminRole }, malformed: false };
  }

  // AdminChanged — addresses live in data, not topics.
  const packed = readPackedAddresses(log.data ?? "0x");
  if (!packed.first || !packed.second) return { event: null, malformed: true };
  return {
    event: { ...base, previousAdmin: packed.first, newAdmin: packed.second },
    malformed: false,
  };
}

export function sortAuthorityEvents(events: AuthorityEvent[]): AuthorityEvent[] {
  return [...events].sort((left, right) => {
    const block = BigInt(left.blockNumber) - BigInt(right.blockNumber);
    if (block !== 0n) return block < 0n ? -1 : 1;
    return left.logIndex - right.logIndex;
  });
}
