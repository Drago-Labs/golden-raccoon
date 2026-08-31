import { getWalletDefinition, getWalletName, type StellarWalletId } from "@/server/stellar/wallets/registry";

/**
 * Per-wallet capabilities (issue #150).
 *
 * Wallets differ in what they can actually do, and code that assumes one
 * wallet's behaviour breaks on the others. Declaring the differences lets the
 * UI disable an action with a stated reason instead of offering it and letting
 * the signature fail.
 */

export type WalletCapability =
  /** Can sign a transaction envelope at all. */
  | "sign"
  /** Reports which network it is on, so a mismatch can be detected. */
  | "reportsNetwork"
  /** Emits an event when the user switches account inside the wallet. */
  | "accountSwitching"
  /** Keys are held on a hardware device. */
  | "hardwareBacked";

export type WalletCapabilities = Record<WalletCapability, boolean>;

/**
 * An unknown wallet gets the conservative profile: it can sign, because that is
 * the minimum for the kit to list it, and nothing else is assumed. Assuming a
 * capability a wallet lacks is how a user reaches a failed signature; assuming
 * it lacks one it has only costs a disabled button with an explanation.
 */
const UNKNOWN_WALLET_CAPABILITIES: WalletCapabilities = {
  sign: true,
  reportsNetwork: false,
  accountSwitching: false,
  hardwareBacked: false,
};

const CAPABILITIES: Record<StellarWalletId, WalletCapabilities> = {
  freighter: { sign: true, reportsNetwork: true, accountSwitching: true, hardwareBacked: false },
  xbull: { sign: true, reportsNetwork: true, accountSwitching: true, hardwareBacked: false },
  // Albedo signs through a hosted page and does not expose the selected
  // network, so a mismatch cannot be detected from the wallet side.
  albedo: { sign: true, reportsNetwork: false, accountSwitching: false, hardwareBacked: false },
  rabet: { sign: true, reportsNetwork: true, accountSwitching: false, hardwareBacked: false },
  lobstr: { sign: true, reportsNetwork: true, accountSwitching: false, hardwareBacked: false },
  hana: { sign: true, reportsNetwork: true, accountSwitching: true, hardwareBacked: false },
  hot: { sign: true, reportsNetwork: false, accountSwitching: false, hardwareBacked: false },
  // WalletConnect is a transport: what it can do depends on the wallet on the
  // other end, so only the guarantees the transport itself makes are declared.
  wallet_connect: { sign: true, reportsNetwork: true, accountSwitching: false, hardwareBacked: false },
};

export function getWalletCapabilities(walletId: string): WalletCapabilities {
  const definition = getWalletDefinition(walletId);
  return definition ? CAPABILITIES[definition.id] : UNKNOWN_WALLET_CAPABILITIES;
}

export function canPerform(walletId: string, capability: WalletCapability): boolean {
  return getWalletCapabilities(walletId)[capability];
}

const CAPABILITY_REASONS: Record<WalletCapability, (walletName: string) => string> = {
  sign: (wallet) => `${wallet} cannot sign transactions in this browser.`,
  reportsNetwork: (wallet) =>
    `${wallet} does not report which network it is on, so a network mismatch cannot be detected automatically. Confirm the network in the wallet before signing.`,
  accountSwitching: (wallet) =>
    `${wallet} does not announce account changes, so switching accounts inside the wallet is only noticed on the next signature.`,
  hardwareBacked: (wallet) => `${wallet} does not use a hardware-backed key.`,
};

/**
 * Why an action is unavailable, in the user's terms.
 *
 * Every disabled control has one of these next to it: a control that is greyed
 * out without a reason is indistinguishable from a bug.
 */
export function describeMissingCapability(walletId: string, capability: WalletCapability): string {
  return CAPABILITY_REASONS[capability](getWalletName(walletId));
}

export interface CapabilityGate {
  allowed: boolean;
  reason: string | null;
}

/** Whether an action may be offered, and why not when it may not. */
export function gateOnCapability(walletId: string, capability: WalletCapability): CapabilityGate {
  return canPerform(walletId, capability)
    ? { allowed: true, reason: null }
    : { allowed: false, reason: describeMissingCapability(walletId, capability) };
}

/** The capability matrix as rows, for docs and the capability check script. */
export function capabilityMatrix() {
  return Object.entries(CAPABILITIES).map(([walletId, capabilities]) => ({
    walletId: walletId as StellarWalletId,
    name: getWalletName(walletId),
    ...capabilities,
  }));
}
