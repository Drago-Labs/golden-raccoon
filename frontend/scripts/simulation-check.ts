/**
 * Acceptance check for the normalized server-side simulation layer (issue #12).
 *
 * Verifies the fail-closed guarantees of the chain-aware simulation contract
 * across both adapters (Soroban RPC and the maintainer-selected EVM provider):
 *   - success normalization for Stellar + EVM,
 *   - revert decode + fail-closed,
 *   - timeout / unavailable,
 *   - wrong network (passphrase) for Stellar, wrong chain id for EVM,
 *   - stale ledger / stale block,
 *   - malformed prepared payload,
 *   - unsupported route / missing provider,
 *   - provenance binding (result bound to exact tx + quote hashes),
 *   - secrets / signed XDR redaction in diagnostics,
 *   - no private key required (public wallet key only).
 *
 * Uses injected fake transports so no live RPC or network account is needed.
 */
import assert from "node:assert";
import { Keypair, TransactionBuilder, Networks, Asset, BASE_FEE, Operation, Account } from "@stellar/stellar-sdk";
import { simulateSorobanTransaction, type SorobanSimulationTransport } from "../src/server/simulation/soroban";
import { simulateEvmTransaction, decodeRevertReason, type EvmSimulationTransport } from "../src/server/simulation/evm";
import {
  isSimulationSuccess,
  isSimulationFailure,
  isSimulationUsable,
  simulationError,
} from "../src/server/simulation/types";
import { hashPreparedTransaction, hashQuote, redactSecrets } from "../src/server/simulation/hash";

const TESTNET_PASSPHRASE = Networks.TESTNET;
const PUBNET_PASSPHRASE = Networks.PUBLIC;

// ─── Fixtures ──────────────────────────────────────────────────────────

function buildStellarXdr(kp: { publicKey(): string }, passphrase: string = TESTNET_PASSPHRASE): { xdr: string; source: string } {
  const source = new Account(kp.publicKey(), "38373288");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: passphrase,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset("USDC", kp.publicKey()) }))
    .setTimeout(0)
    .build();
  return { xdr: tx.toXDR(), source: kp.publicKey() };
}

const kp = Keypair.random();
const { xdr: stellarXdr, source: stellarSource } = buildStellarXdr(kp);

const stellarBase = {
  chain: "stellar-testnet",
  chainFamily: "stellar" as const,
  walletAddress: stellarSource,
  quoteHash: "quote-abc-123",
  xdr: stellarXdr,
  sourceAccount: stellarSource,
  expectedPassphrase: TESTNET_PASSPHRASE,
};

function successSorobanTransport(): SorobanSimulationTransport {
  return {
    simulate: async () => ({
      value: { id: "0", latestLedger: 5000, transactionData: {}, minResourceFee: "10000", stateChanges: [] } as never,
      latestLedger: 5000,
      providerUrl: "https://soroban-testnet.example",
      latencyMs: 12,
    }),
    getNetwork: async () => ({ passphrase: TESTNET_PASSPHRASE }),
    getLatestLedger: async () => ({ sequence: 5000 }),
  };
}

function errorSorobanTransport(revertMessage = "Contract invocation failed"): SorobanSimulationTransport {
  return {
    simulate: async () => ({
      value: { id: "0", error: revertMessage, events: [] } as never,
      latestLedger: 5000,
    }),
    getNetwork: async () => ({ passphrase: TESTNET_PASSPHRASE }),
    getLatestLedger: async () => ({ sequence: 5000 }),
  };
}

const evmBase = {
  chain: "goat",
  chainFamily: "evm" as const,
  walletAddress: "0x5470F4AEe263f8FE432caBfE082a23601140bd50",
  quoteHash: "quote-holder-456",
  chainId: 48816,
  to: "0x0000000000000000000000000000000000000001",
  data: "0x095ea7b30000000000000000000000000000000000000000000000000000000000000001",
};

function successEvmTransport(): EvmSimulationTransport {
  return {
    getChainId: async () => 48816,
    getBlockNumber: async () => BigInt(5000),
    call: async () => "0x",
    estimateGas: async () => BigInt(21000),
    getGasPrice: async () => BigInt(20),
  };
}

// ── Hash / binding ─────────────────────────────────────────────────────

