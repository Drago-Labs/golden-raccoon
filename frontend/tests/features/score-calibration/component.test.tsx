import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalibrationReport } from "@/components/research/score-calibration/CalibrationReport";
import { buildCalibrationReport } from "@/server/research/score-calibration/service";
import { noopDeps, snapshot } from "./fixtures";

function installServiceFetch(options: { fail?: boolean } = {}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (options.fail) {
      return { ok: false, status: 400, json: async () => ({ error: "invalid_request", message: "bad request" }) } as unknown as Response;
    }

    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    const deps = {
      ...noopDeps(),
      readScoreSnapshots: () => [snapshot({ snapshotId: "s1", score: 10, publishedAt: "2020-01-01T00:00:00.000Z" })],
      detectLargeDrawdown: async () => ({ outcome: "did_not_occur" as const }),
    };
    const report = await buildCalibrationReport(body, deps);

    return { ok: true, status: 200, json: async () => ({ report }) } as unknown as Response;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CalibrationReport", () => {
  it("labels the horizon and outcome selector for assistive technology", () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<CalibrationReport />);

    expect(screen.getByRole("form", { name: /score calibration horizon and outcome selector/i })).toBeTruthy();
    expect(screen.getByLabelText("Outcome")).toBeTruthy();
    expect(screen.getByLabelText("Horizon")).toBeTruthy();
    expect(screen.getByRole("button", { name: /build report/i })).toBeTruthy();
  });

  it("shows the chart and bucket detail after building a report", async () => {
    vi.stubGlobal("fetch", installServiceFetch());
    render(<CalibrationReport />);

    fireEvent.submit(screen.getByRole("form", { name: /score calibration horizon and outcome selector/i }));

    await waitFor(() => {
      expect(screen.getByTestId("calibration-chart")).toBeTruthy();
      expect(screen.getByTestId("bucket-detail")).toBeTruthy();
    });
  });

  it("shows an alert on a failed request", async () => {
    vi.stubGlobal("fetch", installServiceFetch({ fail: true }));
    render(<CalibrationReport />);

    fireEvent.submit(screen.getByRole("form", { name: /score calibration horizon and outcome selector/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });
});
