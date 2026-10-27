"use client";
import { useState } from "react";
import type { CirculatingSupplyReport } from "@/server/research/circulating-supply/schema";
export type WorkbenchState = { status: "idle" | "loading" } | { status: "ready"; report: CirculatingSupplyReport } | { status: "error"; message: string };
export function useWorkbenchState() { return useState<WorkbenchState>({ status: "idle" }); }
