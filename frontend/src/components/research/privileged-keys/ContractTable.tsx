import type { ContractView } from "@/server/research/privileged-keys";

export function ContractTable({ contracts }: { contracts: ContractView[] }) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-2 text-left font-medium">Contracts</caption>
      <thead>
        <tr>
          <th className="text-left">Name</th>
          <th className="text-left">Chain</th>
          <th className="text-left">Address</th>
          <th className="text-left">Controllers</th>
        </tr>
      </thead>
      <tbody>
        {contracts.map((contract) => (
          <tr key={`${contract.chain}:${contract.address}`}>
            <td>{contract.name}</td>
            <td>{contract.chain}</td>
            <td>{contract.address}</td>
            <td>{contract.controllers.join(", ") || "none recorded"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
