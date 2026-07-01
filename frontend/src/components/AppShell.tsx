import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agents", label: "Agents" },
  { href: "/scan", label: "Scan" },
  { href: "/strategy", label: "Strategy" },
  { href: "/history", label: "History" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-hidden bg-[#050505] text-white">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#050505]/78 backdrop-blur-2xl">
        <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/brand/logo.png"
              alt="Golden Raccoon guardian emblem"
              width={44}
              height={44}
              className="rounded-2xl border border-white/10"
              priority
            />
            <div>
              <div className="text-sm font-semibold tracking-[0.18em] text-[#d9a441]">GOLDEN RACCOON</div>
              <div className="text-xs text-white/48">Multi-agent portfolio intelligence</div>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-2 text-sm text-white/64 transition hover:bg-white/8 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#d9a441]/25 bg-[#d9a441]/10 px-4 text-sm font-medium text-[#f2c86d] transition hover:border-[#d9a441]/45"
          >
            Go Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-5 py-8 sm:px-8">
        <div className="mb-8 h-px w-full gold-line" />
        {children}
      </main>
      <div className="pointer-events-none fixed bottom-6 right-6 hidden rounded-full border border-[#d9a441]/30 bg-[#d9a441]/10 p-3 text-[#d9a441] lg:block">
        <ShieldCheck className="h-5 w-5" />
      </div>
    </div>
  );
}
