/**
 * Public entry point for the network settings feature.
 */

export { buildCoverage } from "./coverage";
export { NetworkSettingsError, type SettingsReadState, type WorkbenchState } from "./errors";
export { NETWORK_SETTINGS_LIMITS, pageWindow } from "./limits";
export {
  assertProviderPassphrase,
  assertSameNetwork,
  NETWORKS,
  NETWORK_IDS,
  parseNetworkId,
  type NetworkId,
} from "./networkIdentity";
export {
  networkSettingsRequestSchema,
  type CoverageReport,
  type DecodedSetting,
  type NetworkSettingsReport,
  type NetworkSettingsRequest,
  type SettingChange,
  type SettingSnapshot,
  type UpgradeView,
} from "./schema";
export { createDefaultSettingsReader, inspectNetworkSettings } from "./service";
export { describeSetting, listCatalogueFields, SETTING_GROUPS } from "./settingCatalogue";
export { decodeConfigSettingXdr, decodeConfigSettings } from "./settingsDecoder";
export {
  configSettingKeyXdrs,
  createRpcSettingsReader,
  readCurrentSettings,
  type RpcSettingsReader,
} from "./settingsReader";
export { diffSnapshots } from "./snapshotDiff";
export { compareNumeric, formatSettingValue } from "./units";
export { boundUpgradeHistory, defaultUpgradeRecords, type UpgradeRecord } from "./upgradeHistory";
