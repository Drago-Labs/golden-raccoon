import { describe, expect, it } from "vitest";
import {
  createDirectoryResolver,
  labelCounterparties,
} from "@/server/research/counterparty-flows/counterpartyLabels";
import { exchangeHeavy } from "./fixtures";

describe("labels", () => {
  it("labels known counterparties and leaves others unlabelled", () => {
    const resolver = createDirectoryResolver(exchangeHeavy.labels);
    const labels = labelCounterparties(
      [
        "GBB47USUTI3NCW7227HZCKPYA2B4ZJ5TDQJY6Y4EVLKI33O57IPOANDJ",
        "GB5FXIMTMUOQXH7RPY3L6XNLWGBP3EZ4PAWHS7YMFE64U2HBIWFFWGQI",
      ],
      resolver,
    );

    expect(labels.get("GBB47USUTI3NCW7227HZCKPYA2B4ZJ5TDQJY6Y4EVLKI33O57IPOANDJ")).toEqual({
      label: "Exchange Desk",
      evidence: "fixture identity directory",
    });
    expect(labels.get("GB5FXIMTMUOQXH7RPY3L6XNLWGBP3EZ4PAWHS7YMFE64U2HBIWFFWGQI")).toBeNull();
  });

  it("never invents a label for an empty directory", () => {
    const labels = labelCounterparties(["GB5FXIMTMUOQXH7RPY3L6XNLWGBP3EZ4PAWHS7YMFE64U2HBIWFFWGQI"]);
    expect(labels.get("GB5FXIMTMUOQXH7RPY3L6XNLWGBP3EZ4PAWHS7YMFE64U2HBIWFFWGQI")).toBeNull();
  });
});
