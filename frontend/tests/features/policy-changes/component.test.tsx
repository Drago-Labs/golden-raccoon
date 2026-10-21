import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PolicyChangeTracker } from "@/components/research/policy-changes/PolicyChangeTracker";
import { trackPolicyChanges } from "@/server/research/policy-changes/service";
import { ORIGINAL_PAGE_HTML, createPageFetcher, request } from "./fixtures";

function installServiceFetch(options: { fail?: boolean } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.fail) {
      return { ok: false, status: 400, json: async () => ({ error: "unknown_project", message: "not in registry" }) } as unknown as Response;
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const report = await trackPolicyChanges(
      { ...request(), ...body },
      { fetchPage: createPageFetcher({ html: ORIGINAL_PAGE_HTML }) },
    );

    return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PolicyChangeTracker", () => {
  it("labels the project selector for assistive technology", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<PolicyChangeTracker />);

    expect(screen.getByRole("form", { name: /policy change tracker project selector/i })).toBeTruthy();
    expect(screen.getByLabelText("Project")).toBeTruthy();
    expect(screen.getByRole("button", { name: /check for changes/i })).toBeTruthy();
  });

  it("shows a report after submitting", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<PolicyChangeTracker />);

    fireEvent.submit(screen.getByRole("form", { name: /policy change tracker project selector/i }));

    await waitFor(() => {
      expect(screen.getByTestId("snapshot-timeline")).toBeTruthy();
    });
  });

  it("shows an alert on a failed request", async () => {
    vi.stubGlobal("fetch", installServiceFetch({ fail: true }));
    render(<PolicyChangeTracker />);

    fireEvent.submit(screen.getByRole("form", { name: /policy change tracker project selector/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });
});
