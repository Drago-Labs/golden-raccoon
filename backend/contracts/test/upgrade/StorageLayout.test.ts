import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";
import layoutSnapshot from "../../snapshots/storage-layout.json";

interface StorageItem {
  label: string;
  offset: number;
  slot: string;
  type: string;
}

interface ContractLayout {
  source: string;
  storage: StorageItem[];
}

interface RawTypeEntry {
  label: string;
}

interface RawStorageLayout {
  storage: Array<{
    label: string;
    offset: number;
    slot: string;
    type: string;
  }>;
  types: Record<string, RawTypeEntry>;
}

function getLatestCompilerStorageLayout(contractName: string): ContractLayout {
  const buildInfoDir = path.join(__dirname, "../../artifacts/build-info");
  const files = fs.readdirSync(buildInfoDir);

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(path.join(buildInfoDir, file), "utf8"));
    const output = data.output;
    if (output && output.contracts) {
      for (const [sourcePath, contracts] of Object.entries<Record<string, { storageLayout: RawStorageLayout }>>(output.contracts)) {
        if (contracts[contractName]?.storageLayout) {
          const raw = contracts[contractName].storageLayout;
          return {
            source: sourcePath,
            storage: raw.storage.map((s) => ({
              label: s.label,
              offset: s.offset,
              slot: s.slot,
              type: raw.types[s.type]?.label || s.type,
            })),
          };
        }
      }
    }
  }

  throw new Error(`Could not find storage layout for ${contractName} in compiler output`);
}

function assertLayoutCompatibility(base: StorageItem[], upgraded: StorageItem[]): void {
  if (upgraded.length < base.length) {
    throw new Error(
      `Storage layout truncated: upgraded has ${upgraded.length} slots, base has ${base.length}`
    );
  }

  for (let i = 0; i < base.length; i++) {
    const baseItem = base[i];
    const upgradedItem = upgraded[i];

    if (baseItem.slot !== upgradedItem.slot) {
      throw new Error(
        `Slot mismatch at index ${i}: expected slot ${baseItem.slot} (${baseItem.label}), got ${upgradedItem.slot} (${upgradedItem.label})`
      );
    }

    if (baseItem.offset !== upgradedItem.offset) {
      throw new Error(
        `Offset mismatch for variable ${baseItem.label}: expected offset ${baseItem.offset}, got ${upgradedItem.offset}`
      );
    }

    if (baseItem.label !== upgradedItem.label) {
      throw new Error(
        `Variable reordering detected at slot ${baseItem.slot}: base=${baseItem.label}, upgraded=${upgradedItem.label}`
      );
    }

    if (baseItem.type !== upgradedItem.type) {
      throw new Error(
        `Type mutation detected for variable ${baseItem.label}: base=${baseItem.type}, upgraded=${upgradedItem.type}`
      );
    }
  }
}

describe("Storage Layout Regression Gates", () => {
  it("compiler output matches storage layout snapshot for GoldRaccoonPolicy", () => {
    const compiled = getLatestCompilerStorageLayout("GoldRaccoonPolicy");
    const snapshot = layoutSnapshot.GoldRaccoonPolicy;

    expect(compiled.storage.length).to.equal(snapshot.storage.length);
    for (let i = 0; i < snapshot.storage.length; i++) {
      expect(compiled.storage[i].label).to.equal(snapshot.storage[i].label);
      expect(compiled.storage[i].slot).to.equal(snapshot.storage[i].slot);
      expect(compiled.storage[i].offset).to.equal(snapshot.storage[i].offset);
      expect(compiled.storage[i].type).to.equal(snapshot.storage[i].type);
    }
  });

  it("compiler output matches storage layout snapshot for GoldRaccoonPolicyV2", () => {
    const compiled = getLatestCompilerStorageLayout("GoldRaccoonPolicyV2");
    const snapshot = layoutSnapshot.GoldRaccoonPolicyV2;

    expect(compiled.storage.length).to.equal(snapshot.storage.length);
    for (let i = 0; i < snapshot.storage.length; i++) {
      expect(compiled.storage[i].label).to.equal(snapshot.storage[i].label);
      expect(compiled.storage[i].slot).to.equal(snapshot.storage[i].slot);
      expect(compiled.storage[i].offset).to.equal(snapshot.storage[i].offset);
      expect(compiled.storage[i].type).to.equal(snapshot.storage[i].type);
    }
  });

  it("GoldRaccoonPolicyV2 preserves every slot of GoldRaccoonPolicy at exact byte offsets", () => {
    const policy = getLatestCompilerStorageLayout("GoldRaccoonPolicy");
    const policyV2 = getLatestCompilerStorageLayout("GoldRaccoonPolicyV2");

    expect(policy.storage.length).to.equal(17);
    expect(policyV2.storage.length).to.equal(18);

    expect(() => assertLayoutCompatibility(policy.storage, policyV2.storage)).to.not.throw();

    const appended = policyV2.storage[17];
    expect(appended.label).to.equal("timelock");
    expect(appended.slot).to.equal("17");
    expect(appended.offset).to.equal(0);
    expect(appended.type).to.equal("address");
  });

  it("deliberate fault: reordering state variables triggers upgrade regression failure", () => {
    const policy = getLatestCompilerStorageLayout("GoldRaccoonPolicy");

    const corruptedV2Storage = policy.storage.map((s) => ({ ...s }));
    const temp = corruptedV2Storage[0];
    corruptedV2Storage[0] = { ...corruptedV2Storage[1], slot: "0" };
    corruptedV2Storage[1] = { ...temp, slot: "1" };

    expect(() => assertLayoutCompatibility(policy.storage, corruptedV2Storage)).to.throw(
      /Variable reordering detected at slot 0/
    );
  });

  it("deliberate fault: shifting offset triggers offset mutation failure", () => {
    const policy = getLatestCompilerStorageLayout("GoldRaccoonPolicy");

    const corruptedV2Storage = policy.storage.map((s) => ({ ...s }));
    corruptedV2Storage[15] = { ...corruptedV2Storage[15], offset: 1 };

    expect(() => assertLayoutCompatibility(policy.storage, corruptedV2Storage)).to.throw(
      /Offset mismatch for variable paused/
    );
  });
});
