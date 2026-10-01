import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReserveAttestationWorkspace } from "@/components/research/reserve-attestation/ReserveAttestationWorkspace";

describe("ReserveAttestationWorkspace", () => {
  it("labels the request input and the submit control so the flow is reachable by keyboard", () => {
    render(<ReserveAttestationWorkspace />);
    expect(screen.getByLabelText(/Request JSON/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review evidence" })).toBeTruthy();
  });

  it("renders the evidence table with a document link by role once a report comes back", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          report: {
            schemaVersion: "reserve-attestation/2026-01",
            windowStart: "2026-01-01T00:00:00Z",
            windowEnd: "2026-04-01T00:00:00Z",
            assets: [
              {
                registryEntry: { assetCode: "USDX", issuer: "Example Issuer Ltd", permittedSourceLabels: [] },
                evidence: [
                  {
                    documentHash: "a".repeat(64),
                    documentUrl: "https://example.com/reports/jan-2026.pdf",
                    retrievedAt: "2026-02-05T00:00:00Z",
                    sourceType: "independent_attestation",
                    sourceLabel: "Example Accounting Firm",
                    reportingPeriodStart: "2026-01-01T00:00:00Z",
                    reportingPeriodEnd: "2026-01-31T00:00:00Z",
                    status: "on_time",
                    currency: "USD",
                    claimedAssets: "1000000",
                    claimedLiabilities: "1000000",
                    coverageRatioBps: 10_000,
                    coverageNote: "",
                    supersedes: [],
                    superseded: false,
                  },
                ],
                latestCoverageRatioBps: 10_000,
                state: "complete",
              },
            ],
            unregisteredReports: [],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    render(<ReserveAttestationWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "Review evidence" }));

    await waitFor(() => expect(screen.getByText(/USDX/)).toBeTruthy());
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByRole("link", { name: /a{12}/ }).getAttribute("href")).toBe("https://example.com/reports/jan-2026.pdf");
  });

  it("shows an alert for invalid JSON without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ReserveAttestationWorkspace />);
    fireEvent.change(screen.getByLabelText(/Request JSON/), { target: { value: "{not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Review evidence" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not valid JSON"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
