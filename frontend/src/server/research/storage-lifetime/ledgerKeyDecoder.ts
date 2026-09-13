import { Address, xdr } from "@stellar/stellar-sdk";

export type DecodedKey = {
  xdr: string;
  value: xdr.LedgerKey;
  kind: "instance" | "code" | "data" | "unsupported";
  durability: "persistent" | "temporary" | "not_applicable" | "unknown";
};

export function decodeLedgerKey(encoded: string, contractId: string): DecodedKey {
  let value: xdr.LedgerKey;
  try {
    value = xdr.LedgerKey.fromXdr(encoded, "base64");
  } catch {
    throw new Error("Malformed ledger-key XDR");
  }

  if (value.type === "contractCode") {
    return { xdr: encoded, value, kind: "code", durability: "not_applicable" };
  }
  if (value.type !== "contractData") {
    return { xdr: encoded, value, kind: "unsupported", durability: "unknown" };
  }

  const observedContract = Address.fromScAddress(value.contractData.contract).toString();
  if (observedContract !== contractId) {
    throw new Error("Ledger key belongs to another contract");
  }
  const durability =
    value.contractData.durability.name === "persistent"
      ? "persistent"
      : value.contractData.durability.name === "temporary"
        ? "temporary"
        : "unknown";
  const kind =
    value.contractData.key.type === "scvLedgerKeyContractInstance" ? "instance" : "data";
  return { xdr: encoded, value, kind, durability };
}
