"use client";
export function ProjectSelector({ projects, onSelect, busy }: { projects: string[]; onSelect: (id: string) => void; busy: boolean }) {
  return (
    <form className="flex items-end gap-3" onSubmit={(event) => { event.preventDefault(); const id = String(new FormData(event.currentTarget).get("projectId") ?? ""); if (id) onSelect(id); }}>
      <label className="flex flex-col gap-1 text-sm" htmlFor="treasury-project">Project
        <select id="treasury-project" name="projectId" className="rounded border px-2 py-1">{projects.map((id) => <option key={id}>{id}</option>)}</select>
      </label>
      <button type="submit" disabled={busy} className="rounded border px-3 py-1 text-sm">{busy ? "Reading…" : "Show treasury"}</button>
    </form>
  );
}
