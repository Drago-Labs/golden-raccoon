import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { StrKey } from "@stellar/stellar-sdk";
import { SAC_NETWORK_PASSPHRASES, type SacNetwork } from "./networkIdentity";
import type { ClassicAssetDescriptor, DerivedSacRecord } from "./schema";

function encodeClassicAssetXdr(asset: ClassicAssetDescriptor): Buffer {
  if (asset.assetType === "native") {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(0, 0); // ASSET_TYPE_NATIVE = 0
    return buf;
  }
  const isAlpha4 = asset.assetType === "credit_alphanum4";
  const codeLen = isAlpha4 ? 4 : 12;
  const codeBuf = Buffer.alloc(codeLen, 0);
  codeBuf.write(asset.code, 0, "ascii");

  const typeBuf = Buffer.alloc(4);
  typeBuf.writeInt32BE(isAlpha4 ? 1 : 2, 0); // 1 = ALPHANUM4, 2 = ALPHANUM12

  const keyTypeBuf = Buffer.alloc(4);
  keyTypeBuf.writeInt32BE(0, 0); // PUBLIC_KEY_TYPE_ED25519 = 0

  const issuerRaw = Buffer.from(StrKey.decodeEd25519PublicKey(asset.issuer!));
  return Buffer.concat([typeBuf, codeBuf, keyTypeBuf, issuerRaw]);
}

export function deriveSacContractId(
  asset: ClassicAssetDescriptor,
  network: SacNetwork,
): DerivedSacRecord {
  const passphrase = SAC_NETWORK_PASSPHRASES[network];
  const networkId = createHash("sha256").update(passphrase, "utf8").digest();
  const assetXdr = encodeClassicAssetXdr(asset);

  // ENVELOPE_TYPE_CONTRACT_ID = 18, CONTRACT_ID_PREIMAGE_FROM_ASSET = 1
  const envType = Buffer.alloc(4);
  envType.writeInt32BE(18, 0);
  const preimageType = Buffer.alloc(4);
  preimageType.writeInt32BE(1, 0);

  const preimage = Buffer.concat([envType, networkId, preimageType, assetXdr]);
  const contractHash = createHash("sha256").update(preimage).digest();
  const expectedContractId = StrKey.encodeContract(contractHash);

  return {
    asset,
    network,
    passphrase,
    expectedContractId,
    steps: [
      {
        step: 1,
        label: "Network Passphrase SHA-256 (networkId)",
        value: networkId.toString("hex"),
      },
      {
        step: 2,
        label: `Classic Asset XDR (${asset.assetType})`,
        value: assetXdr.toString("base64"),
      },
      {
        step: 3,
        label: "HashIdPreimageContractId(fromAsset) -> StrKey C-address",
        value: expectedContractId,
      },
    ],
  };
}
