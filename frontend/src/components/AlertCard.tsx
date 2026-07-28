import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

const severityStyles: Record<AlertSeverity, { border: string; bg: string; icon: string; label: string }> = {
  low: { border: "border-sky-400/20", bg: "bg-sky-500/8", icon: "bg-sky-500/12 text-sky-300", label: "Low" },
  medium: { border: "border-amber-400/20", bg: "bg-amber-500/8", icon: "bg-amber-500/12 text-amber-300", label: "Medium" },
  high: { border: "border-orange-400/30", bg: "bg-orange-500/8", icon: "bg-orange-500/12 text-orange-300", label: "High" },
  critical: { border: "border-red-400/20", bg: "bg-red-500/8", icon: "bg-red-500/12 text-red-300", label: "Critical" },
};

export type AlertCardProps = {
  title?: string;
  detail?: string;
  severity?: AlertSeverity;
  sourceLabel?: string;
  children?: ReactNode;
};

export function AlertCard(props: AlertCardProps = {}) {
  const severity = props.severity ?? "critical";
  const styles = severityStyles[severity];
  const title = props.title ?? "Latest alert";
  const detail =
    props.detail ??
    "MEME whale sell pressure is high, liquidity is falling, and exposure exceeds your future rule target.";
  const sourceLabel = props.sourceLabel;

  return (
    <section className={`rounded-[28px] border ${styles.border} ${styles.bg} p-6`}>
      <div className="flex items-start gap-4">
        <div className={`rounded-full p-3 ${styles.icon}`}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-white/58">{detail}</p>
          {sourceLabel ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-white/40">Source: {sourceLabel}</p> : null}
        </div>
      </div>
    </section>
  );
}