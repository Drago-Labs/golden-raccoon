import { getEvmNetwork } from "@/lib/evm/config";
import { decodePermit2Allowance, decodeString, decodeUint, encodeNonces, encodePermit2Allowance, PERMIT2_ADDRESS, SELECTORS } from "./abi";
import { createHttpPermitRpc, type PermitRpc } from "./rpc";
import type { Eip2612Evidence, Permit2Evidence, PermitRequest, PermitResult } from "./schema";

async function readEip2612(rpc: PermitRpc, token: string, owner: string, block: bigint): Promise<Eip2612Evidence> {
  const [nameRaw, versionRaw, domainSeparatorRaw, nonceRaw] = await Promise.all([
    rpc.call(token, SELECTORS.name, block),
    rpc.call(token, SELECTORS.version, block),
    rpc.call(token, SELECTORS.domainSeparator, block),
    rpc.call(token, encodeNonces(owner), block),
  ]);

  const domainSeparator = domainSeparatorRaw;
  const nonce = decodeUint(nonceRaw);

  // Only claim EIP-2612 support when both the domain separator and the
  // owner's nonce actually resolve. A token exposing an unrelated
  // DOMAIN_SEPARATOR() (some do, for other EIP-712 uses) without a working
  // nonces(address) is not a permit-capable token by this evidence.
  const supported = domainSeparator !== null && nonce !== null;

  return {
    supported,
    name: decodeString(nameRaw),
    version: decodeString(versionRaw),
    domainSeparator: supported ? domainSeparator : null,
    nonce: supported ? nonce!.toString() : null,
  };
}

async function readPermit2(rpc: PermitRpc, owner: string, token: string, spender: string, block: bigint): Promise<Permit2Evidence> {
  const raw = await rpc.call(PERMIT2_ADDRESS, encodePermit2Allowance(owner, token, spender), block);
  const decoded = decodePermit2Allowance(raw);
  return {
    checked: true,
    spenderAddress: spender,
    amount: decoded ? decoded.amount.toString() : null,
    expiration: decoded ? decoded.expiration : null,
    nonce: decoded ? decoded.nonce : null,
  };
}

export async function inspectPermit(input: PermitRequest, deps: { rpc?: PermitRpc } = {}): Promise<PermitResult> {
  const config = getEvmNetwork(input.network);
  if (!config) throw new Error("Unsupported network");
  const rpc = deps.rpc ?? createHttpPermitRpc(config.rpcUrl);
  const warnings: string[] = [];

  try {
    const block = input.blockNumber !== undefined ? BigInt(input.blockNumber) : await rpc.blockNumber();

    const eip2612 = await readEip2612(rpc, input.tokenAddress, input.ownerAddress, block);
    if (!eip2612.supported) {
      warnings.push("The token does not expose a working DOMAIN_SEPARATOR()/nonces() pair; it is not treated as EIP-2612 permit-capable from this evidence alone.");
    }

    let permit2: Permit2Evidence | null = null;
    if (input.spenderAddress) {
      permit2 = await readPermit2(rpc, input.ownerAddress, input.tokenAddress, input.spenderAddress, block);
      if (permit2.amount === null) warnings.push("Permit2's allowance record for this owner/token/spender could not be read.");
    } else {
      warnings.push("No spender was supplied: Permit2 exposure for this token was not checked.");
    }

    const unavailable = !eip2612.supported && (!permit2 || permit2.amount === null);

    return {
      network: input.network,
      chainId: config.chainId,
      blockNumber: Number(block),
      tokenAddress: input.tokenAddress,
      ownerAddress: input.ownerAddress,
      state: unavailable ? "partial" : "complete",
      eip2612,
      permit2,
      warnings,
    };
  } catch (error) {
    return {
      network: input.network,
      chainId: config.chainId,
      blockNumber: null,
      tokenAddress: input.tokenAddress,
      ownerAddress: input.ownerAddress,
      state: "unavailable",
      eip2612: null,
      permit2: null,
      warnings: [error instanceof Error ? error.message : "Provider unavailable"],
    };
  }
}
