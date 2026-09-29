import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IncidentStatusPanel } from "@/components/research/incident-status/IncidentStatusPanel";
import { IncidentError } from "@/server/research/incident-status/schema";
import { analyseIncidentStatus } from "@/server/research/incident-status/service";
import {
  conflictingOfficialSources,
  emptyIncident,
  rumorCannotAcknowledge,
  statusRevisionOfficial,
  staleUpdate,
} from "./fixtures";

function installServiceFetch(options: { delayMs?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));

    try {
      const report = analyseIncidentStatus(JSON.parse(String(init?.body ?? "{}")));
      return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
    } catch (error) {
      const failure = error as IncidentError;
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: failure.code, message: failure.message }),
      } as unknown as Response;
    }
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IncidentStatusPanel", () => {
  it("shows an explicit empty state with no input", () => {
    installServiceFetch();
    render(<IncidentStatusPanel account="GABC" network="stellar-pubnet" />);

    expect(screen.getByText(/No incident documents are loaded/i)).toBeTruthy();
  });

  it("keeps rumours readable as reported in the evidence table", async () => {
    installServiceFetch();
    render(<IncidentStatusPanel input={rumorCannotAcknowledge} account="GABC" network="stellar-pubnet" />);

    const table = await screen.findByRole("table", { name: /Incident documents/i });
    const row = within(table).getByRole("rowheader", { name: /Anonymous tip/i }).closest("tr")!;

    expect(within(row).getByText("reported")).toBeTruthy();
    expect(within(row).getByText(/cannot become an official acknowledgement/i)).toBeTruthy();
  });

  it("exposes timeline, disagreements and transitions in reading order", async () => {
    installServiceFetch();
    render(<IncidentStatusPanel input={statusRevisionOfficial} account="GABC" network="stellar-pubnet" />);

    await screen.findByTestId("incident-status-panel");

    const headings = screen.getAllByRole("heading").map((node) => node.textContent);
    const documentsIdx = headings.findIndex((text) => /Documents/i.test(text ?? ""));
    const timelineIdx = headings.findIndex((text) => /Source-linked timeline/i.test(text ?? ""));
    const disagreementsIdx = headings.findIndex((text) => /Disagreements/i.test(text ?? ""));
    const transitionsIdx = headings.findIndex((text) => /Status transitions/i.test(text ?? ""));

    expect(documentsIdx).toBeGreaterThan(-1);
    expect(timelineIdx).toBeGreaterThan(documentsIdx);
    expect(disagreementsIdx).toBeGreaterThan(documentsIdx);
    expect(transitionsIdx).toBeGreaterThan(timelineIdx);

    expect(screen.getByTestId("incident-timeline")).toBeTruthy();
    expect(screen.getByTestId("status-transitions")).toBeTruthy();
  });

  it("lists conflicting official sources in the disagreement panel", async () => {
    installServiceFetch();
    render(<IncidentStatusPanel input={conflictingOfficialSources} account="GABC" network="stellar-pubnet" />);

    const panel = await screen.findByTestId("disagreements");
    expect(within(panel).getByText(/Conflicting official sources/i)).toBeTruthy();
    expect(within(panel).getByText(/disagree/i)).toBeTruthy();
  });

  it("surfaces stale updates", async () => {
    installServiceFetch();
    render(<IncidentStatusPanel input={staleUpdate} account="GABC" network="stellar-pubnet" />);

    expect(await screen.findByTestId("stale-old-mitigation")).toBeTruthy();
    expect(screen.getByTestId("coverage-note").textContent).toMatch(/partial/i);
  });

  it("supports keyboard selection of a document row", async () => {
    installServiceFetch();
    render(<IncidentStatusPanel input={statusRevisionOfficial} account="GABC" network="stellar-pubnet" />);

    const table = await screen.findByRole("table", { name: /Incident documents/i });
    const button = within(table).getByRole("button", { name: /Bridge Vault remediation complete/i });

    fireEvent.click(button);

    expect(screen.getByTestId("selected-document-detail").textContent).toMatch(/remediation complete/i);
  });

  it("shows the empty coverage state when no documents are supplied", async () => {
    installServiceFetch();
    render(<IncidentStatusPanel input={emptyIncident} account="GABC" network="stellar-pubnet" />);

    expect((await screen.findByTestId("coverage-note")).textContent).toMatch(/empty/i);
  });

  it("announces analysis failures accessibly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "invalid_request", message: "bad payload" }),
      })),
    );

    render(
      <IncidentStatusPanel
        input={{ observedAt: "nope", subject: { chainId: "x", protocolId: "y", displayName: "z" }, documents: [] }}
        account="GABC"
        network="stellar-pubnet"
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be analysed/i)).toBeTruthy();
    expect(within(alert).getByText("invalid_request")).toBeTruthy();
  });
});
