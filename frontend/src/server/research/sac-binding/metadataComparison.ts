import { SAC_BINDING_LIMITS } from "./limits";
import type {
  ClassicAssetDescriptor,
  ContractInstanceSnapshot,
  MetadataComparisonResult,
} from "./schema";

export function compareSacMetadata(
  asset: ClassicAssetDescriptor,
  reported: ContractInstanceSnapshot["reportedMetadata"],
): MetadataComparisonResult {
  const expectedName = asset.canonical;
  const expectedSymbol = asset.code;
  const expectedDecimals = String(SAC_BINDING_LIMITS.expectedSacDecimals);

  const fields = [
    {
      field: "name" as const,
      expected: expectedName,
      reported: reported?.name ?? null,
      matches: reported?.name === expectedName,
    },
    {
      field: "symbol" as const,
      expected: expectedSymbol,
      reported: reported?.symbol ?? null,
      matches: reported?.symbol === expectedSymbol,
    },
    {
      field: "decimals" as const,
      expected: expectedDecimals,
      reported: reported ? String(reported.decimals) : null,
      matches: reported?.decimals === SAC_BINDING_LIMITS.expectedSacDecimals,
    },
  ];

  return {
    allMatch: fields.every((f) => f.matches),
    fields,
  };
}
