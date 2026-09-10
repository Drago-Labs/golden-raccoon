"use client";
import type { ApiErrorCode } from "@/server/api/errors";

type Props = { error: Error & { digest?: string; code?: ApiErrorCode }; reset: () => void };

export function recoveryForError(error: Props["error"]) {
  switch (error.code) {
    case "provider_timeout":
    case "stale_data":
      return { title: "Provider data unavailable", detail: "Live data could not be verified. Try loading this view again.", retry: true, href: "/dashboard", action: "Return to dashboard" };
    case "auth_error":
    case "wallet_rejection":
      return { title: "Wallet connection required", detail: "Return to the dashboard and reconnect your wallet.", retry: false, href: "/dashboard", action: "Reconnect wallet" };
    case "payment_failure":
    case "submission_failure":
    case "submit_failed":
    case "duplicate_payment":
      return { title: "Check the operation status", detail: "Review the existing operation before starting another payment or transaction.", retry: false, href: "/history", action: "Review history" };
    default:
      return { title: "This view is unavailable", detail: "The view could not be loaded. Its data must not be treated as complete.", retry: true, href: "/dashboard", action: "Return to dashboard" };
  }
}

export function ErrorRecoveryPanel({ error, reset }: Props) {
  const recovery = recoveryForError(error);
  return (
    <section role="alert" aria-live="assertive" className="mx-auto max-w-xl rounded-lg border border-red-300/30 bg-red-950 p-6 text-white">
      <h1 className="text-2xl font-semibold">{recovery.title}</h1>
      <p className="mt-3">{recovery.detail}</p>
      <div className="mt-5 flex flex-wrap gap-4">
        {recovery.retry && <button type="button" onClick={reset} className="rounded border px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-4">Try again</button>}
        <a href={recovery.href} className="rounded px-4 py-2 underline focus-visible:outline-2 focus-visible:outline-offset-4">{recovery.action}</a>
      </div>
    </section>
  );
}
