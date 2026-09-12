import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { DecodedOperation } from "@/server/research/signing-inspector/schema";

/**
 * Every operation in the payload, interpreted or not.
 *
 * An operation the decoder could not interpret still gets a row, marked "not
 * interpreted". A four-row list where the payload has five operations would be
 * worse than no list at all.
 */
export function OperationList({ operations }: { operations: DecodedOperation[] }) {
  if (operations.length === 0) return null;

  return (
    <ol data-testid="operation-list" className="flex flex-col gap-3">
      {operations.map((operation) => (
        <li key={`${operation.index}-${operation.type}`} className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/12 px-2 py-0.5 text-xs text-white/54">#{operation.index + 1}</span>
            <span className="font-mono text-sm text-white/80">{operation.type}</span>
            {operation.supported ? null : <StatusBadge tone="neutral">Not interpreted</StatusBadge>}
          </div>

          <p className="mt-2 text-sm leading-6 text-white/70">{operation.summary}</p>

          {operation.fields.length > 0 ? (
            <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              {operation.fields.map((field) => (
                <div key={`${operation.index}-${field.label}`}>
                  <dt className="text-white/42">{field.label}</dt>
                  <dd className="mt-0.5 break-all font-mono text-white/78">{field.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
