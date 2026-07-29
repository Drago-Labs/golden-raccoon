import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

type StatusTone = "success" | "warning" | "danger" | "neutral";

const toneStyles: Record<StatusTone, string> = {
  success: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  warning: "border-[#d9a441]/35 bg-[#d9a441]/10 text-[#f2c86d]",
  danger: "border-red-300/35 bg-red-400/8 text-red-200",
  neutral: "border-white/10 bg-white/5 text-white/70",
};

const toneIcons: Record<StatusTone, ReactNode> = {
  success: <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />,
  warning: <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />,
  danger: <XCircle aria-hidden="true" className="h-3.5 w-3.5" />,
  neutral: <Info aria-hidden="true" className="h-3.5 w-3.5" />,
};

/**
 * A status indicator that never relies on color alone: every tone pairs a
 * distinct icon with the text label so meaning survives grayscale rendering,
 * color-vision deficiency, or high-contrast overrides.
 */
export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${toneStyles[tone]}`}>
      {toneIcons[tone]}
      {children}
    </span>
  );
}
