/**
 * Typed failures and the workbench state union for network settings.
 * Callers branch on `code` or `status` instead of parsing message text.
 */

export type SettingsReadState = "complete" | "partial" | "unavailable";

export type NetworkSettingsErrorCode =
  | "invalid_request"
  | "invalid_json"
  | "payload_too_large"
  | "unknown_network"
  | "network_mismatch"
  | "provider_unavailable"
  | "invalid_history"
  | "not_config_setting"
  | "decode_failed";

export class NetworkSettingsError extends Error {
  readonly code: NetworkSettingsErrorCode;
  readonly details?: unknown;

  constructor(code: NetworkSettingsErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "NetworkSettingsError";
    this.code = code;
    this.details = details;
  }
}

/** UI phases. A network id is present only after one has been selected. */
export type WorkbenchState =
  | { status: "idle" }
  | { status: "loading"; network: "testnet" | "futurenet" | "mainnet" }
  | { status: "ready"; network: "testnet" | "futurenet" | "mainnet" }
  | { status: "unavailable"; network: "testnet" | "futurenet" | "mainnet"; message: string }
  | { status: "invalid"; message: string };
