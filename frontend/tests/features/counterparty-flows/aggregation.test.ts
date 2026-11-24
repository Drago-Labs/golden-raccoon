import { describe, expect, it } from "vitest";
import { aggregateFlows } from "@/server/research/counterparty-flows/aggregation";
import { createDirectoryResolver, labelCounterparties } from "@/server/research/counterparty-flows/counterpartyLabels";
import { exchangeHeavy, diverseFlows } from "./fixtures";

describe("aggregation", () => {
  it("totals per counterparty match exchange-heavy fixture operations", () => {
    const labels = labelCounterparties(
      exchangeHeavy.events.map((event) => event.counterparty),
      createDirectoryResolver(exchangeHeavy.labels),
    );
    const totals = aggregateFlows(exchangeHeavy.events, labels);

    const exchangeOut = totals.find(
      (row) =>
        row.direction === "out" &&
        row.counterparty === "GBB47USUTI3NCW7227HZCKPYA2B4ZJ5TDQJY6Y4EVLKI33O57IPOANDJ" &&
        row.asset === "native",
    );
    const peerOut = totals.find(
      (row) =>
        row.direction === "out" &&
        row.counterparty === "GB5FXIMTMUOQXH7RPY3L6XNLWGBP3EZ4PAWHS7YMFE64U2HBIWFFWGQI",
    );
    const exchangeIn = totals.find(
      (row) =>
        row.direction === "in" &&
        row.counterparty === "GBB47USUTI3NCW7227HZCKPYA2B4ZJ5TDQJY6Y4EVLKI33O57IPOANDJ",
    );

    expect(exchangeOut?.amount).toBe("80.0000000");
    expect(exchangeOut?.eventCount).toBe(1);
    expect(exchangeOut?.label).toBe("Exchange Desk");
    expect(peerOut?.amount).toBe("20.0000000");
    expect(peerOut?.label).toBeNull();
    expect(exchangeIn?.amount).toBe("5.0000000");
  });

  it("merges same counterparty and asset across events in diverse-flows", () => {
    const labels = labelCounterparties(
      diverseFlows.events.map((event) => event.counterparty),
      createDirectoryResolver({}),
    );
    const totals = aggregateFlows(diverseFlows.events, labels);
    const peer = totals.find(
      (row) =>
        row.direction === "out" &&
        row.counterparty === "GB5FXIMTMUOQXH7RPY3L6XNLWGBP3EZ4PAWHS7YMFE64U2HBIWFFWGQI",
    );
    // 10 + 5 from two payment events
    expect(peer?.amount).toBe("15.0000000");
    expect(peer?.eventCount).toBe(2);
  });
});
