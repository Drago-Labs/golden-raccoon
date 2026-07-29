"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { StellarWalletProvider } from "@/providers/StellarWalletProvider";
import { WalletSessionProvider } from "@/providers/WalletSessionProvider";

export function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          modalSize="compact"
          theme={darkTheme({
            accentColor: "#d9a441",
            accentColorForeground: "#050505",
            borderRadius: "medium",
            overlayBlur: "small",
          })}
        >
          <StellarWalletProvider>
            <WalletSessionProvider>{children}</WalletSessionProvider>
          </StellarWalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