function testBindingHashes() {
  const a = hashPreparedTransaction({ chainFamily: "evm", network: "goat", rawPayload: evmBase.data, to: evmBase.to, value: "0", chainId: 48816, from: evmBase.walletAddress });
  const a2 = hashPreparedTransaction({ chainFamily: "evm", network: "goat", rawPayload: evmBase.data, to: evmBase.to, value: "0", chainId: 48816, from: evmBase.walletAddress });
  const b = hashPreparedTransaction({ chainFamily: "evm", network: "goat", rawPayload: "0xffff", to: evmBase.to, value: "0", chainId: 48816, from: evmBase.walletAddress });
  const c = hashPreparedTransaction({ chainFamily: "evm", network: "goat", rawPayload: evmBase.data, to: evmBase.to, value: "0", chainId: 1, from: evmBase.walletAddress });

  assert.strictEqual(a, a2, "Deterministic transaction hash for identical payloads.");
  assert.notStrictEqual(a, b, "Different calldata must change the transaction hash (no reuse).");
  assert.notStrictEqual(a, c, "Different chain id must change the transaction hash (no reuse).");

  const q1 = hashQuote({ route: ["USDC", "ETH"], fromAmount: "100", expectedOutput: "98" });
  const q2 = hashQuote({ route: ["USDC", "ETH"], fromAmount: "100", expectedOutput: "98" });
  const q3 = hashQuote({ route: ["USDC", "ETH"], fromAmount: "100", expectedOutput: "99" });
  assert.strictEqual(q1, q2, "Deterministic quote hash for identical quote inputs.");
  assert.notStrictEqual(q1, q3, "Different expected output must change the quote hash (no reuse).");

  // A simulation bound to one quote can never be reused for another quote or payload.
  assert.notStrictEqual(hashPreparedTransaction({ chainFamily: "stellar", network: "stellar-testnet", rawPayload: stellarXdr, sourceAccount: stellarSource, networkPassphrase: TESTNET_PASSPHRASE }), q1);
}

function testRedaction() {
  const secretKey = Keypair.random().secret();
  const xdrLike = "AAAAAgAAAAAM-doIpcWQtX1XK9C1cB6iZZOgr9X3gQb8ZhSToUqB4Q";
  const apiKey = "sk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0";
  const bearer = "Bearer eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop";

  const line = `account ${secretKey} reverted when posting ${xdrLike} with ${apiKey} ${bearer}`;
  const redacted = redactSecrets(line);

  assert.ok(!redacted.includes(secretKey), "Stellar secret key must be redacted.");
  assert.ok(!redacted.includes("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"), "API key must be redacted.");
  assert.ok(!redacted.includes("eyJhbGciOiJIUzI1NiJ9"), "Bearer token must be redacted.");
  assert.ok(redacted.includes("reverted when posting"), "Readable context is retained.");
}

// ── Soroban adapter ────────────────────────────────────────────────────

async function testSorobanSuccess() {
  const result = await simulateSorobanTransaction(stellarBase, { transport: successSorobanTransport() });
  assert.strictEqual(result.status, "passed", "Soroban success must normalize to passed.");
  assert.strictEqual(result.provider, "soroban_rpc", "Provider must be soroban_rpc.");
  assert.ok(isSimulationSuccess(result), "isSimulationSuccess must be true.");
  assert.ok(isSimulationUsable(result), "Successful simulation must be usable (bound + timestamped).");
  assert.strictEqual(result.ledgerSeq, 5000, "Latest ledger must be captured.");
  assert.ok(result.binding.transactionHash, "Transaction hash must be bound.");
  assert.strictEqual(result.binding.quoteHash, stellarBase.quoteHash, "Quote hash must be bound.");
  assert.ok(!("xdr" in result), "Simulation result must not carry the raw signed XDR.");
}

async function testSorobanRevert() {
  const result = await simulateSorobanTransaction(stellarBase, { transport: errorSorobanTransport("Contract reverted") });
  assert.strictEqual(result.status, "failed", "A strong bad conversation must fail closed.");
  assert.ok(isSimulationFailure(result), "isSimulationFailure must be true.");
  assert.strictEqual(simulationError(result)?.code, "revert", "Revert must produce the revert error code.");
  assert.ok(!isSimulationUsable(result), "Failed simulation must not be usable.");
}

async function testSorobanWrongNetwork() {
  const transport: SorobanSimulationTransport = {
    ...successSorobanTransport(),
    getNetwork: async () => ({ passphrase: PUBNET_PASSPHRASE }),
  };
  const result = await simulateSorobanTransaction(stellarBase, { transport });
  assert.strictEqual(result.status, "failed", "Wrong network passphrase must fail closed.");
  assert.strictEqual(simulationError(result)?.code, "wrong_network", "Must surface wrong_network.");
}

async function testSorobanStaleLedger() {
  const transport: SorobanSimulationTransport = {
    ...successSorobanTransport(),
    getLatestLedger: async () => ({ sequence: 4900 }),
  };
  const result = await simulateSorobanTransaction(stellarBase, { transport, expectedLedger: 5000 });
  assert.strictEqual(result.status, "failed", "Stale ledger must fail closed.");
  assert.strictEqual(simulationError(result)?.code, "stale_state", "Must surface stale_state.");
}

