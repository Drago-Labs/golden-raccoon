type StalenessStampProps = {
  capturedAt?: string;
  label?: string;
};

function formatAge(capturedAt?: string) {
  if (!capturedAt) return "unknown age";
  const captured = new Date(capturedAt).getTime();
  if (!Number.isFinite(captured)) return "unknown age";
  const minutes = Math.max(0, Math.floor((Date.now() - captured) / 60_000));
  if (minutes < 1) return "captured just now";
  if (minutes < 60) return `${minutes} min stale`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr stale`;
  return `${Math.floor(hours / 24)} days stale`;
}

export function StalenessStamp({ capturedAt, label = "Stale read-only data" }: StalenessStampProps) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
      <span>{label}</span>
      <span className="text-amber-100/70">
        {capturedAt ? new Date(capturedAt).toLocaleString() : "No capture time"} - {formatAge(capturedAt)}
      </span>
    </span>
  );
}
