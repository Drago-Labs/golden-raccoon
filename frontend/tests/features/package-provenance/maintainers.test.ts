import { describe, expect, it } from "vitest";
import { detectNewLifecycleScripts } from "@/server/research/package-provenance/installScripts";
import { diffMaintainers } from "@/server/research/package-provenance/maintainerDiff";
import { unifiedRelease } from "./fixtures";

describe("diffMaintainers", () => {
  it("attributes an added maintainer to the release where it first appears", () => {
    const releases = [
      unifiedRelease({ version: "1.0.0", maintainers: ["alice"] }),
      unifiedRelease({ version: "1.1.0", maintainers: ["alice"] }),
      unifiedRelease({ version: "1.2.0", maintainers: ["alice", "mallory"] }),
    ];

    const changes = diffMaintainers(releases);

    expect(changes).toEqual([{ fromVersion: "1.1.0", toVersion: "1.2.0", added: ["mallory"], removed: [] }]);
  });

  it("reports a removal separately from an addition", () => {
    const releases = [unifiedRelease({ version: "1.0.0", maintainers: ["alice", "bob"] }), unifiedRelease({ version: "1.1.0", maintainers: ["alice", "carol"] })];

    const changes = diffMaintainers(releases);

    expect(changes).toEqual([{ fromVersion: "1.0.0", toVersion: "1.1.0", added: ["carol"], removed: ["bob"] }]);
  });

  it("makes no claim across a pair where either side lacks a maintainer snapshot", () => {
    const releases = [unifiedRelease({ version: "0.1.0", maintainers: null }), unifiedRelease({ version: "0.2.0", maintainers: ["alice"] })];

    expect(diffMaintainers(releases)).toEqual([]);
  });

  it("reports no changes when the maintainer set is stable", () => {
    const releases = [unifiedRelease({ version: "1.0.0", maintainers: ["alice"] }), unifiedRelease({ version: "1.1.0", maintainers: ["alice"] })];

    expect(diffMaintainers(releases)).toEqual([]);
  });
});

describe("detectNewLifecycleScripts", () => {
  it("flags a postinstall script that appears for the first time", () => {
    const releases = [
      unifiedRelease({ version: "1.0.0", lifecycleScripts: [] }),
      unifiedRelease({ version: "1.1.0", lifecycleScripts: ["postinstall"] }),
    ];

    const changes = detectNewLifecycleScripts(releases);

    expect(changes).toEqual([{ version: "1.1.0", newScripts: ["postinstall"] }]);
  });

  it("does not flag a script already present in the first inspected release", () => {
    const releases = [unifiedRelease({ version: "1.0.0", lifecycleScripts: ["postinstall"] }), unifiedRelease({ version: "1.1.0", lifecycleScripts: ["postinstall"] })];

    expect(detectNewLifecycleScripts(releases)).toEqual([]);
  });

  it("makes no claim across a registry that does not expose lifecycle scripts", () => {
    const releases = [unifiedRelease({ version: "0.1.0", lifecycleScripts: null }), unifiedRelease({ version: "0.2.0", lifecycleScripts: null })];

    expect(detectNewLifecycleScripts(releases)).toEqual([]);
  });
});
