type CoverageNoticeProps = {
  notice: string;
  items: string[];
  state: "complete" | "partial" | "unavailable";
};

export function CoverageNotice({ notice, items, state }: CoverageNoticeProps) {
  const colorClass =
    state === "complete"
      ? "border-green-300/25 bg-green-400/8 text-green-100"
      : state === "partial"
        ? "border-yellow-300/25 bg-yellow-400/8 text-yellow-100"
        : "border-red-300/25 bg-red-400/8 text-red-100";

  return (
    <aside aria-label="Coverage notice" className={`rounded-2xl border p-4 text-sm ${colorClass}`}>
      <p className="font-medium">{notice}</p>
      <ul className="mt-2 list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </aside>
  );
}
