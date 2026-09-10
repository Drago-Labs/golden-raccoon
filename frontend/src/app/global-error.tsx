"use client";
import { ErrorRecoveryPanel } from "@/components/ErrorRecoveryPanel";
export default function GlobalError(props: Parameters<typeof ErrorRecoveryPanel>[0]) {
  return <html lang="en"><body style={{ margin: 0, padding: "2rem", background: "#111", color: "#fff", fontFamily: "sans-serif" }}><ErrorRecoveryPanel {...props} /></body></html>;
}
