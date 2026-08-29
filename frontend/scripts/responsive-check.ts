import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Static responsive guardrails for CI (issue #148).
 *
 * Dependency-free and deliberately narrow, in the same spirit as
 * `a11y-check.ts`: it does not replace a manual walkthrough at the documented
 * widths, it catches the two regressions that keep coming back.
 *
 *   1. Horizontal overflow — a fixed width wider than the smallest supported
 *      viewport, or a wide table that is not inside its own scroll region.
 *   2. Undersized touch targets — an interactive control pinned below the
 *      minimum size, which the global rule cannot override.
 *
 * The check is proven against a deliberately broken fixture, because a check
 * that only ever passes tells you nothing.
 */

/** The smallest viewport the app supports, documented in docs/A11Y_AUDIT.md. */
const MIN_VIEWPORT_WIDTH = 320;
const TOUCH_TARGET_MIN_PX = 44;

const SOURCE_ROOT = fileURLToPath(new URL("../src", import.meta.url));
const FIXTURE = fileURLToPath(
  new URL("../src/components/layout/__fixtures__/overflowing.tsx", import.meta.url),
);

export interface Finding {
  file: string;
  line: number;
  rule: "fixed-width-overflow" | "unscrollable-wide-table" | "undersized-touch-target";
  detail: string;
}

function sourceFiles(root: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(root)) {
    const full = path.join(root, entry);
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (full.endsWith(".tsx")) {
      found.push(full);
    }
  }

  return found;
}

/** Tailwind arbitrary pixel widths, e.g. `w-[1200px]` or `min-w-[1400px]`. */
const FIXED_WIDTH = /\b(?:min-)?w-\[(\d+)px\]/g;
/** Tailwind size utilities on the 4px scale, e.g. `h-4` is 16px. */
const SIZE_UTILITY = /\b(?:h|w|size)-(\d+)\b/g;

const INTERACTIVE = /<(button|a|summary)\b|role="button"/;

/**
 * Whether a wide element sits inside a scroll region.
 *
 * A crude proximity test on purpose: the alternative is parsing JSX, and the
 * failure mode of being crude here is a false positive that a developer fixes
 * by using `DataTable`, which is the intended outcome anyway.
 */
function hasScrollContainerNearby(lines: string[], index: number): boolean {
  const from = Math.max(0, index - 6);
  const window = lines.slice(from, index + 1).join(" ");
  return window.includes("overflow-x-auto") || window.includes("overflow-auto") || window.includes("<DataTable");
}

export function inspectSource(relativePath: string, source: string): Finding[] {
  const findings: Finding[] = [];
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    for (const match of line.matchAll(FIXED_WIDTH)) {
      const width = Number(match[1]);
      if (width <= MIN_VIEWPORT_WIDTH) continue;

      const isMinWidth = match[0].startsWith("min-w-");

      // A wide `min-w-` is fine inside a scroll region: that is exactly how a
      // data table is supposed to behave.
      if (isMinWidth && hasScrollContainerNearby(lines, index)) continue;

      findings.push({
        file: relativePath,
        line: index + 1,
        rule: isMinWidth ? "unscrollable-wide-table" : "fixed-width-overflow",
        detail: isMinWidth
          ? `${match[0]} is wider than the ${MIN_VIEWPORT_WIDTH}px minimum viewport and is not inside a scroll region. Wrap it in <DataTable>, which scrolls internally instead of moving the page.`
          : `${match[0]} pins an element wider than the ${MIN_VIEWPORT_WIDTH}px minimum viewport. Use a max-width or a responsive utility so it can shrink.`,
      });
    }

    if (!INTERACTIVE.test(line)) return;

    for (const match of line.matchAll(SIZE_UTILITY)) {
      const px = Number(match[1]) * 4;
      if (px === 0 || px >= TOUCH_TARGET_MIN_PX) continue;
      // An icon sized inside a control is not the control's own size.
      if (line.includes("aria-hidden")) continue;

      findings.push({
        file: relativePath,
        line: index + 1,
        rule: "undersized-touch-target",
        detail: `${match[0]} is ${px}px on an interactive control, below the ${TOUCH_TARGET_MIN_PX}px minimum. Add the "touch-target" class, or size the control with padding instead.`,
      });
    }
  });

  return findings;
}

function main() {
  // The check must reject a layout that is genuinely broken.
  const fixtureFindings = inspectSource(
    "src/components/layout/__fixtures__/overflowing.tsx",
    readFileSync(FIXTURE, "utf8"),
  );

  assert.ok(
    fixtureFindings.some((finding) => finding.rule === "fixed-width-overflow"),
    "The overflowing fixture must be rejected for its fixed width; the check is not detecting overflow.",
  );
  assert.ok(
    fixtureFindings.some((finding) => finding.rule === "unscrollable-wide-table"),
    "The overflowing fixture must be rejected for its unscrollable wide table.",
  );
  assert.ok(
    fixtureFindings.some((finding) => finding.rule === "undersized-touch-target"),
    "The overflowing fixture must be rejected for its undersized control.",
  );
  console.log(`[responsive-check] ok: the fixture is rejected with ${fixtureFindings.length} findings`);

  // And it must accept the application.
  const findings = sourceFiles(SOURCE_ROOT)
    .filter((file) => !file.includes("__fixtures__"))
    .flatMap((file) => inspectSource(path.relative(path.join(SOURCE_ROOT, ".."), file), readFileSync(file, "utf8")));

  if (findings.length > 0) {
    const report = findings
      .map((finding) => `  ${finding.file}:${finding.line}  [${finding.rule}]\n    -> ${finding.detail}`)
      .join("\n");

    assert.fail(`[responsive-check] ${findings.length} finding(s):\n${report}`);
  }

  console.log(`[responsive-check] ok: no route pins content wider than ${MIN_VIEWPORT_WIDTH}px`);
  console.log(`[responsive-check] ok: no interactive control is below ${TOUCH_TARGET_MIN_PX}px`);
  console.log("Responsive layout checks passed.");
}

main();
