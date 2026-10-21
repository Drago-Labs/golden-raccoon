import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackageProvenance } from "@/components/research/package-provenance/PackageProvenance";
import { inspectPackageProvenance } from "@/server/research/package-provenance/service";
import { noopDeps } from "./fixtures";

function installServiceFetch(options: { fail?: boolean } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.fail) {
      return { ok: false, status: 400, json: async () => ({ error: "invalid_package_name", message: "invalid name" }) } as unknown as Response;
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const deps = {
      ...noopDeps(),
      fetchNpmPackage: async () => ({
        outcome: "ok" as const,
        packageMeta: {
          name: body.packageName as string,
          repository: "git+https://github.com/stellar/example-sdk.git",
          versions: [{ version: "1.0.0", publishedAt: "2026-01-01T00:00:00.000Z", maintainers: ["alice"], scripts: [], hasAttestations: false }],
        },
      }),
    };
    const report = await inspectPackageProvenance(body, deps);

    return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PackageProvenance", () => {
  it("labels the package input for assistive technology", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<PackageProvenance />);

    expect(screen.getByRole("form", { name: /package provenance inspector package input/i })).toBeTruthy();
    expect(screen.getByLabelText("Registry")).toBeTruthy();
    expect(screen.getByLabelText("Package name")).toBeTruthy();
    expect(screen.getByRole("button", { name: /inspect package/i })).toBeTruthy();
  });

  it("shows a report after submitting a package name", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<PackageProvenance />);

    fireEvent.change(screen.getByLabelText("Package name"), { target: { value: "@stellar/example-sdk" } });
    fireEvent.submit(screen.getByRole("form", { name: /package provenance inspector package input/i }));

    await waitFor(() => {
      expect(screen.getByTestId("release-timeline")).toBeTruthy();
      expect(screen.getByTestId("provenance-panel")).toBeTruthy();
    });
  });

  it("shows an alert on a failed request", async () => {
    vi.stubGlobal("fetch", installServiceFetch({ fail: true }));
    render(<PackageProvenance />);

    fireEvent.change(screen.getByLabelText("Package name"), { target: { value: "not valid" } });
    fireEvent.submit(screen.getByRole("form", { name: /package provenance inspector package input/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });
});
