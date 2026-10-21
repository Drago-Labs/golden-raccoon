/**
 * Read current ConfigSettingEntry values through an injected RPC transport.
 * The transport is the only piece that talks to a network.
 */

import { rpc, xdr } from "@stellar/stellar-sdk";
import { NetworkSettingsError } from "./errors";
import { NETWORK_SETTINGS_LIMITS } from "./limits";
import { assertProviderPassphrase, assertSameNetwork, NETWORKS, type NetworkId } from "./networkIdentity";

export type SettingsRead = {
  network: NetworkId;
  ledger: number;
  protocolVersion: number;
  entries: Array<{ xdr: string }>;
};

export type RpcSettingsReader = {
  read(network: NetworkId, options?: { timeoutMs?: number }): Promise<SettingsRead>;
};

export type ConfigEntryTransport = {
  getEntries(input: {
    network: NetworkId;
    keys: readonly string[];
    timeoutMs: number;
  }): Promise<{
    ledger: number;
    protocolVersion: number;
    passphrase: string;
    entries: Array<{ xdr: string }>;
  }>;
};

export function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new NetworkSettingsError("provider_unavailable", "Stellar RPC did not return config settings before the timeout."));
    }, timeoutMs);

    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof NetworkSettingsError
          ? error
          : new NetworkSettingsError("provider_unavailable", "Stellar RPC did not return config settings.", {
            cause: error instanceof Error ? error.message : "unknown",
          }));
      },
    );
  });
}

/** One ledger key for every ConfigSettingId this SDK knows. */
export function configSettingKeyXdrs(): string[] {
  const ids = new Map<number, xdr.ConfigSettingId>();

  for (const value of Object.values(xdr.ConfigSettingId)) {
    if (value && typeof value === "object" && "value" in value && typeof value.value === "number") {
      ids.set(value.value, value as xdr.ConfigSettingId);
    }
  }

  return [...ids.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, id]) => xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({ configSettingId: id })).toXdr("base64"));
}

export async function readCurrentSettings(
  network: NetworkId,
  transport: ConfigEntryTransport,
  timeoutMs = NETWORK_SETTINGS_LIMITS.rpcTimeoutMs,
): Promise<SettingsRead> {
  const keys = configSettingKeyXdrs();
  const result = await withTimeout(transport.getEntries({ network, keys, timeoutMs }), timeoutMs);

  assertProviderPassphrase(network, result.passphrase);

  if (!Number.isInteger(result.ledger) || result.ledger < 0) {
    throw new NetworkSettingsError("provider_unavailable", "RPC returned no ledger.");
  }

  if (!Number.isInteger(result.protocolVersion) || result.protocolVersion <= 0) {
    throw new NetworkSettingsError("provider_unavailable", "RPC returned no protocol version.");
  }

  for (const entry of result.entries) {
    if (entry.xdr.length > NETWORK_SETTINGS_LIMITS.maxSettingXdrBytes) {
      throw new NetworkSettingsError("payload_too_large", "A config setting entry exceeds the size bound.");
    }
  }

  return {
    network,
    ledger: result.ledger,
    protocolVersion: result.protocolVersion,
    entries: result.entries.map((entry) => ({ xdr: entry.xdr })),
  };
}

export function createRpcSettingsReader(network: NetworkId): RpcSettingsReader {
  const profile = NETWORKS[network];

  return {
    async read(requested, options) {
      assertSameNetwork(network, requested, "RPC reader");
      const timeoutMs = options?.timeoutMs ?? NETWORK_SETTINGS_LIMITS.rpcTimeoutMs;
      const server = new rpc.Server(profile.rpcUrl, {
        allowHttp: profile.rpcUrl.startsWith("http://"),
        timeout: timeoutMs,
      });
      const keys = configSettingKeyXdrs().map((key) => xdr.LedgerKey.fromXdr(key, "base64"));

      return readCurrentSettings(requested, {
        async getEntries() {
          const [networkInfo, latest, entries] = await Promise.all([
            server.getNetwork(),
            server.getLatestLedger(),
            server._getLedgerEntries(...keys),
          ]);

          return {
            ledger: entries.latestLedger,
            protocolVersion: Number(latest.protocolVersion),
            passphrase: networkInfo.passphrase,
            entries: (entries.entries ?? []).map((entry) => ({ xdr: entry.xdr })),
          };
        },
      }, timeoutMs);
    },
  };
}
