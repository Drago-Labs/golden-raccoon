import "server-only";

import { Networks } from "@stellar/stellar-sdk";
import { stellarNetworks, getStellarRegistryContractId } from "@/lib/stellar/config";
import {
  getApprovedPubnetConfig,
  isContractId,
  isWasmHash,
  type ApprovedPubnetConfig,
} from "@/server/stellar/config";
import { fail, pass, type PubnetCheckResult } from "@/server/stellar/checks/types";

const ID = "contract_identity" as const;
const TITLE = "Contract identity on chain";

/**
 * Reads the WASM hash the registry contract is actually running.
 *
 * Injected so the check is exercisable without a live network, and so a
 * provider outage surfaces as an unverified hash rather than as a pass.
 */
export type WasmHashReader = (contractId: string) => Promise<string | null>;

/**
 * Verifies that the contract the app will talk to is the one that was
 * reviewed, on the network that was reviewed.
 *
 * Two independent things can be wrong and they need different fixes: the
 * passphrase can point at the wrong network entirely, or the right network can
 * be running an unreviewed build of the contract. They are reported separately.
 */
export async function checkContractIdentity(
  readWasmHash: WasmHashReader,
  approved: ApprovedPubnetConfig = getApprovedPubnetConfig(),
): Promise<PubnetCheckResult> {
  const network = stellarNetworks["stellar-pubnet"];

  if (network.networkPassphrase !== Networks.PUBLIC) {
    return fail(
      ID,
      TITLE,
      "network_passphrase_mismatch",
      "The pubnet network passphrase does not match the public Stellar network. " +
        "A transaction signed under this passphrase is not valid on pubnet.",
      { configuredPassphrase: network.networkPassphrase },
    );
  }

  const configuredRegistry = getStellarRegistryContractId(network);

  if (!configuredRegistry) {
    return fail(
      ID,
      TITLE,
      "registry_contract_missing",
      "No pubnet risk-registry contract is configured, so there is nothing to verify.",
    );
  }

  if (!isContractId(configuredRegistry)) {
    return fail(
      ID,
      TITLE,
      "registry_contract_invalid",
      "The configured pubnet registry contract ID is not a valid Stellar contract address.",
    );
  }

  if (!isWasmHash(approved.registryWasmHash)) {
    return fail(
      ID,
      TITLE,
      "wasm_hash_unverified",
      "No approved registry WASM hash is configured, so the deployed contract cannot be " +
        "compared against the reviewed artifact.",
    );
  }

  const deployedHash = await readWasmHash(configuredRegistry);

  if (!deployedHash) {
    return fail(
      ID,
      TITLE,
      "wasm_hash_unverified",
      "The deployed registry contract's WASM hash could not be read from pubnet. " +
        "An unverifiable contract is not a verified one.",
      { registryContractId: configuredRegistry },
    );
  }

  if (deployedHash.toLowerCase() !== approved.registryWasmHash) {
    return fail(
      ID,
      TITLE,
      "wasm_hash_mismatch",
      "The registry contract deployed on pubnet is running a different build from the " +
        "reviewed artifact.",
      {
        registryContractId: configuredRegistry,
        // Prefixes only: enough to tell two builds apart in a log, without
        // implying either value is a secret.
        deployedWasmHash: `${deployedHash.slice(0, 12)}…`,
        approvedWasmHash: `${approved.registryWasmHash.slice(0, 12)}…`,
      },
    );
  }

  return pass(
    ID,
    TITLE,
    "The pubnet registry contract matches the reviewed WASM hash on the public network.",
    { registryContractId: configuredRegistry },
  );
}
