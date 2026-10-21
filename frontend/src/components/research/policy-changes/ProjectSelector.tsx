"use client";

import { FormEvent, useState } from "react";
import type { PolicyProject } from "@/server/research/policy-changes/projectRegistry";

export function ProjectSelector(props: {
  projects: PolicyProject[];
  defaultProjectId?: string;
  busy?: boolean;
  onSubmit: (projectId: string) => void;
}) {
  const [projectId, setProjectId] = useState(props.defaultProjectId ?? props.projects[0]?.id ?? "");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (projectId) props.onSubmit(projectId);
  }

  return (
    <form
      aria-label="Policy change tracker project selector"
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5"
      onSubmit={handleSubmit}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted">Project</span>
        <select
          name="projectId"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
          required
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#d9a441]/60"
        >
          {props.projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={props.busy}
        className="self-start rounded-xl border border-[#d9a441]/40 bg-[#d9a441]/10 px-4 py-2 text-sm font-semibold text-[#f2c86d] outline-none transition hover:bg-[#d9a441]/15 focus-visible:ring-2 focus-visible:ring-[#d9a441]/60 disabled:opacity-50"
      >
        {props.busy ? "Checking…" : "Check for changes"}
      </button>
    </form>
  );
}
