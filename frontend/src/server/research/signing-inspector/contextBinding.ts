/**
 * Whether the payload is bound to the context the user expects.
 *
 * Three states, not two. `match` and `mismatch` are obvious. `not_bound` is
 * the one that matters: it says the payload carries no such field at all, so
 * there is nothing to compare and nothing protecting the user from signing it
 * in a different context. A Stellar envelope is the canonical example — it
 * names no network, and the passphrase only enters at signing time.
 */
import type { ContextBinding } from "./schema";

type Expected = {
  account?: string;
  evmChainId?: number;
  stellarNetworkPassphrase?: string;
  verifyingContract?: string;
};

function compare(options: {
  field: ContextBinding["field"];
  expected: string | null;
  observed: string | null;
  matchNote: string;
  mismatchNote: string;
  notBoundNote: string;
  caseInsensitive?: boolean;
}): ContextBinding {
  const { field, expected, observed, caseInsensitive = true } = options;

  if (observed === null) {
    return { field, expected, observed, state: "not_bound", note: options.notBoundNote };
  }

  if (expected === null) {
    return {
      field,
      expected,
      observed,
      state: "not_checked",
      note: "The payload declares this, but no expected value was supplied to compare it against.",
    };
  }

  const same = caseInsensitive ? expected.toLowerCase() === observed.toLowerCase() : expected === observed;

  return { field, expected, observed, state: same ? "match" : "mismatch", note: same ? options.matchNote : options.mismatchNote };
}

export function bindEvmCalldata(expected: Expected, payload: { to?: string; chainId?: number }): ContextBinding[] {
  return [
    compare({
      field: "evm_chain_id",
      expected: expected.evmChainId === undefined ? null : String(expected.evmChainId),
      observed: payload.chainId === undefined ? null : String(payload.chainId),
      matchNote: "The request names the chain you expect.",
      mismatchNote: "This request is for a different chain than the one you expect. The same address is a different contract there.",
      notBoundNote:
        "Raw calldata carries no chain id. Nothing in this payload restricts which chain it is sent on; only the wallet's own network selection does.",
    }),
    compare({
      field: "verifying_contract",
      expected: expected.verifyingContract ?? null,
      observed: payload.to ?? null,
      matchNote: "The calldata is addressed to the contract you expect.",
      mismatchNote: "The calldata is addressed to a different contract than the one you expect.",
      notBoundNote: "The caller did not state which contract this calldata would be sent to, so the target was not checked.",
    }),
  ];
}

export function bindTypedData(
  expected: Expected,
  domain: { chainId: string | null; verifyingContract: string | null; name: string | null },
  owner: string | null,
): ContextBinding[] {
  const bindings: ContextBinding[] = [
    compare({
      field: "evm_chain_id",
      expected: expected.evmChainId === undefined ? null : String(expected.evmChainId),
      observed: domain.chainId,
      matchNote: "The signing domain is bound to the chain you expect.",
      mismatchNote:
        "The signing domain names a different chain than the one you expect. A signature made here would be valid on that chain, not this one.",
      notBoundNote: "The domain declares no chain id, so the signature is not bound to any particular chain.",
    }),
    compare({
      field: "verifying_contract",
      expected: expected.verifyingContract ?? null,
      observed: domain.verifyingContract,
      matchNote: "The signing domain is bound to the contract you expect.",
      mismatchNote: "The signing domain names a different verifying contract than the one you expect.",
      notBoundNote: "The domain declares no verifying contract, so the signature is not bound to a particular contract.",
    }),
  ];

  if (owner !== null || expected.account !== undefined) {
    bindings.push(
      compare({
        field: "account",
        expected: expected.account ?? null,
        observed: owner,
        matchNote: "The permit is signed on behalf of the account you expect.",
        mismatchNote: "The permit names a different owner than the account you expect.",
        notBoundNote: "The payload names no owner account.",
      }),
    );
  }

  if (domain.name !== null) {
    bindings.push({
      field: "domain_name",
      expected: null,
      observed: domain.name,
      state: "not_checked",
      note: "The domain name is chosen by the contract and is not verified by anything. It is shown, not trusted.",
    });
  }

  return bindings;
}

export function bindStellarEnvelope(
  expected: Expected,
  envelope: { source: string; declaredPassphrase: string | null; networkIdHex: string | null },
): ContextBinding[] {
  const bindings: ContextBinding[] = [
    compare({
      field: "account",
      expected: expected.account ?? null,
      observed: envelope.source,
      matchNote: "The transaction's source is the account you expect.",
      mismatchNote: "The transaction's source is a different account than the one you expect.",
      notBoundNote: "The envelope names no source account.",
    }),
  ];

  if (expected.stellarNetworkPassphrase === undefined && envelope.declaredPassphrase === null) {
    bindings.push({
      field: "stellar_network",
      expected: null,
      observed: null,
      state: "not_bound",
      note:
        "A Stellar envelope carries no network identifier. The network only enters when the signature is made, so this payload cannot be checked against a network — and could be signed for any of them.",
    });

    return bindings;
  }

  const expectedPassphrase = expected.stellarNetworkPassphrase ?? null;
  const declared = envelope.declaredPassphrase;

  bindings.push({
    field: "stellar_network",
    expected: expectedPassphrase,
    observed: declared,
    state: expectedPassphrase === null ? "not_checked" : declared === null ? "not_bound" : expectedPassphrase === declared ? "match" : "mismatch",
    note:
      expectedPassphrase === null
        ? "A network passphrase was declared for signing, but no expected network was supplied to compare it against."
        : declared === null
          ? "No signing network was declared, so nothing binds this envelope to the network you expect."
          : expectedPassphrase === declared
            ? `The declared signing network matches the one you expect. Note this is the caller's declaration, hashed to ${envelope.networkIdHex?.slice(0, 16)}…, not a field read from the envelope.`
            : "The network this would be signed under is not the one you expect. The same envelope signed elsewhere is a different transaction.",
  });

  return bindings;
}
