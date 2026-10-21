import type { DataEntryView } from "@/server/research/account-data-entries/schema";

export function DecodedValuePanel({ entry }: { entry: DataEntryView }) {
  const deleted = !entry.present;
  const deletedEvent = [...entry.history].reverse().find((event) => event.action === "delete");
  return (
    <section data-testid="decoded-value" className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/4 p-4 text-sm">
      <h2 className="text-lg font-semibold">Decoded value</h2>
      <p>Format: {entry.format ?? "none"}</p>
      {deleted ? <p>This key is deleted. The last recorded value is shown from history, not as a current entry.</p> : null}
      {entry.utf8 ? <p data-testid="decoded-text">{entry.utf8}</p> : <p>Binary value. Shown as hex, not as text.</p>}
      {entry.hex ? <p className="break-all font-mono text-xs">{entry.hex}</p> : null}
      {deleted ? <p>Last value: {deletedEvent?.lastValueUtf8 ?? deletedEvent?.lastValueBase64 ?? "not in the fetched history"}</p> : null}
    </section>
  );
}
