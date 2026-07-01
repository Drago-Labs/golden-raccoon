import { NextResponse } from "next/server";
import { getPortfolioProviderHealth } from "@/server/portfolio/getPortfolio";

export async function GET() {
  return NextResponse.json({
    providers: getPortfolioProviderHealth(),
    fallbackOrder: ["GoldRush/Covalent", "Alchemy", "GOAT RPC", "Mock portfolio"],
    checkedAt: new Date().toISOString(),
  });
}
