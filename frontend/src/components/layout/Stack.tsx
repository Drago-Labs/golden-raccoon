import type { ReactNode } from "react";

/**
 * Layout primitives that reflow (issue #148).
 *
 * Replaces per-component grid templates such as `grid-cols-3`, which hold three
 * columns at every width and are the other half of the horizontal-overflow
 * problem. `Columns` starts at one column and widens at breakpoints, so a phone
 * gets a readable stack without each component deciding that for itself.
 */

const GAPS = {
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
} as const;

export type StackGap = keyof typeof GAPS;

export function Stack({
  children,
  gap = "md",
  className = "",
}: {
  children: ReactNode;
  gap?: StackGap;
  className?: string;
}) {
  return <div className={`flex min-w-0 flex-col ${GAPS[gap]} ${className}`}>{children}</div>;
}

/** A horizontal row that wraps rather than overflowing. */
export function Row({
  children,
  gap = "md",
  className = "",
}: {
  children: ReactNode;
  gap?: StackGap;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center ${GAPS[gap]} ${className}`}>{children}</div>
  );
}

const COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

export type ColumnCount = keyof typeof COLUMNS;

/** A grid that is one column on a phone and widens from there. */
export function Columns({
  children,
  count = 3,
  gap = "md",
  className = "",
}: {
  children: ReactNode;
  count?: ColumnCount;
  gap?: StackGap;
  className?: string;
}) {
  return (
    <div className={`grid min-w-0 grid-cols-1 ${COLUMNS[count]} ${GAPS[gap]} ${className}`}>
      {children}
    </div>
  );
}

export default Stack;
