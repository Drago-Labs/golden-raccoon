import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DelegationInspector } from "@/components/research/eoa-delegation/DelegationInspector";
describe("delegation inspector", () => { it("renders an accessible read-only workbench", () => { render(<DelegationInspector />); expect(screen.getByRole("heading", { name: /EIP-7702 delegation inspector/i })).toBeTruthy(); expect(screen.getByLabelText(/Externally owned account/i)).toBeTruthy(); expect(screen.getByRole("button", { name: /Inspect delegation/i })).toBeTruthy(); }); });
