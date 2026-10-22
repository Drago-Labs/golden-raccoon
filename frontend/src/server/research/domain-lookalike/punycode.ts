export function isInternationalized(hostname: string): boolean { return hostname.split(".").some((label) => label.startsWith("xn--")); }
export function punycodeLabels(hostname: string): string[] { return hostname.split(".").filter((label) => label.startsWith("xn--")); }
