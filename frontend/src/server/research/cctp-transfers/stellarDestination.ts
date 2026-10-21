/**
 * Confirms destination completion on Stellar by reading
 * `is_nonce_used(nonce)` on the Soroban `MessageTransmitter` contract,
 * the Stellar analogue of `evmDestination.ts`'s `usedNonces` read.
 *
 * Unlike the EVM contracts, Circle's Stellar CCTP contracts are not
 * published as browsable source, so this function name and argument
 * shape come from Circle's own `stellar-contracts` reference page rather
 * than a verified source read. A wrong name or shape fails the
 * simulation and is reported as `state: "unknown"` with the RPC's error
 * message — never as a false "pending" or "completed" — so an unverified
 * assumption here cannot produce a wrong completion claim, only an
 * honest "could not check".
 *
 * Mirrors the simulate-only read pattern already used in
 * `server/stellar/governance.ts`: a dummy, never-submitted source
 * account is enough to simulate a read-only contract call.
 */
import { STELLAR_CCTP_CONTRACTS } from "./domainMap";
import { CCTP_TRANSFER_LIMITS } from "./limits";
import type { DestinationStep, NetworkMode } from "./schema";

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
const PUBNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const DUMMY_SOURCE_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export type StellarNonceAdapter = (input: { nonceHex: string; network: NetworkMode; rpcUrl: string; contractId: string; networkPassphrase: string }) => Promise<{ nonceUsed: boolean }>;

async function defaultStellarNonceAdapter(input: { nonceHex: string; rpcUrl: string; contractId: string; networkPassphrase: string }): Promise<{ nonceUsed: boolean }> {
  const stellar = await import("@stellar/stellar-sdk").catch(() => null);
  if (!stellar) throw new Error("Stellar SDK unavailable");
  const { Contract, rpc, TransactionBuilder, Networks, Account, BASE_FEE, nativeToScVal, scValToNative } = stellar as typeof import("@stellar/stellar-sdk") & {
    rpc: { Server: new (url: string) => { simulateTransaction: (tx: unknown) => Promise<{ result?: { retval?: unknown } }> } };
  };
  const Server = rpc?.Server ?? (stellar as { SorobanRpc?: { Server: typeof rpc.Server } }).SorobanRpc?.Server;
  if (!Server || !Contract || !TransactionBuilder) throw new Error("Soroban RPC client unavailable");

  const server = new Server(input.rpcUrl);
  const contract = new Contract(input.contractId);
  const account = new Account(DUMMY_SOURCE_ACCOUNT, "0");
  const nonceBytes = Buffer.from(input.nonceHex.replace(/^0x/, ""), "hex");

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: input.networkPassphrase === PUBNET_PASSPHRASE ? Networks.PUBLIC : Networks.TESTNET,
  })
    .addOperation(contract.call("is_nonce_used", nativeToScVal(nonceBytes, { type: "bytes" })))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  const retval = sim?.result?.retval;
  if (retval === undefined) throw new Error("Simulation returned no result");

  return { nonceUsed: Boolean(scValToNative(retval)) };
}

export async function checkStellarNonceUsed(nonceHex: string, network: NetworkMode, adapter: StellarNonceAdapter = defaultStellarNonceAdapter): Promise<DestinationStep> {
  const rpcUrl = network === "mainnet" ? "https://mainnet.sorobanrpc.com" : "https://soroban-testnet.stellar.org";
  const contractId = STELLAR_CCTP_CONTRACTS[network].messageTransmitter;
  const networkPassphrase = network === "mainnet" ? PUBNET_PASSPHRASE : TESTNET_PASSPHRASE;

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The Stellar RPC request timed out.")), CCTP_TRANSFER_LIMITS.fetchTimeoutMs);
  });

  try {
    const { nonceUsed } = await Promise.race([adapter({ nonceHex, network, rpcUrl, contractId, networkPassphrase }), timeout]);
    return { state: nonceUsed ? "completed" : "pending", destinationChain: "Stellar", nonceUsed, issues: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: "unknown", destinationChain: "Stellar", nonceUsed: null, issues: [message] };
  } finally {
    clearTimeout(timer!);
  }
}
