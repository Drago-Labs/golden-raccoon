import { StatusBadge } from "@/components/a11y/StatusBadge";
import type { Permission } from "@/server/research/signing-inspector/schema";

const KIND_LABELS: Record<Permission["kind"], string> = {
  token_transfer: "Transfer",
  token_approval: "Approval",
  permit_approval: "Permit",
  transfer_from: "Transfer from",
  allowance_increase: "Allowance increase",
  allowance_decrease: "Allowance decrease",
  stellar_payment: "Payment",
  stellar_trustline: "Trustline",
  stellar_account_change: "Account change",
  unknown: "Unknown",
};

/**
 * What the payload asks for, most far-reaching first.
 *
 * Each row leads with the consequence in plain language rather than with the
 * field names, because "lets the spender move the entire balance" is the part
 * a reader needs and `value: 2^256-1` is the part they would have to decode
 * themselves. The raw provenance is kept alongside so the claim is checkable.
 */
export function PermissionSummary({ permissions }: { permissions: Permission[] }) {
  if (permissions.length === 0) {
    return (
      <p data-testid="permissions-empty" className="text-sm text-white/54">
        The payload requests no permission this inspector recognizes. That is not the same as requesting nothing — check the
        unrecognized fields below.
      </p>
    );
  }

  return (
    <ul data-testid="permission-summary" className="flex flex-col gap-4">
      {permissions.map((permission) => (
        <li key={permission.permissionId} className="rounded-2xl border border-white/10 bg-white/4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={permission.isUnlimited ? "danger" : permission.deadline?.expired ? "neutral" : "warning"}>
              {KIND_LABELS[permission.kind]}
            </StatusBadge>
            {permission.isUnlimited ? <StatusBadge tone="danger">Unlimited</StatusBadge> : null}
            {permission.deadline?.expired ? <StatusBadge tone="neutral">Expired</StatusBadge> : null}
          </div>

          <p className="mt-3 text-sm leading-6 text-white/80">{permission.consequence}</p>

          <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            {permission.spender ? (
              <div>
                <dt className="text-white/42">Spender</dt>
                <dd className="mt-0.5 break-all font-mono text-white/78">{permission.spender}</dd>
              </div>
            ) : null}
            {permission.recipient ? (
              <div>
                <dt className="text-white/42">Recipient</dt>
                <dd className="mt-0.5 break-all font-mono text-white/78">{permission.recipient}</dd>
              </div>
            ) : null}
            {permission.subject ? (
              <div>
                <dt className="text-white/42">Applies to</dt>
                <dd className="mt-0.5 break-all font-mono text-white/78">{permission.subject}</dd>
              </div>
            ) : null}
            {permission.amountRaw ? (
              <div>
                <dt className="text-white/42">Amount (base units)</dt>
                <dd className="mt-0.5 break-all font-mono text-white/78">
                  {permission.amountRaw}
                  <span className="mt-0.5 block font-sans text-white/42">
                    Decimals are not read: that would need a chain lookup this inspector does not make.
                  </span>
                </dd>
              </div>
            ) : null}
            {permission.deadline ? (
              <div>
                <dt className="text-white/42">Deadline</dt>
                <dd className="mt-0.5 text-white/78">
                  {permission.deadline.iso ?? permission.deadline.unixSeconds}
                  {permission.deadline.expired ? " · already passed" : ""}
                </dd>
              </div>
            ) : null}
          </dl>

          <p className="mt-3 text-xs leading-5 text-white/42">Read from: {permission.rawProvenance}</p>
        </li>
      ))}
    </ul>
  );
}
