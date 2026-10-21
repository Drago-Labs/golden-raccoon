export type AssetFields = {
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
  asset?: string;
  amount?: string;
};

/** Classic identity. Native stays `native`. Issued assets stay `CODE:ISSUER` and are never merged by code alone. */
export function assetKey(fields: AssetFields): string {
  if (typeof fields.asset === "string" && fields.asset.length > 0) {
    if (fields.asset === "native") return "native";
    const parts = fields.asset.split(":");
    if (parts.length === 2 && parts[0] && parts[1]) return fields.asset;
  }
  if (!fields.asset_type || fields.asset_type === "native") return "native";
  if (!fields.asset_code || !fields.asset_issuer) {
    throw new Error("Issued asset is missing a code or issuer.");
  }
  return `${fields.asset_code}:${fields.asset_issuer}`;
}
