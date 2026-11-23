"use client";

export function ProjectSelector({
  projects,
  onSelect,
  busy,
}: {
  projects: { id: string; label: string }[];
  onSelect: (projectId: string) => void;
  busy: boolean;
}) {
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const projectId = String(data.get("projectId") ?? "");
        if (projectId) onSelect(projectId);
      }}
    >
      <label className="flex flex-col gap-1 text-sm" htmlFor="privileged-project">
        Project
        <select id="privileged-project" name="projectId" className="rounded border px-2 py-1" defaultValue={projects[0]?.id ?? ""}>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="rounded border px-3 py-1 text-sm" disabled={busy}>
        {busy ? "Reading keys…" : "Show keys"}
      </button>
    </form>
  );
}
