/**
 * Fixtures for the offline signing inspector.
 *
 * Every payload here is built in-process: EVM calldata is assembled from its
 * selector and argument words, and Stellar envelopes are built with the
 * installed SDK from a deterministic seed. Nothing is fetched, no key controls
 * real funds, and the XDR strings are reproduced by running this file rather
 * than pasted from a chain.
 */
// Must come before the SDK import: it fixes the typed-array realm the codec asserts on.
import "./typedArrayRealm";
import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

export const EVALUATED_AT = "2026-03-01T12:00:00.000Z";
export const EVALUATED_AT_MS = Date.parse(EVALUATED_AT);

export const OWNER = "0x1111111111111111111111111111111111111111";
export const SPENDER = "0x2222222222222222222222222222222222222222";
export const RECIPIENT = "0x3333333333333333333333333333333333333333";
export const TOKEN = "0x4444444444444444444444444444444444444444";
export const OTHER_TOKEN = "0x5555555555555555555555555555555555555555";

export const MAX_UINT256_DECIMAL = (2n ** 256n - 1n).toString();

function word(value: string | bigint): string {
  if (typeof value === "bigint") return value.toString(16).padStart(64, "0");

  return value.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export function calldata(selector: string, ...args: Array<string | bigint>): string {
  return `${selector}${args.map(word).join("")}`;
}

/** `approve(spender, 2^256-1)` — the unlimited allowance. */
export const UNLIMITED_APPROVE = calldata("0x095ea7b3", SPENDER, 2n ** 256n - 1n);

/** `approve(spender, 1000)` — a bounded allowance. */
export const BOUNDED_APPROVE = calldata("0x095ea7b3", SPENDER, 1000n);

/** `transfer(recipient, 25)`. */
export const TRANSFER = calldata("0xa9059cbb", RECIPIENT, 25n);

/** A selector that is not on the allowlist. */
export const UNKNOWN_SELECTOR_CALLDATA = calldata("0xdeadbeef", SPENDER, 42n);

/** Well-formed hex that is too short to hold a selector. */
export const TRUNCATED_CALLDATA = "0xa9059c";

/** A recognized selector with its argument words cut short. */
export const TRUNCATED_ARGS_CALLDATA = `0x095ea7b3${word(SPENDER)}`;

function permitTypedData(overrides: {
  chainId?: number | string;
  verifyingContract?: string;
  value?: string;
  deadline?: number | string;
  owner?: string;
  spender?: string;
  primaryType?: string;
  types?: unknown;
} = {}) {
  return {
    domain: {
      name: "Example Token",
      version: "1",
      chainId: overrides.chainId ?? 1,
      verifyingContract: overrides.verifyingContract ?? TOKEN,
    },
    primaryType: overrides.primaryType ?? "Permit",
    types: overrides.types ?? {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    message: {
      owner: overrides.owner ?? OWNER,
      spender: overrides.spender ?? SPENDER,
      value: overrides.value ?? MAX_UINT256_DECIMAL,
      nonce: "0",
      deadline: overrides.deadline ?? 1_800_000_000,
    },
  };
}

/** An unlimited ERC-2612 permit on chain 1, not yet expired. */
export const UNLIMITED_PERMIT = permitTypedData();

/** The same permit, but its domain names a different chain. */
export const WRONG_CHAIN_PERMIT = permitTypedData({ chainId: 137 });

/** The same permit, but its domain names a different token contract. */
export const WRONG_CONTRACT_PERMIT = permitTypedData({ verifyingContract: OTHER_TOKEN });

/** A permit whose deadline is before the evaluation time. */
export const EXPIRED_PERMIT = permitTypedData({ deadline: 1_700_000_000, value: "1000" });

/** A document that calls itself Permit but declares different fields. */
export const IMPOSTOR_PERMIT = permitTypedData({
  types: {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "everything", type: "bool" },
    ],
  },
});

/** Typed data of a type the inspector does not recognize. */
export const UNKNOWN_TYPED_DATA = permitTypedData({ primaryType: "Order" });

/** Typed data nested past the published depth limit. */
export function deeplyNestedTypedData(depth: number) {
  let node: Record<string, unknown> = { leaf: true };

  for (let index = 0; index < depth; index += 1) {
    node = { nested: node };
  }

  return { domain: { chainId: 1 }, primaryType: "Deep", types: { Deep: [] }, message: node };
}

