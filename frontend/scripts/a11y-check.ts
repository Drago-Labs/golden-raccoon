import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Static, dependency-free accessibility guardrails for CI.
 *
 * This intentionally does not replace manual audits (screen reader smoke
 * tests, keyboard walkthroughs, 200% zoom, reduced-motion review) documented
 * in docs/A11Y_AUDIT.md. It only catches regressions in the concrete
 * WCAG 2.2 AA fixes made for issue #42, with actionable failure messages.
 */

function repoPath(relative: string) {
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
}

function readRepoFile(relative: string) {
  const path = repoPath(relative);
  assert.ok(existsSync(path), `Expected file to exist: frontend/${relative}`);
  return readFileSync(path, "utf8");
}

function check(label: string, condition: boolean, guidance: string) {
  assert.ok(condition, `[a11y-check] FAILED: ${label}\n  -> ${guidance}`);
  console.log(`[a11y-check] ok: ${label}`);
}

function main() {
  const appShell = readRepoFile("src/components/AppShell.tsx");
  check(
    "AppShell has a skip link to #main-content",
    /href="#main-content"/.test(appShell),
    'Add `<a href="#main-content" className="skip-link">Skip to main content</a>` as the first focusable element in AppShell.',
  );
  check(
    "AppShell main landmark has id=\"main-content\" and is focusable",
    /id="main-content"/.test(appShell) && /tabIndex=\{-1\}/.test(appShell),
    'Add `id="main-content" tabIndex={-1}` to the <main> element so the skip link target receives focus.',
  );
  check(
    "AppShell nav landmarks have an accessible name",
    /aria-label="Primary"/.test(appShell),
    'Add `aria-label="Primary"` to both the desktop and mobile <nav> elements in AppShell.',
  );

  const globalsCss = readRepoFile("src/app/globals.css");
  check(
    "globals.css defines :focus-visible styles",
    /:focus-visible\s*\{/.test(globalsCss),
    "Add a `:focus-visible { outline: ... }` rule using the brand gold (#d9a441) so keyboard focus is always visible.",
  );
  check(
    "globals.css respects prefers-reduced-motion",
    /@media \(prefers-reduced-motion:\s*reduce\)/.test(globalsCss),
    "Add an `@media (prefers-reduced-motion: reduce)` block that disables/shortens animations and transitions.",
  );
  check(
    "globals.css defines skip-link styles",
    /\.skip-link/.test(globalsCss),
    "Add `.skip-link` styles that visually hide the skip link until it receives keyboard focus.",
  );

  const riskScoreCard = readRepoFile("src/components/RiskScoreCard.tsx");
  check(
    "RiskScoreCard shows risk level as visible text, not color alone",
    /Risk level:/.test(riskScoreCard),
    'Render a visible text label such as `Risk level: {level}` next to (not instead of) the color-coded badge.',
  );
  check(
    "RiskScoreCard aria-label communicates score and level",
    /Portfolio risk score \$\{boundedScore\} out of 100, \$\{level\} risk/.test(riskScoreCard),
    'Set the gauge aria-label to `Portfolio risk score ${boundedScore} out of 100, ${level} risk`.',
  );
  check(
    "RiskScoreCard breakdown panel is an accessible dialog/complementary region",
    /role="dialog"/.test(riskScoreCard) && /aria-labelledby=\{headingId\}/.test(riskScoreCard),
    'Give the breakdown panel `role="dialog"` (or `role="complementary"`) plus `aria-labelledby` pointing at its heading id.',
  );
  check(
    "RiskScoreCard breakdown meters expose a text equivalent",
    /role="meter"/.test(riskScoreCard) && /aria-valuenow=\{category\.score\}/.test(riskScoreCard),
    'Add `role="meter"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax` to each category bar.',
  );

  const liveRegionPath = "src/components/a11y/LiveRegion.tsx";
  const visuallyHiddenPath = "src/components/a11y/VisuallyHidden.tsx";
  check(
    "Shared LiveRegion helper exists",
    existsSync(repoPath(liveRegionPath)),
    `Create ${liveRegionPath} exporting a polite/assertive aria-live region component.`,
  );
  check(
    "Shared VisuallyHidden helper exists",
    existsSync(repoPath(visuallyHiddenPath)),
    `Create ${visuallyHiddenPath} exporting a screen-reader-only content component.`,
  );

  if (existsSync(repoPath(liveRegionPath))) {
    const liveRegion = readRepoFile(liveRegionPath);
    check(
      "LiveRegion supports both polite and assertive politeness",
      /"polite"/.test(liveRegion) && /"assertive"/.test(liveRegion),
      'LiveRegion must support `politeness: "polite" | "assertive"`.',
    );
  }

  const wiredLiveRegionFiles = [
    "src/components/TokenScanClient.tsx",
    "src/components/DashboardClient.tsx",
    "src/components/AlertRuleForm.tsx",
  ];
  const wiredSomewhere = wiredLiveRegionFiles.some((file) => existsSync(repoPath(file)) && /LiveRegion/.test(readRepoFile(file)));
  check(
    "LiveRegion is wired into at least one status-driven client component",
    wiredSomewhere,
    `Import and render <LiveRegion /> from one of: ${wiredLiveRegionFiles.join(", ")} to announce loading/error status changes.`,
  );

  const formFilesWithValidationA11y = ["src/components/AlertRuleForm.tsx", "src/components/RuleForm.tsx", "src/components/TokenScanClient.tsx"];
  const hasFormA11y = formFilesWithValidationA11y.some((file) => {
    if (!existsSync(repoPath(file))) return false;
    const content = readRepoFile(file);
    return /aria-describedby/.test(content) && /aria-invalid/.test(content);
  });
  check(
    "At least one form associates errors via aria-describedby and aria-invalid",
    hasFormA11y,
    `Add \`aria-invalid\` and \`aria-describedby\` (pointing at the error message id) to a required field in one of: ${formFilesWithValidationA11y.join(", ")}.`,
  );

  const auditDocAbsolute = fileURLToPath(new URL("../../docs/A11Y_AUDIT.md", import.meta.url));
  assert.ok(existsSync(auditDocAbsolute), "[a11y-check] FAILED: docs/A11Y_AUDIT.md must exist.\n  -> Create docs/A11Y_AUDIT.md documenting the accessibility audit.");
  const auditDoc = readFileSync(auditDocAbsolute, "utf8");
  const requiredHeadings = [
    "## Scope",
    "## Findings",
    "## Manual audit checklist",
    "## Before / after",
    "## Remaining manual steps",
  ];
  for (const heading of requiredHeadings) {
    check(
      `docs/A11Y_AUDIT.md has heading "${heading}"`,
      auditDoc.includes(heading),
      `Add a "${heading}" section to docs/A11Y_AUDIT.md.`,
    );
  }

  console.log("\na11y static checks passed.");
}

main();
