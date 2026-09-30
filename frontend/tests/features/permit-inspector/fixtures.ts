import { encodeNonces, encodePermit2Allowance, PERMIT2_ADDRESS, SELECTORS } from "@/server/research/permit-inspector/abi";
import type { PermitRpc } from "@/server/research/permit-inspector/rpc";

if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });

export const wallet = "0x9999999999999999999999999999999999999999";
export const token = "0x1111111111111111111111111111111111111111";
export const nonEip2612Token = "0x2222222222222222222222222222222222222222";
export const owner = "0x3333333333333333333333333333333333333333";
export const spender = "0x4444444444444444444444444444444444444444";

function encodeString(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  const lengthWord = bytes.length.toString(16).padStart(64, "0");
  let contentHex = bytes.toString("hex");
  const paddedLength = Math.ceil(bytes.length / 32) * 32 * 2;
  contentHex = contentHex.padEnd(paddedLength, "0");
  const offsetWord = (32).toString(16).padStart(64, "0");
  return "0x" + offsetWord + lengthWord + contentHex;
}

type PermitFixtureOptions = {
  eip2612?: { name: string; version?: string; domainSeparator: string; nonce: bigint };
  permit2?: { amount: bigint; expiration: number; nonce: number };
  failDomainSeparator?: boolean;
};

export function permitReader(options: PermitFixtureOptions = {}): PermitRpc {
  return {
    async blockNumber() {
      return 100n;
    },
    async call(to, data) {
      if (to.toLowerCase() === PERMIT2_ADDRESS.toLowerCase()) {
        if (!options.permit2) return null;
        const word = (value: number | bigint) => value.toString(16).padStart(64, "0");
        return "0x" + word(options.permit2.amount) + word(options.permit2.expiration) + word(options.permit2.nonce);
      }
      if (options.failDomainSeparator && data === SELECTORS.domainSeparator) return null;
      if (data === SELECTORS.domainSeparator) return options.eip2612 ? options.eip2612.domainSeparator : null;
      if (data === SELECTORS.name) return options.eip2612 ? encodeString(options.eip2612.name) : encodeString("Unknown Token");
      if (data === SELECTORS.version) return options.eip2612?.version ? encodeString(options.eip2612.version) : null;
      if (options.eip2612 && data === encodeNonces(owner)) {
        return "0x" + options.eip2612.nonce.toString(16).padStart(64, "0");
      }
      return null;
    },
  };
}

export function permit2AllowanceCallData(): string {
  return encodePermit2Allowance(owner, nonEip2612Token, spender);
}
