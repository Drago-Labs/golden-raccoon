import type { PaymentScheme } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { X402ChainFamily } from "@/server/types";
import type { X402RuntimeConfig } from "@/server/x402/config";
import { StellarExactScheme } from "@/server/x402/stellarScheme";
import {
  evmSettlementContract,
  stellarSettlementContract,
  type SettlementContract,
} from "@/server/x402/settlement/contract";

export type RegisteredScheme = {
  scheme: PaymentScheme;
  chainFamily: X402ChainFamily;
  label: string;
  settlementContract: SettlementContract;
};

/**
 * Returns the ordered list of registered payment schemes for the runtime configuration.
 */
export function getRegisteredSchemes(config: X402RuntimeConfig): RegisteredScheme[] {
  const schemes: RegisteredScheme[] = [
    {
      scheme: new ExactEvmScheme(),
      chainFamily: "evm",
      label: "exact",
      settlementContract: evmSettlementContract,
    },
  ];

  if (config.supportedSchemes.includes("exact-stellar")) {
    schemes.push({
      scheme: new StellarExactScheme() as unknown as PaymentScheme,
      chainFamily: "stellar",
      label: "exact-stellar",
      settlementContract: stellarSettlementContract,
    });
  }

  return schemes;
}
