type CoverageNoticeProps = {
  notice: string;
  state: "complete" | "partial" | "unavailable";
};

export function CoverageNotice({ notice, state }: CoverageNoticeProps) {
  const colorClass =
    state === "complete"
      ? "border-green-300/25 bg-green-400/8 text-green-100"
      : state === "partial"
        ? "border-yellow-300/25 bg-yellow-400/8 text-yellow-100"
        : "border-red-300/25 bg-red-400/8 text-red-100";

  return (
    <div className={`rounded-2xl border p-4 text-sm ${colorClass}`}>
      <p>{notice}</p>
    </div>
  );
}
