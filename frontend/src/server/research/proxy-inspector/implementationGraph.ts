import type { ProxyNode } from "./schema";
export function addNode(nodes: ProxyNode[], node: ProxyNode) {
  if (!nodes.some((item) => item.address.toLowerCase() === node.address.toLowerCase())) nodes.push(node);
}
