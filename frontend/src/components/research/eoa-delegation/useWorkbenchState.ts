"use client";
import { useState } from "react";
import type { DelegationReport } from "@/server/research/eoa-delegation";
export function useWorkbenchState() { const [result, setResult] = useState<DelegationReport | null>(null); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false); return { result, setResult, error, setError, loading, setLoading }; }
