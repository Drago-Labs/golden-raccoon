/**
 * Request schema and the report shapes returned to the page.
 */

import { z } from "zod";
import type { SettingsReadState } from "./errors";
import { NETWORK_IDS, type NetworkId } from "./networkIdentity";

export const networkSettingsRequestSchema = z
  .object({
    network: z.enum(NETWORK_IDS),
    page: z.number().int().positive().optional(),
    compare: z
      .object({
        beforeLedger: z.number().int().positive(),
        afterLedger: z.number().int().positive(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.compare && value.compare.beforeLedger === value.compare.afterLedger) {
      context.addIssue({
        code: "custom",
        path: ["compare"],
        message: "Choose two different ledgers.",
      });
    }
  });

export type NetworkSettingsRequest = z.infer<typeof networkSettingsRequestSchema>;

export type DecodedSetting = {
  key: string;
  settingId: number;
  name: string;
  value: string;
  unit: string;
  known: boolean;
};

export type SettingSnapshot = {
  network: NetworkId;
  ledger: number;
  protocolVersion: number;
  settings: DecodedSetting[];
};

export type UpgradeView = {
  network: NetworkId;
  ledger: number;
  protocolVersion: number;
  upgradeType: string | null;
  upgradeValue: string | null;
  settings: DecodedSetting[];
};

export type SettingChange = {
  key: string;
  name: string;
  unit: string;
  before: string | null;
  after: string | null;
  direction: "increase" | "decrease" | "changed";
};

export type CoverageReport = {
  state: SettingsReadState;
  requested: number;
  returned: number;
  unknown: number;
  historyKept: number;
  historyTruncated: boolean;
  message: string;
};

export type NetworkSettingsReport = {
  state: SettingsReadState;
  network: NetworkId;
  ledger: number | null;
  protocolVersion: number | null;
  settings: DecodedSetting[];
  settingCount: number;
  page: number;
  history: UpgradeView[];
  diff: SettingChange[] | null;
  coverage: CoverageReport;
  warnings: string[];
};
