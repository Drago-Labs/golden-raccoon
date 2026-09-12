import type { UnknownField } from "@/server/research/signing-inspector/schema";

/**
 * What the decoder saw and did not understand.
 *
 * This panel is the honest half of the report. It is rendered whenever there
 * is anything in it, never collapsed by default and never summarized into a
 * count, because a payload whose unknown parts are one click away reads as
 * fully understood.
 */
export function UnknownFieldsPanel({ unknownFields }: { unknownFields: UnknownField[] }) {
  if (unknownFields.length === 0) {
    return (
      <p data-testid="unknown-fields-empty" className="text-sm text-white/54">
        Every field in this payload was decoded. That the bytes are readable is not a statement that signing them is safe.
      </p>
    );
  }

  return (
    <ul data-testid="unknown-fields" className="flex flex-col gap-3">
      {unknownFields.map((field, index) => (
        <li key={`${field.location}-${index}`} className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <p className="font-mono text-xs text-white/54">{field.location}</p>
          <p className="mt-1 text-sm leading-6 text-white/78">{field.description}</p>
          {field.raw ? (
            <pre className="mt-2 overflow-x-auto rounded-xl bg-black/30 p-3 font-mono text-[11px] leading-5 text-white/60">{field.raw}</pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
