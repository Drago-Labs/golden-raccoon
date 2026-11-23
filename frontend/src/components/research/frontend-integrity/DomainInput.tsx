"use client";
export function DomainInput({ onInspect, busy }: { onInspect: (domain: string) => void; busy: boolean }) {
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      const domain = String(new FormData(event.currentTarget).get("domain") ?? "");
      if (domain) onInspect(domain);
    }}>
      <label className="flex flex-col gap-1 text-sm" htmlFor="integrity-domain">Domain
        <input id="integrity-domain" name="domain" className="rounded border px-2 py-1" placeholder="app.example" />
      </label>
      <button type="submit" className="rounded border px-3 py-1 text-sm" disabled={busy}>{busy ? "Reading…" : "Snapshot"}</button>
    </form>
  );
}
