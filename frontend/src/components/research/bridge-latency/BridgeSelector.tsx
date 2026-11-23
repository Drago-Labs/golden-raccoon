"use client";
export function BridgeSelector({ bridges, onSelect, busy }: { bridges: string[]; onSelect: (bridge: string) => void; busy: boolean }) {
  return (
    <form className="flex items-end gap-3" onSubmit={(event) => { event.preventDefault(); const bridge = String(new FormData(event.currentTarget).get("bridge") ?? ""); if (bridge) onSelect(bridge); }}>
      <label className="flex flex-col gap-1 text-sm" htmlFor="bridge-id">Bridge
        <select id="bridge-id" name="bridge" className="rounded border px-2 py-1">{bridges.map((bridge) => <option key={bridge}>{bridge}</option>)}</select>
      </label>
      <button type="submit" disabled={busy} className="rounded border px-3 py-1 text-sm">{busy ? "Reading…" : "Show latency"}</button>
    </form>
  );
}
