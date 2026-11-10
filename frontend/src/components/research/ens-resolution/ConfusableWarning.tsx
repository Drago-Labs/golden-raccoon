import type { ConfusableFinding } from "@/server/research/ens-resolution";

export function ConfusableWarning(props: { confusables: ConfusableFinding }) {
  if (props.confusables.flaggedCharacters.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
      Confusable characters detected:{" "}
      {props.confusables.flaggedCharacters.map((c) => `${c.char} (${c.codePointHex} ${c.script})`).join(", ")}
    </div>
  );
}