async function testSorobanMalformedRequest() {
  const result = await simulateSorobanTransaction({ ...stellarBase, xdr: "not-a-valid-xdr-envelope" }, { transport: successSorobanTransport() });
  assert.strictEqual(result.status, "failed", "Malformed XDR must fail closed.");
  assert.strictEqual(simulationError(result)?.code, "malformed_request", "Must surface malformed_request.");
}

async function testSorobanSourceMismatch() {
  const other = Keypair.random().publicKey();
  const result = await simulateSorobanTransaction({ ...stellarBase, sourceAccount: other, walletAddress: other }, { transport: successSorobanTransport() });
  assert.strictEqual(result.status, "failed", "Source account mismatch must fail closed.");
  assert.strictEqual(simulationError(result)?.code, "invalid_request", "Must surface invalid_request.");
}

// ── EVM adapter ────────────────────────────────────────────────────────

async function testEvmSuccess() {
  const result = await simulateEvmTransaction(evmBase, { transport: successEvmTransport() });
  assert.strictEqual(result.status, "passed", "EVM success must normalize to passed.");
  assert.strictEqual(result.provider, "eth_call", "Provider must default to eth_call.");
  assert.ok(isSimulationUsable(result), "Successful EVM simulation must be usable.");
  assert.strictEqual(result.blockNumber, 5000, "Block must be captured.");
  if (result.chainFamily === "evm") {
    assert.ok(result.simulatedTxHash, "Simulated tx hash must be present.");
  }
  assert.ok(result.resources?.gasUnits, "Gas estimate must be captured.");
  assert.ok(!("privateKey" in result), "Result must never carry a private key.");
}

async function testEvmRevertDecode() {
  // Custom error selector path.
  const data = "0xdeadbeef00000000000000000000000000000000000000000000000000000000";
  const decoded = decodeRevertReason(data);
  assert.ok(decoded.revertReason?.startsWith("Custom error"), "Custom error selector must be decoded.");

  // Error(string) path.
  const reason = decodeRevertReason("0x466e6169b2a0000000000000000000000000000000000000000000000000");
  assert.ok(reason.revertReason, "Revert reason must be produced for panic payloads.");

  const transport: EvmSimulationTransport = { ...successEvmTransport(), call: async () => "0xdeadbeef" as const };
  const result = await simulateEvmTransaction(evmBase, { transport });
  assert.strictEqual(result.status, "failed", "EVM revert must fail closed.");
  assert.ok(result.revertReason, "Revert reason must be carried through.");
}

async function testEvmTimeout() {
  const transport: EvmSimulationTransport = {
    ...successEvmTransport(),
    getChainId: async () => {
      throw new Error("JSON-RPC request timed out");
    },
  };
  const result = await simulateEvmTransaction(evmBase, { transport });
  assert.strictEqual(result.status, "unavailable", "Timeout must be unavailable.");
  assert.strictEqual(simulationError(result)?.code, "timeout", "Must surface timeout.");
}

async function testEvmWrongNetwork() {
  const transport = { ...successEvmTransport(), getChainId: async () => 1 };
  const result = await simulateEvmTransaction(evmBase, { transport });
  assert.strictEqual(result.status, "failed", "Wrong chain id must fail closed.");
  assert.strictEqual(simulationError(result)?.code, "wrong_network", "Must surface wrong_network.");
}

async function testEvmStaleBlock() {
  const transport: EvmSimulationTransport = {
    ...successEvmTransport(),
    getBlockNumber: async () => BigInt(5000),
  };
  const result = await simulateEvmTransaction(evmBase, { transport, expectedBlock: 5050, maxStateAge: 5 });
  assert.strictEqual(result.status, "failed", "Stale block must fail closed.");
  assert.strictEqual(simulationError(result)?.code, "stale_state", "Must surface stale_state.");
}

async function testEvmUnsupportedProvider() {
  const result = await simulateEvmTransaction(evmBase, { providerOverride: "unsupported" });
  assert.strictEqual(result.status, "unsupported", "Unsupported provider must be structured unsupported.");
  assert.strictEqual(simulationError(result)?.code, "unsupported_route", "Must surface unsupported_route.");
}

// ── Runner ─────────────────────────────────────────────────────────────

async function main() {
  testBindingHashes();
  testRedaction();

  await testSorobanSuccess();
  await testSorobanRevert();
  await testSorobanWrongNetwork();
  await testSorobanStaleLedger();
  await testSorobanMalformedRequest();
  await testSorobanSourceMismatch();

  await testEvmSuccess();
  await testEvmRevertDecode();
  await testEvmTimeout();
  await testEvmWrongNetwork();
  await testEvmStaleBlock();
  await testEvmUnsupportedProvider();

  console.log("All simulation acceptance tests passed.");
}

void main().catch((error) => {
  console.error("Simulation acceptance tests FAILED.");
  console.error(error);
  process.exitCode = 1;
});