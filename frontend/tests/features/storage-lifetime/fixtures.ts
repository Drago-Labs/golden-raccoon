import { Address, StrKey, xdr } from "@stellar/stellar-sdk";

if (!window.localStorage) {
  Object.defineProperty(window, "localStorage", {
    value: { clear() {}, getItem() { return null; }, removeItem() {}, setItem() {} },
  });
}

export const walletAddress = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 3));
export const contractId = StrKey.encodeContract(Buffer.alloc(32, 7));

export function contractDataKey(
  durability: "persistent" | "temporary" = "persistent",
  instance = false,
) {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: instance ? xdr.ScVal.scvLedgerKeyContractInstance() : xdr.ScVal.scvU32(7),
      durability: xdr.ContractDataDurability[durability],
    }),
  );
  return { key, encoded: key.toXdr("base64") };
}

export function validRequest(keys: string[]) {
  return {
    walletAddress,
    network: "stellar-testnet" as const,
    walletNetwork: "stellar-testnet" as const,
    contractId,
    keys,
  };
}
