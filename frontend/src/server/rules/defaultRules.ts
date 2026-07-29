import type { UserRule } from "../types";
import { buildProfileFromPreset } from "./strategyProfile";

/**
 * The profile a wallet starts on before it has saved anything.
 *
 * Balanced is the seed because it is the middle preset: it does not impose the
 * strictest stance on a user who has expressed no preference, and it does not
 * imply a risk appetite they never chose.
 */
export function getDefaultRules(walletAddress = "0xDemoWallet"): UserRule {
  return buildProfileFromPreset(walletAddress, "balanced");
}
