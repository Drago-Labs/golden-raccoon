import type { ContractInstanceSnapshot, SacBindingDeps } from "@/server/research/sac-binding";

export const ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const USDC_ASSET = `USDC:${ISSUER}`;
export const LONG_ASSET = `STELLARTOKEN:${ISSUER}`;

export function depsFromInstance(snapshot: ContractInstanceSnapshot): SacBindingDeps {
  return {
    instanceProvider: {
      async readContractInstance({ contractId }) {
        return { ...snapshot, contractId };
      },
    },
  };
}
