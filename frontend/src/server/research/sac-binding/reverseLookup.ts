import { parseClassicAsset } from "./assetIdentity";
import type { ClassicAssetDescriptor, ContractInstanceSnapshot } from "./schema";

export function resolveCounterpartAsset(
  explicitAssetInput: string | undefined,
  instance: ContractInstanceSnapshot | null,
): ClassicAssetDescriptor | null {
  if (explicitAssetInput && explicitAssetInput.trim().length > 0) {
    return parseClassicAsset(explicitAssetInput);
  }
  if (instance?.boundAssetCanonical) {
    return parseClassicAsset(instance.boundAssetCanonical);
  }
  return null;
}
