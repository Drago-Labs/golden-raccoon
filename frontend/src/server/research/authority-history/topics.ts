import { keccak256, stringToHex } from "viem";

/** OpenZeppelin Ownable */
export const OWNERSHIP_TRANSFERRED_TOPIC = keccak256(
  stringToHex("OwnershipTransferred(address,address)"),
);

/** OpenZeppelin AccessControl */
export const ROLE_GRANTED_TOPIC = keccak256(stringToHex("RoleGranted(bytes32,address,address)"));
export const ROLE_REVOKED_TOPIC = keccak256(stringToHex("RoleRevoked(bytes32,address,address)"));
export const ROLE_ADMIN_CHANGED_TOPIC = keccak256(
  stringToHex("RoleAdminChanged(bytes32,bytes32,bytes32)"),
);

/**
 * ERC-1967 proxy admin change.
 *
 * Kept as a distinct authority family from application Ownable/AccessControl
 * so proxy administration is never collapsed into application roles.
 */
export const ADMIN_CHANGED_TOPIC = keccak256(stringToHex("AdminChanged(address,address)"));

export const AUTHORITY_TOPICS = [
  OWNERSHIP_TRANSFERRED_TOPIC,
  ROLE_GRANTED_TOPIC,
  ROLE_REVOKED_TOPIC,
  ROLE_ADMIN_CHANGED_TOPIC,
  ADMIN_CHANGED_TOPIC,
] as const;

/** DEFAULT_ADMIN_ROLE in OpenZeppelin AccessControl. */
export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export function topicAddress(address: string) {
  return `0x${address.toLowerCase().slice(2).padStart(64, "0")}`;
}

export function readAddress(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`.toLowerCase();
}

export function readBytes32(topic: string | undefined): string | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  return topic.toLowerCase();
}

/** Decode two packed addresses from non-indexed AdminChanged data. */
export function readPackedAddresses(data: string): { first: string | null; second: string | null } {
  const normalized = data.startsWith("0x") ? data.slice(2) : data;
  if (normalized.length < 128) return { first: null, second: null };
  const first = `0x${normalized.slice(24, 64)}`.toLowerCase();
  const second = `0x${normalized.slice(88, 128)}`.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(first) || !/^0x[0-9a-f]{40}$/.test(second)) {
    return { first: null, second: null };
  }
  return { first, second };
}
