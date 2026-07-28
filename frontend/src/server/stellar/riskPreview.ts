import "server-only";

import { Address, BASE_FEE, Contract, SorobanDataBuilder, TransactionBuilder, nativeToScVal } from "@stellar/stellar-sdk";
import { createStellarRpcServer } from "@/server/stellar/client";
import { canonicalReportJson, sha256Bytes, getRiskRegistryContractId } from "@/server/stellar/riskRegistry";
import type { StellarNetworkId } from "@/lib/stellar/config";

export type RiskPublicationPreview = {
  xdr: string;
  network: string;
  networkPassphrase: string;
  contractId: string;
  publisher: string;
  assetId: string;
  reportHash: string;
  reportJson: string;
  expiresAt: number;
  fee: number;
  footprint: {
    readOnly: number;
    readWrite: number;
    hasRestoreEntry: boolean;
  };
  simulationPassed: boolean;
  minResourceFee?: string;
  assetLabel: string;
  score: number;
  verdict: string;
};

export async function getRiskPublicationPreview(
  networkId: StellarNetworkId,
  publication: {
    publisher: string;
    assetKey: string;
    assetLabel: string;
    score: number;
    verdict: string;
    evidenceUri: string;
    updatedAt: number;
    report: unknown;
  },
): Promise<RiskPublicationPreview> {
  const { network, server } = createStellarRpcServer(networkId);
  if (!network) throw new Error("Unsupported Stellar network: " + networkId);

  const contractId = getRiskRegistryContractId(networkId);
  if (!contractId) throw new Error("Risk registry is not deployed for " + networkId + ".");

  const registry = new Contract(contractId);
  const source = await server.getAccount(publication.publisher);
  const reportJson = canonicalReportJson(publication.report);
  if (Buffer.byteLength(reportJson, "utf8") > 100_000) {
    throw new Error("Risk report payload exceeds 100KB limit.");
  }

  const assetId = sha256Bytes(network.id + ":" + publication.assetKey);
  const reportHash = sha256Bytes(reportJson);

  const operation = registry.call(
    "publish_risk",
    new Address(publication.publisher).toScVal(),
    nativeToScVal(assetId),
    nativeToScVal(network.shortName, { type: "symbol" }),
    nativeToScVal(publication.assetLabel),
    nativeToScVal(publication.score, { type: "u32" }),
    nativeToScVal(publication.verdict.slice(0, 32), { type: "symbol" }),
    nativeToScVal(reportHash),
    nativeToScVal(publication.evidenceUri),
    nativeToScVal(publication.updatedAt, { type: "u64" }),
  );

  // Build the transaction
  const transaction = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: network.networkPassphrase })
    .addOperation(operation)
    .setTimeout(120)
    .build();

  // Prepare (simulate + populate resources) the transaction
  const prepared = await server.prepareTransaction(transaction);

  // Extract footprint from the transaction's soroban data after preparation
  let readOnlyCount = 0;
  let readWriteCount = 0;
  let hasRestoreEntry = false;
  let minResourceFee: string | undefined;

  try {
    // sorobanData exists at runtime on the prepared Transaction but is not in the type declarations.
    // SorobanDataBuilder accepts Buffer | Uint8Array | xdr.SorobanTransactionData | string.
    const rawData = (prepared as { sorobanData?: Buffer | Uint8Array | string }).sorobanData;
    if (rawData) {
      const builder = new SorobanDataBuilder(rawData);
      readOnlyCount = builder.getReadOnly().length;
      readWriteCount = builder.getReadWrite().length;
    }
    // Use the prepared transaction's fee as a proxy for the resource fee
    minResourceFee = prepared.fee;
  } catch {
    // Soroban data may not be present for non-soroban transactions
  }

  return {
    xdr: prepared.toXDR(),
    network: network.id,
    networkPassphrase: network.networkPassphrase,
    contractId,
    publisher: publication.publisher,
    assetId: Buffer.from(assetId).toString("hex"),
    reportHash: Buffer.from(reportHash).toString("hex"),
    reportJson,
    expiresAt: Date.now() + 120_000,
    fee: Number(prepared.fee),
    footprint: {
      readOnly: readOnlyCount,
      readWrite: readWriteCount,
      hasRestoreEntry,
    },
    simulationPassed: true,
    minResourceFee,
    assetLabel: publication.assetLabel,
    score: publication.score,
    verdict: publication.verdict,
  };
}
