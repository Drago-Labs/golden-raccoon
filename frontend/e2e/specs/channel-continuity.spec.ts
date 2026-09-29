import { expect, test } from "@playwright/test";
import { redirectAndDomainChurn, unsafePrivateRedirect } from "../../tests/features/channel-continuity/fixtures";

/**
 * Journey for the channel continuity inspector.
 *
 * The endpoint performs no outbound I/O — the caller supplies observations — so
 * the journey drives it with synthetic fixtures only.
 */
test.describe("Channel continuity inspector", () => {
  test("renders the page shell and an explicit empty state", async ({ page }) => {
    await page.goto("/insights/channel-continuity");

    await expect(page.getByRole("heading", { name: "Channel continuity inspector", level: 1 })).toBeVisible();
    await expect(page.getByText(/No channel observations are loaded/i)).toBeVisible();
  });

  test("reflows on a narrow viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto("/insights/channel-continuity");

    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflows).toBe(false);
  });

  test("records redirects as evidence and keeps the score unchanged", async ({ page }) => {
    await page.goto("/insights/channel-continuity");

    const response = await page.request.post("/api/insights/channel-continuity", { data: redirectAndDomainChurn });

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");

    const payload = await response.json();
    expect(payload.report.events.some((event: { kind: string }) => event.kind === "redirect")).toBe(true);
    expect(payload.report.events.some((event: { kind: string }) => event.kind === "domain_change")).toBe(true);
    expect(payload.report.scoreUnchanged).toBe(true);
    expect(payload.report.events.every((event: { limitation: string }) => /not proof of takeover/i.test(event.limitation))).toBe(
      true,
    );
  });

  test("blocks private-network redirects in the API response", async ({ page }) => {
    await page.goto("/insights/channel-continuity");

    const response = await page.request.post("/api/insights/channel-continuity", { data: unsafePrivateRedirect });
    const payload = await response.json();

    expect(response.status()).toBe(200);
    const blocked = payload.report.observations.find(
      (observation: { observationId: string }) => observation.observationId === "alpha-ssrf",
    );
    expect(blocked.fetchOutcome).toBe("blocked_unsafe");
  });

  test("rejects an unreadable observation time", async ({ page }) => {
    await page.goto("/insights/channel-continuity");

    const response = await page.request.post("/api/insights/channel-continuity", {
      data: { ...redirectAndDomainChurn, observedAt: "not-a-date" },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload.report).toBeUndefined();
  });
});
