/**
 * A small, feature-local registry of project policy pages to track.
 *
 * This is deliberately a fixed list, not a freeform URL box: it keeps the
 * fetch surface to a small set of known, stable Stellar-ecosystem pages
 * rather than letting a caller point this tool at an arbitrary URL.
 */
export type PolicyProject = {
  id: string;
  label: string;
  url: string;
  kind: "terms" | "privacy" | "legal";
};

export const POLICY_PROJECTS: PolicyProject[] = [
  {
    id: "sdf-terms",
    label: "Stellar Development Foundation — Terms of Service",
    url: "https://stellar.org/terms-of-service",
    kind: "terms",
  },
  {
    id: "sdf-privacy",
    label: "Stellar Development Foundation — Privacy Policy",
    url: "https://stellar.org/privacy-policy",
    kind: "privacy",
  },
  {
    id: "centre-legal",
    label: "Centre Consortium — Legal",
    url: "https://www.centre.io/legal",
    kind: "legal",
  },
];

export function findPolicyProject(projectId: string): PolicyProject | null {
  return POLICY_PROJECTS.find((project) => project.id === projectId) ?? null;
}
