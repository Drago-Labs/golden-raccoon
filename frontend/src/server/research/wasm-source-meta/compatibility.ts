import type { CompatibilityReport, EnvMetadata, ExtractedMetadata } from "./schema";

const NETWORK_PROTOCOL: Record<string, string> = {
  "stellar-testnet": "23",
  "stellar-pubnet": "23",
};

/**
 * Report protocol / SDK compatibility with the selected network.
 * This is advisory only — it does not prove runtime safety.
 */
export function assessCompatibility(
  network: string,
  envMeta: EnvMetadata,
  metadata: ExtractedMetadata,
): CompatibilityReport {
  const networkProtocol = NETWORK_PROTOCOL[network] ?? "unknown";
  const wasmInterfaceVersion = envMeta.interfaceVersion;
  const sdkVersion = metadata.sdkVersion;

  let compatible: boolean | null = null;
  let notes = "Compatibility could not be determined from available metadata.";

  if (!envMeta.sectionPresent && !metadata.sdkVersion) {
    notes = "No env or SDK metadata was present in the Wasm; compatibility is unknown.";
  } else if (wasmInterfaceVersion) {
    // Interface version packing varies; treat major-protocol alignment as advisory.
    const major = wasmInterfaceVersion.slice(0, Math.min(2, wasmInterfaceVersion.length));
    compatible = major === networkProtocol || wasmInterfaceVersion.includes(networkProtocol);
    notes = compatible
      ? `Wasm interface version ${wasmInterfaceVersion} aligns with network protocol ${networkProtocol}.`
      : `Wasm interface version ${wasmInterfaceVersion} may not match network protocol ${networkProtocol}.`;
  } else if (sdkVersion) {
    compatible = true;
    notes = `SDK version ${sdkVersion} was reported; interface version was absent. Treat as advisory only.`;
  }

  return {
    network,
    networkProtocol,
    wasmInterfaceVersion,
    sdkVersion,
    compatible,
    notes,
  };
}
