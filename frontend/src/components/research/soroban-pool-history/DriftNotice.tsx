type DriftNoticeProps = {
  notice: string | null;
  matched: boolean | null;
};

export function DriftNotice({ notice, matched }: DriftNoticeProps) {
  if (!notice) return null;

  const colorClass =
    matched === true
      ? "border-green-300/25 bg-green-400/8 text-green-100"
      : matched === false
        ? "border-yellow-300/25 bg-yellow-400/8 text-yellow-100"
        : "border-white/10 bg-white/4 text-muted";

  return (
    <div data-testid="drift-notice" className={`rounded-2xl border p-4 text-sm ${colorClass}`}>
      <p>{notice}</p>
    </div>
  );
}
