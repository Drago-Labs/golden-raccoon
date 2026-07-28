import type { Metadata } from "next";
import { WatchlistClient } from "@/components/WatchlistClient";

export const metadata: Metadata = {
  title: "Watchlist — Golden Raccoon",
  description: "Persistent wallet-scoped watchlists for EVM and Stellar assets.",
};

export default function WatchlistPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <WatchlistClient />
    </main>
  );
}
