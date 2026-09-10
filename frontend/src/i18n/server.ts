import { cookies, headers } from "next/headers";
import { resolveLocale, resolveTimeZone } from "./config";
export async function requestLocale() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  return { locale: resolveLocale(cookieStore.get("gr-locale")?.value, headerStore.get("accept-language")), timeZone: resolveTimeZone(cookieStore.get("gr-time-zone")?.value) };
}
