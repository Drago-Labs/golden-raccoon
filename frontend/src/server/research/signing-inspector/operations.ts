/**
 * Stellar operations, interpreted where possible and preserved where not.
 *
 * An operation the inspector does not interpret still appears in the list,
 * flagged `supported: false`, with its type name intact. Dropping it would
 * turn a five-operation transaction into a four-operation transaction in the
 * user's mind, which is precisely the failure this feature exists to prevent.
 */
import type { DecodedOperation, Permission, UnknownField } from "./schema";

type RawOperation = {
  type?: string;
  source?: string;
  destination?: string;
  amount?: string;
  asset?: { code?: string; issuer?: string; getCode?: () => string; getIssuer?: () => string; isNative?: () => boolean };
  line?: { code?: string; issuer?: string };
  limit?: string;
  [key: string]: unknown;
};

function assetLabel(asset: RawOperation["asset"] | RawOperation["line"]): string {
  if (!asset) return "unknown asset";

  const withMethods = asset as { isNative?: () => boolean; getCode?: () => string; getIssuer?: () => string };

  if (typeof withMethods.isNative === "function" && withMethods.isNative()) return "XLM (native)";

  const code = typeof withMethods.getCode === "function" ? withMethods.getCode() : (asset as { code?: string }).code;
  const issuer = typeof withMethods.getIssuer === "function" ? withMethods.getIssuer() : (asset as { issuer?: string }).issuer;

  if (!code) return "unknown asset";

  return issuer ? `${code} (issuer ${issuer})` : code;
}

/** Operation types this module describes. Anything else is preserved, not guessed. */
const INTERPRETED = new Set([
  "payment",
  "createAccount",
  "changeTrust",
  "setOptions",
  "pathPaymentStrictSend",
  "pathPaymentStrictReceive",
  "accountMerge",
]);

export function decodeOperations(
  rawOperations: unknown[],
  envelopeSource: string,
): { operations: DecodedOperation[]; permissions: Permission[]; unknownFields: UnknownField[] } {
  const operations: DecodedOperation[] = [];
  const permissions: Permission[] = [];
  const unknownFields: UnknownField[] = [];

  rawOperations.forEach((entry, index) => {
    const operation = (entry ?? {}) as RawOperation;
    const type = typeof operation.type === "string" ? operation.type : "unknown";
    const source = operation.source ?? envelopeSource;
    const supported = INTERPRETED.has(type);
    const fields: Array<{ label: string; value: string }> = [{ label: "Source", value: source }];

    let summary = `An operation of type ${type}.`;

    if (type === "payment") {
      const asset = assetLabel(operation.asset);

      fields.push({ label: "Destination", value: operation.destination ?? "unknown" });
      fields.push({ label: "Amount", value: operation.amount ?? "unknown" });
      fields.push({ label: "Asset", value: asset });
      summary = `Pays ${operation.amount ?? "an unstated amount"} ${asset} to ${operation.destination ?? "an unstated destination"}.`;

      permissions.push({
        permissionId: `stellar-payment-${index}`,
        kind: "stellar_payment",
        spender: null,
        recipient: operation.destination ?? null,
        subject: asset,
        amountRaw: operation.amount ?? null,
        isUnlimited: false,
        deadline: null,
        rawProvenance: `operation ${index} (payment)`,
        consequence: "Signing and submitting this moves the stated amount out of the source account immediately.",
      });
    } else if (type === "createAccount") {
      fields.push({ label: "Destination", value: operation.destination ?? "unknown" });
      fields.push({ label: "Starting balance", value: String(operation.startingBalance ?? "unknown") });
      summary = `Creates account ${operation.destination ?? "unknown"} and funds it.`;

      permissions.push({
        permissionId: `stellar-create-account-${index}`,
        kind: "stellar_payment",
        spender: null,
        recipient: operation.destination ?? null,
        subject: "XLM (native)",
        amountRaw: String(operation.startingBalance ?? ""),
        isUnlimited: false,
        deadline: null,
        rawProvenance: `operation ${index} (createAccount)`,
        consequence: "Signing and submitting this moves the starting balance out of the source account.",
      });
    } else if (type === "changeTrust") {
      const asset = assetLabel(operation.line);
      const limit = operation.limit ?? "unknown";

      fields.push({ label: "Asset", value: asset });
      fields.push({ label: "Limit", value: limit });
      summary = limit === "0" ? `Removes the trustline for ${asset}.` : `Trusts ${asset} up to ${limit}.`;

      permissions.push({
        permissionId: `stellar-trustline-${index}`,
        kind: "stellar_trustline",
        spender: null,
        recipient: null,
        subject: asset,
        amountRaw: limit === "unknown" ? null : limit,
        isUnlimited: false,
        deadline: null,
        rawProvenance: `operation ${index} (changeTrust)`,
        consequence:
          limit === "0"
            ? "Signing and submitting this removes the trustline, which requires the balance to be zero."
            : "Signing and submitting this lets the issuer's asset be held by this account up to the stated limit.",
      });
    } else if (type === "setOptions") {
      const changes = Object.entries(operation).filter(
        ([key, value]) => !["type", "source"].includes(key) && value !== undefined && value !== null,
      );

      for (const [key, value] of changes) {
        fields.push({ label: key, value: typeof value === "object" ? JSON.stringify(value).slice(0, 160) : String(value) });
      }

      summary = "Changes account options, which can include signers and thresholds.";

      permissions.push({
        permissionId: `stellar-set-options-${index}`,
        kind: "stellar_account_change",
        spender: null,
        recipient: null,
        subject: source,
        amountRaw: null,
        isUnlimited: false,
        deadline: null,
        rawProvenance: `operation ${index} (setOptions)`,
        consequence:
          "Signing and submitting this changes account configuration. If it adds a signer or lowers a threshold, it changes who can move funds from this account.",
      });
    } else if (type === "accountMerge") {
      fields.push({ label: "Destination", value: operation.destination ?? "unknown" });
      summary = `Merges this account into ${operation.destination ?? "unknown"}, transferring its entire balance.`;

      permissions.push({
        permissionId: `stellar-account-merge-${index}`,
        kind: "stellar_payment",
        spender: null,
        recipient: operation.destination ?? null,
        subject: "the entire account balance",
        amountRaw: null,
        isUnlimited: true,
        deadline: null,
        rawProvenance: `operation ${index} (accountMerge)`,
        consequence: "Signing and submitting this closes the source account and sends its entire remaining balance to the destination.",
      });
    } else if (type === "pathPaymentStrictSend" || type === "pathPaymentStrictReceive") {
      fields.push({ label: "Destination", value: operation.destination ?? "unknown" });
      fields.push({ label: "Send asset", value: assetLabel(operation.sendAsset as RawOperation["asset"]) });
      fields.push({ label: "Destination asset", value: assetLabel(operation.destAsset as RawOperation["asset"]) });
      summary = "Sends one asset and delivers another through the order book.";
    } else {
      unknownFields.push({
        location: `operations[${index}]`,
        description: `This operation type is preserved but not interpreted: ${type}.`,
        raw: JSON.stringify(operation, (_key, value) => (typeof value === "bigint" ? value.toString() : value)).slice(0, 400),
      });
    }

    operations.push({ index, type, supported, summary, fields });
  });

  return { operations, permissions, unknownFields };
}
