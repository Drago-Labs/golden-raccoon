"use client";
import type { Locale } from "./config";
import { messages } from "./messages";
export function LocaleSelect({ locale }: { locale: Locale }) {
  return <label className="flex items-center gap-2">{messages(locale)("language")}<select value={locale} className="rounded border border-white/30 bg-black px-2 py-1 text-white focus-visible:outline-2" onChange={event => {
    document.cookie = `gr-locale=${encodeURIComponent(event.target.value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.cookie = `gr-time-zone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.location.reload();
  }}><option value="en">English</option><option value="tr">Türkçe</option></select></label>;
}
