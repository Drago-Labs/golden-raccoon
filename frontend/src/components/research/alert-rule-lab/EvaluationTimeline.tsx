import type { TimelineItem } from "@/server/research/alert-rule-lab";
import { SuppressionDetails } from "./SuppressionDetails";
export function EvaluationTimeline({ items }: { items: TimelineItem[] }) { return <ol aria-label="Evaluation timeline" className="space-y-3">{items.map((item) => <li key={item.id} className="rounded-xl border border-white/10 p-3"><strong>{item.outcome}</strong> · value {item.value ?? "missing"}<div className="text-xs">{item.observedAt}</div><SuppressionDetails item={item} /></li>)}</ol>; }
