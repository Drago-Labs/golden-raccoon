import { describe, expect, it } from "vitest";
import {
  assertReadOnlySimulations,
  unavailableSimulations,
} from "@/server/research/sep41-conformance/readSimulation";
import { fixtures } from "./fixtures";

describe("sep41 readSimulation", () => {
  it("never requires signatures for recorded probes", () => {
    const entries = assertReadOnlySimulations(fixtures.conforming.simulations ?? []);
    expect(entries.every((entry) => entry.authorizationRequired === false)).toBe(true);
    expect(entries.map((entry) => entry.function)).toEqual(["decimals", "name", "symbol", "balance"]);
  });

  it("marks unavailable simulations without flipping authRequired", () => {
    const entries = unavailableSimulations("Provider unavailable");
    expect(entries).toHaveLength(4);
    expect(entries.every((entry) => entry.ok === false)).toBe(true);
    expect(entries.every((entry) => entry.authorizationRequired === false)).toBe(true);
  });
});
