import type { ControllerView } from "@/server/research/privileged-keys";

const LABELS: Record<ControllerView["kind"], string> = {
  single_key: "Single key",
  multisig: "Multisig",
  timelock: "Timelock",
  unknown: "Unknown",
};

export function ControllerTable({ controllers }: { controllers: ControllerView[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-medium">Controllers</caption>
      <thead>
        <tr>
          <th className="text-left">Address</th>
          <th className="text-left">Kind</th>
          <th className="text-left">Control</th>
          <th className="text-left">Contracts</th>
        </tr>
      </thead>
      <tbody>
        {controllers.map((controller) => (
          <tr key={controller.address}>
            <td>{controller.address}</td>
            <td>{LABELS[controller.kind]}</td>
            <td>
              {controller.kind === "multisig" && controller.threshold !== null
                ? `threshold ${controller.threshold} of ${controller.signerCount ?? 0}`
                : controller.kind === "timelock" && controller.delaySeconds !== null
                  ? `delay ${controller.delaySeconds} seconds`
                  : controller.kind === "unknown"
                    ? "unclassified"
                    : "single signer"}
            </td>
            <td>{controller.contracts.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
