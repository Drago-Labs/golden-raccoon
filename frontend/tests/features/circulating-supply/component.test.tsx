import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SupplyWaterfall } from "@/components/research/circulating-supply/SupplyWaterfall";
describe("supply waterfall", () => { it("renders an accessible text alternative", () => { render(<SupplyWaterfall report={{ state: "complete", token: { network: "evm", chainId: 1, address: "0x0000000000000000000000000000000000000010", decimals: 18 }, totalSupply: "100", excludedTotal: "20", impliedSupply: "80", exclusions: [], comparisons: [], observation: 1, sourceUrl: "https://rpc.example", coverageNotice: "Complete", readOnly: true }} />); expect(screen.getByText(/minus evidenced excluded/i)).toBeTruthy(); expect(screen.getByRole("heading", { name: /supply waterfall/i })).toBeTruthy(); }); });
