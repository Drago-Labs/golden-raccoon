/**
 * The Stellar wallets this application enables (issue #150).
 *
 * Framework-agnostic on purpose: the same definitions describe wallets in the
 * client providers, in the wallet-session API route, and in the capability
 * check script, so those three can never disagree about what a wallet is.
 */

export type StellarWalletId =
  | "freighter"
  | "xbull"
  | "albedo"
  | "rabet"
  | "lobstr"
  | "hana"
  | "hot"
  | "wallet_connect";

/** How the wallet reaches the user, which is what decides mobile support. */
export type StellarWalletKind = "extension" | "web" | "mobile" | "bridge";

export interface StellarWalletDefinition {
  id: StellarWalletId;
  name: string;
  kind: StellarWalletKind;
  /** Usable from a phone browser without a desktop extension. */
  mobileCapable: boolean;
  /** Requires configuration before it can be offered at all. */
  requiresConfiguration?: "walletconnect_project_id";
  homepage: string;
}

export const stellarWalletRegistry: Record<StellarWalletId, StellarWalletDefinition> = {
  freighter: {
    id: "freighter",
    name: "Freighter",
    kind: "extension",
    mobileCapable: false,
    homepage: "https://www.freighter.app/",
  },
  xbull: {
    id: "xbull",
    name: "xBull",
    kind: "extension",
    mobileCapable: true,
    homepage: "https://xbull.app/",
  },
  albedo: {
    id: "albedo",
    name: "Albedo",
    kind: "web",
    mobileCapable: true,
    homepage: "https://albedo.link/",
  },
  rabet: {
    id: "rabet",
    name: "Rabet",
    kind: "extension",
    mobileCapable: false,
    homepage: "https://rabet.io/",
  },
  lobstr: {
    id: "lobstr",
    name: "LOBSTR",
    kind: "extension",
    mobileCapable: false,
    homepage: "https://lobstr.co/",
  },
  hana: {
    id: "hana",
    name: "Hana",
    kind: "extension",
    mobileCapable: false,
    homepage: "https://hanawallet.io/",
  },
  hot: {
    id: "hot",
    name: "HOT",
    kind: "web",
    mobileCapable: true,
    homepage: "https://hot-labs.org/",
  },
  wallet_connect: {
    id: "wallet_connect",
    name: "WalletConnect",
    kind: "bridge",
    mobileCapable: true,
    requiresConfiguration: "walletconnect_project_id",
    homepage: "https://walletconnect.network/",
  },
};

export function isStellarWalletId(value: string): value is StellarWalletId {
  return value in stellarWalletRegistry;
}

export function getWalletDefinition(walletId: string): StellarWalletDefinition | undefined {
  return isStellarWalletId(walletId) ? stellarWalletRegistry[walletId] : undefined;
}

/**
 * A readable name for any wallet id, including one the kit adds after this
 * registry was written. An unknown wallet is still usable — it simply has no
 * declared capabilities, which the capability layer treats conservatively.
 */
export function getWalletName(walletId: string): string {
  return getWalletDefinition(walletId)?.name ?? walletId;
}

export interface RegistryAvailability {
  walletConnectConfigured: boolean;
}

/** The wallets that may be offered, given what is configured. */
export function availableWallets(availability: RegistryAvailability): StellarWalletDefinition[] {
  return Object.values(stellarWalletRegistry).filter((wallet) => {
    if (wallet.requiresConfiguration === "walletconnect_project_id") {
      return availability.walletConnectConfigured;
    }
    return true;
  });
}

/** At least one option a phone user can actually complete a connection with. */
export function hasMobileCapableWallet(availability: RegistryAvailability): boolean {
  return availableWallets(availability).some((wallet) => wallet.mobileCapable);
}
