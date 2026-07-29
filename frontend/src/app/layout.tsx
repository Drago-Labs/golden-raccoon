import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Web3Provider } from "@/providers/Web3Provider";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";

export const metadata: Metadata = {
  title: "Golden Raccoon | AI Crypto Guardian",
  description: "Multi-agent crypto portfolio intelligence and user-authorized execution for GOAT Network.",
  icons: {
    icon: "/brand/logo.png",
    shortcut: "/brand/logo.png",
    apple: "/brand/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full bg-[#050505] text-white">
        <WebVitalsReporter />
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
