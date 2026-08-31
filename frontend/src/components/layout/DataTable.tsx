import type { ReactNode } from "react";

/**
 * A data-dense table that never scrolls the page (issue #148).
 *
 * Data tables are the primary read path and the surface that degrades worst on
 * a phone. The rule here is narrow: wide content is allowed, but it scrolls
 * **inside its own container**, so the page body itself never moves sideways.
 *
 * The scroll region is focusable and labelled, because a region a mouse can
 * drag but a keyboard cannot reach is not usable — that is WCAG 2.1.1, and it
 * is the part hand-rolled `overflow-x-auto` wrappers consistently miss.
 */
export function DataTable({
  children,
  caption,
  /** Width below which the table starts scrolling instead of squeezing. */
  minWidth = 680,
  className = "",
}: {
  children: ReactNode;
  caption: string;
  minWidth?: number;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={`w-full max-w-full overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9a441] ${className}`}
    >
      <table className="w-full text-left text-sm" style={{ minWidth: `${minWidth}px` }}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

/**
 * A label/value pair list, for when a table is the wrong shape on a phone.
 *
 * Some tables do not degrade into a scroll region usefully — a two-column
 * summary reads better stacked than scrolled. This gives those a presentation
 * that needs no horizontal movement at all.
 */
export function DataList({
  items,
  className = "",
}: {
  items: Array<{ label: string; value: ReactNode }>;
  className?: string;
}) {
  return (
    <dl className={`min-w-0 divide-y divide-white/10 ${className}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className="grid gap-1 py-2 sm:grid-cols-[minmax(0,12rem)_1fr] sm:gap-4"
        >
          <dt className="text-xs text-white/50">{item.label}</dt>
          <dd className="min-w-0 break-words text-sm text-white/85">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default DataTable;
