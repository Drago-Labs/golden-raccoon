import type { SecurityHeaders } from "@/server/research/frontend-integrity/schema";
export function HeaderTable({ headers }: { headers: SecurityHeaders }) {
  const rows = [
    ["Content-Security-Policy", headers.csp],
    ["Strict-Transport-Security", headers.hsts],
    ["X-Frame-Options", headers.frame],
    ["Referrer-Policy", headers.referrer],
  ] as const;
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-medium">Security headers</caption>
      <tbody>
        {rows.map(([name, value]) => <tr key={name}><th className="text-left">{name}</th><td>{value ?? "absent"}</td></tr>)}
      </tbody>
    </table>
  );
}
