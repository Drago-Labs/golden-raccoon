/**
 * Detects a lifecycle script (`preinstall`, `install`, `postinstall`) that
 * appears in a release but was not present in the one before it.
 *
 * These three scripts run arbitrary code during `npm install` with no
 * prompt — the same mechanism used in the real supply-chain campaigns this
 * tool exists to help catch. A script that was already present in every
 * inspected release is not flagged; only a *new* appearance is, since a
 * long-standing build script is a different risk profile than one added
 * partway through a package's history.
 */
import { PACKAGE_PROVENANCE_LIMITS } from "./limits";
import type { UnifiedRelease } from "./releaseHistory";
import type { InstallScriptChange } from "./schema";

/** `releasesOldestFirst` must be sorted oldest to newest. */
export function detectNewLifecycleScripts(releasesOldestFirst: UnifiedRelease[]): InstallScriptChange[] {
  const changes: InstallScriptChange[] = [];
  let previousScripts: Set<string> | null = null;

  for (const release of releasesOldestFirst) {
    if (release.lifecycleScripts === null) {
      previousScripts = null;
      continue;
    }

    const currentScripts = new Set(release.lifecycleScripts);
    if (previousScripts) {
      const newScripts = release.lifecycleScripts.filter((script) => !previousScripts!.has(script));
      if (newScripts.length > 0) {
        changes.push({ version: release.version, newScripts });
      }
    }

    previousScripts = currentScripts;
  }

  return changes.slice(-PACKAGE_PROVENANCE_LIMITS.maxInstallScriptChanges);
}
