import { describe, expect, it } from "vitest";
import { decodeConfigSettingXdr } from "@/server/research/network-settings/settingsDecoder";
import {
  catalogueField,
  describeSetting,
  listCatalogueFields,
  SETTING_GROUPS,
} from "@/server/research/network-settings/settingCatalogue";
import { entryXdr, unknownSetting } from "./fixtures";

describe("setting catalogue", () => {
  it("names every shipped config setting group and gives it a unit", () => {
    for (let id = 0; id <= 20; id += 1) {
      const group = SETTING_GROUPS[id];

      expect(group?.name.length).toBeGreaterThan(0);
      expect(group?.unit.length).toBeGreaterThan(0);
      expect(group?.meaning.length).toBeGreaterThan(0);
    }
  });

  it("gives every catalogue field a unit and a meaning", () => {
    const fields = listCatalogueFields();

    expect(fields.length).toBeGreaterThan(20);

    for (const key of fields) {
      const row = catalogueField(key);

      expect(row?.unit).toBeTruthy();
      expect(row?.unit).not.toBe("unspecified");
      expect(row?.meaning.length).toBeGreaterThan(0);
      expect(describeSetting(key, 0, true)).toEqual(row);
    }
  });

  it("labels cpu and memory cost terms without dropping an unlisted cost type", () => {
    expect(describeSetting("contractCostParamsCpuInsns.wasmInsnExec.constTerm", 6, true).unit).toBe("instructions");
    expect(describeSetting("contractCostParamsMemBytes.memAlloc.linearTerm", 7, true).unit).toBe("bytes per input");
    expect(describeSetting("contractCostParamsCpuInsns.costType.200.constTerm", 6, true).unit).toBe("instructions");
  });

  it("does not catalogue an unknown setting id as a known group", () => {
    expect(SETTING_GROUPS[unknownSetting.settingId]).toBeUndefined();

    const decoded = decodeConfigSettingXdr(unknownSetting.xdr);
    const described = describeSetting(decoded[0].key, decoded[0].settingId, false);

    expect(described.unit).toBe("raw");
    expect(described.name).toBe("Config setting 250");
  });

  it("assigns units to the recorded testnet compute fields", () => {
    const decoded = decodeConfigSettingXdr(entryXdr("compute"));

    expect(decoded.map((row) => catalogueField(row.key)?.unit)).toEqual([
      "stroops",
      "instructions",
      "instructions",
      "bytes",
    ]);
  });
});
