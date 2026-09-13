import type { TimelineItem } from "@/server/research/alert-rule-lab";
export function SuppressionDetails({ item }: { item: TimelineItem }) { return <details><summary>Rule evidence</summary><p>{item.reason}</p><p className="text-xs">{item.ruleFields}</p></details>; }
