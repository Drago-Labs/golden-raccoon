import type { Command } from "./schema";
export const routeCommands: Command[] = [
  ["dashboard", "Dashboard", "Portfolio overview"], ["agents", "Agents", "Agent activity and reports"],
  ["scan", "Scan", "Open the scan form"], ["strategy", "Strategy", "Review your strategy"],
  ["alerts", "Alerts", "Review alerts"], ["history", "History", "Transaction history"],
  ["recovery", "Recovery", "Review recovery options"], ["watchlist", "Watchlist", "Saved assets"],
  ["discovery", "Discovery", "Explore assets"], ["operations", "Operations", "Service health"],
  ["rules", "Rules", "View rule editor"],
].map(([path, label, description]) => ({ id: `route:${path}`, label, description, href: `/${path}`, group: "Pages", keywords: [path, description] }));
