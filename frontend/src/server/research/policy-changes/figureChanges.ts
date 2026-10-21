import { POLICY_CHANGE_LIMITS } from "./limits";
import type { FigureChange, SnapshotDiffRow } from "./schema";

/** Matches a number, optionally with a decimal point, a percent sign, or a currency symbol. */
const FIGURE_PATTERN = /[$€£]?\d+(?:[.,]\d+)?%?/g;

function figuresIn(text: string): string[] {
  return [...text.matchAll(FIGURE_PATTERN)].map((match) => match[0]);
}

function contextAround(text: string, maxChars = 120): string {
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
}

/**
 * Highlights changed numbers and percentages within sentence-level diff
 * rows — a fee going from "2%" to "5%" is exactly the kind of change a
 * reader could otherwise skim past in a long paragraph rewrite.
 */
export function detectFigureChanges(rows: SnapshotDiffRow[]): FigureChange[] {
  const changes: FigureChange[] = [];

  for (const row of rows) {
    if (row.unit !== "sentence" || !row.changed) continue;

    const previousFigures = row.previousText ? figuresIn(row.previousText) : [];
    const currentFigures = row.currentText ? figuresIn(row.currentText) : [];

    if (previousFigures.length === 0 && currentFigures.length === 0) continue;
    if (previousFigures.join(",") === currentFigures.join(",")) continue;

    changes.push({
      context: contextAround(row.currentText ?? row.previousText ?? ""),
      previousValue: previousFigures.length > 0 ? previousFigures.join(", ") : null,
      currentValue: currentFigures.length > 0 ? currentFigures.join(", ") : null,
    });

    if (changes.length >= POLICY_CHANGE_LIMITS.maxFigureChanges) break;
  }

  return changes;
}