const SEED_A = Buffer.alloc(32, 7);
const SEED_B = Buffer.alloc(32, 9);
const SEED_C = Buffer.alloc(32, 11);

export const STELLAR_SOURCE = Keypair.fromRawEd25519Seed(SEED_A).publicKey();
export const STELLAR_DESTINATION = Keypair.fromRawEd25519Seed(SEED_B).publicKey();
export const STELLAR_FEE_PAYER = Keypair.fromRawEd25519Seed(SEED_C).publicKey();

export const TESTNET_PASSPHRASE = Networks.TESTNET;
export const PUBLIC_PASSPHRASE = Networks.PUBLIC;

function builder(options: { timebounds?: { minTime: number; maxTime: number } } = {}) {
  return new TransactionBuilder(new Account(STELLAR_SOURCE, "100"), {
    fee: "200",
    networkPassphrase: TESTNET_PASSPHRASE,
    timebounds: options.timebounds ?? { minTime: 0, maxTime: 0 },
  });
}

/** One payment, a text memo, no time bound. */
export const SINGLE_PAYMENT_XDR = builder()
  .addOperation(Operation.payment({ destination: STELLAR_DESTINATION, asset: Asset.native(), amount: "12.5" }))
  .addMemo(Memo.text("invoice 42"))
  .build()
  .toXDR();

/**
 * Several operations, including one that changes account options.
 *
 * The setOptions operation is the interesting one: it is the operation that
 * can quietly hand control of the account to another key.
 */
export const MULTI_OPERATION_XDR = builder({ timebounds: { minTime: 0, maxTime: 1_900_000_000 } })
  .addOperation(Operation.payment({ destination: STELLAR_DESTINATION, asset: Asset.native(), amount: "1" }))
  .addOperation(
    Operation.changeTrust({
      asset: new Asset("USDC", STELLAR_DESTINATION),
      limit: "1000",
    }),
  )
  .addOperation(
    Operation.setOptions({
      signer: { ed25519PublicKey: STELLAR_DESTINATION, weight: 255 },
    }),
  )
  .addOperation(Operation.bumpSequence({ bumpTo: "900" }))
  .addMemo(Memo.id("77"))
  .build()
  .toXDR();

/** A transaction whose time bound has already passed. */
export const EXPIRED_TIMEBOUNDS_XDR = builder({ timebounds: { minTime: 0, maxTime: 1_700_000_000 } })
  .addOperation(Operation.payment({ destination: STELLAR_DESTINATION, asset: Asset.native(), amount: "3" }))
  .build()
  .toXDR();

/** An account merge: the whole balance leaves in one operation. */
export const ACCOUNT_MERGE_XDR = builder()
  .addOperation(Operation.accountMerge({ destination: STELLAR_DESTINATION }))
  .build()
  .toXDR();

/** A fee-bump envelope: a different account pays for the inner transaction. */
export const FEE_BUMP_XDR = TransactionBuilder.buildFeeBumpTransaction(
  STELLAR_FEE_PAYER,
  "2000",
  TransactionBuilder.fromXDR(SINGLE_PAYMENT_XDR, TESTNET_PASSPHRASE) as never,
  TESTNET_PASSPHRASE,
).toXDR();

/** Base64 that is not a transaction envelope. */
export const MALFORMED_XDR = "AAAAAgAAnotrealxdr====";

export function calldataRequest(data: string, overrides: Record<string, unknown> = {}) {
  return {
    evaluatedAt: EVALUATED_AT,
    expected: { evmChainId: 1, verifyingContract: TOKEN },
    payload: { kind: "evm_calldata", to: TOKEN, data, chainId: 1, ...overrides },
  };
}

export function typedDataRequest(typedData: unknown, expected: Record<string, unknown> = {}) {
  return {
    evaluatedAt: EVALUATED_AT,
    expected: { evmChainId: 1, verifyingContract: TOKEN, account: OWNER, ...expected },
    payload: { kind: "evm_typed_data", typedData },
  };
}

export function envelopeRequest(xdr: string, overrides: Record<string, unknown> = {}, expected: Record<string, unknown> = {}) {
  return {
    evaluatedAt: EVALUATED_AT,
    expected: { account: STELLAR_SOURCE, stellarNetworkPassphrase: TESTNET_PASSPHRASE, ...expected },
    payload: { kind: "stellar_envelope", xdr, networkPassphrase: TESTNET_PASSPHRASE, ...overrides },
  };
}
