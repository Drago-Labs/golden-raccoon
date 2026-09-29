import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MetadataIntegrityWorkspace } from "@/components/research/metadata-integrity/MetadataIntegrityWorkspace";
import { inspectMetadataIntegrity } from "@/server/research/metadata-integrity/service";
import {
  ISSUER_A,
  MATCHING_TOML,
  createIssuerReader,
  createTomlFetcher,
  priorObservation,
  request,
} from "./fixtures";

function installServiceFetch(options: { delayMs?: number; fail?: boolean } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    if (options.fail) {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "The metadata integrity request could not be read." }),
      } as unknown as Response;
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    const report = await inspectMetadataIntegrity(
      {
        ...request(),
        ...body,
        priorObservations: body.priorObservations ?? [],
      },
      {
        readIssuer: createIssuerReader(),
        fetchToml: createTomlFetcher({ body: MATCHING_TOML }),
      },
    );

    return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
  });
}

function submitForm() {
  fireEvent.submit(screen.getByRole("form", { name: /metadata integrity lookup/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MetadataIntegrityWorkspace", () => {
  it("starts idle with ownership and fraud caveats", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<MetadataIntegrityWorkspace />);

    expect(screen.getByTestId("metadata-idle").textContent).toMatch(/not proof of domain ownership/i);
    expect(screen.getByTestId("metadata-idle").textContent).toMatch(/never labelled fraud/i);
  });

  it("labels form controls for assistive technology", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<MetadataIntegrityWorkspace />);

    expect(screen.getByLabelText("Asset code")).toBeTruthy();
    expect(screen.getByLabelText("Issuer account")).toBeTruthy();
    expect(screen.getByLabelText("Network")).toBeTruthy();
    expect(screen.getByRole("button", { name: /inspect metadata/i })).toBeTruthy();
  });

  it("renders declaration status and timeline after a successful inspect", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<MetadataIntegrityWorkspace assetCode="USDC" issuer={ISSUER_A} network="pubnet" />);

    submitForm();

    const report = await screen.findByTestId("metadata-report");
    expect(within(report).getByTestId("declaration-status").textContent).toMatch(/matched/i);
    expect(within(report).getByTestId("ownership-caveat").textContent).toMatch(/Domain ownership claimed from TOML:\s*no/i);
    expect(within(report).getByTestId("observation-timeline")).toBeTruthy();
    expect(within(report).getByTestId("identity-key").textContent).toContain("stellar:pubnet:USDC:");
  });

  it("announces errors assertively", async () => {
    vi.stubGlobal("fetch", installServiceFetch({ fail: true }));
    render(<MetadataIntegrityWorkspace assetCode="USDC" issuer={ISSUER_A} network="pubnet" />);

    submitForm();

    const error = await screen.findByTestId("metadata-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toMatch(/could not be read/i);
  });

  it("shows field diffs when session history drifts", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const priors = Array.isArray(body.priorObservations) ? body.priorObservations : [];

      const seeded =
        priors.length === 0
          ? [
              priorObservation({
                observedAt: "2026-02-01T12:00:00.000Z",
                snapshot: {
                  name: "Old Name",
                  description: "Old",
                  orgUrl: "https://old.example.com",
                  image: null,
                  status: "live",
                  code: "USDC",
                  issuer: ISSUER_A,
                  homeDomain: "example.com",
                  tomlUrl: "https://example.com/.well-known/stellar.toml",
                },
              }),
            ]
          : priors;

      const report = await inspectMetadataIntegrity(
        { ...request(), ...body, priorObservations: seeded },
        {
          readIssuer: createIssuerReader(),
          fetchToml: createTomlFetcher({ body: MATCHING_TOML }),
        },
      );

      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    });

    vi.stubGlobal("fetch", fetchMock);
    render(<MetadataIntegrityWorkspace assetCode="USDC" issuer={ISSUER_A} network="pubnet" />);

    submitForm();

    await waitFor(() => {
      expect(screen.getByTestId("diff-table").textContent).toMatch(/Field diffs/i);
    });

    expect(screen.getByTestId("diff-table").textContent).toMatch(/changeIsObservationNotFraud=true/);
    expect(screen.getByTestId("diff-table").textContent).toMatch(/Old Name/);
  });
});
