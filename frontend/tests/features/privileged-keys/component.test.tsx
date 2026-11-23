import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivilegedKeyInventory } from "@/components/research/privileged-keys/PrivilegedKeyInventory";
import { buildPrivilegedKeyInventory } from "@/server/research/privileged-keys";
import { loadFixture } from "./fixtures";

describe("the inventory page names each controller kind", () => {
  it("shows the multisig threshold and the contract count", () => {
    const initial = buildPrivilegedKeyInventory(loadFixture("multisig-project.json"));
    render(<PrivilegedKeyInventory projects={[{ id: "multisig-project", label: "Multisig project" }]} initial={initial} />);
    expect(screen.getByRole("table", { name: "Controllers" })).toBeTruthy();
    expect(screen.getAllByText("0xsafe").length).toBeGreaterThan(0);
    expect(screen.getByText("Multisig").textContent).toBe("Multisig");
    expect(screen.getByText("threshold 2 of 3").textContent).toBe("threshold 2 of 3");
    expect(screen.getByRole("status").textContent).toMatch(/2 contracts/);
  });
});
