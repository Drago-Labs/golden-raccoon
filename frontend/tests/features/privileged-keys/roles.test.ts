import { describe, expect, it } from "vitest";
import { readEvmRoles } from "@/server/research/privileged-keys/evmRoles";
import { readDeployments } from "@/server/research/privileged-keys/deploymentReader";
import type { Deployment, PrivilegeRecord } from "@/server/research/privileged-keys/schema";
import { loadFixture } from "./fixtures";

describe("EVM role rows stay on the EVM side of a mixed payload", () => {
  it("keeps only evm privileges and drops a blank deployment address", () => {
    const fixture = loadFixture("mixed-chains.json") as { privileges: PrivilegeRecord[]; deployments: Deployment[] };
    expect(readEvmRoles(fixture.privileges).map((row) => row.contract)).toEqual(["0xvault"]);
    expect(readDeployments([...fixture.deployments, { chain: "evm", address: "  ", name: "Blank" }])).toHaveLength(2);
  });
});
