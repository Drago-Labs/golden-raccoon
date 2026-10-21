import type { DecodedSetting } from "@/server/research/network-settings/schema";

export function SettingsTable(props: { settings: DecodedSetting[]; ledger: number | null; protocolVersion: number | null }) {
  return (
    <section className="min-w-0 space-y-3" aria-labelledby="current-settings-heading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="current-settings-heading" className="text-lg font-semibold">
          Current settings
        </h2>
        <p className="text-sm text-foreground/70">
          Ledger {props.ledger ?? "unavailable"} · protocol {props.protocolVersion ?? "unavailable"}
        </p>
      </div>
      <div className="w-full max-w-full overflow-x-auto rounded-2xl border border-foreground/15">
        <table aria-label="Current settings" className="w-full min-w-[18rem] border-collapse text-left text-sm">
          <thead className="bg-foreground/5">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Setting</th>
              <th scope="col" className="px-3 py-2 font-medium">Value</th>
              <th scope="col" className="px-3 py-2 font-medium">Unit</th>
            </tr>
          </thead>
          <tbody>
            {props.settings.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-foreground/70">
                  No settings were returned for this page.
                </td>
              </tr>
            ) : (
              props.settings.map((setting) => (
                <tr key={setting.key} className="border-t border-foreground/10">
                  <th scope="row" className="px-3 py-2 font-medium">
                    {setting.name}
                    {setting.known ? null : <span className="ml-2 text-xs font-normal text-foreground/70">raw id</span>}
                  </th>
                  <td className="px-3 py-2 font-mono break-all">{setting.value}</td>
                  <td className="px-3 py-2">{setting.unit}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
