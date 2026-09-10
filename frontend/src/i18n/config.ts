export const locales = ["en", "tr"] as const;
export type Locale = typeof locales[number];
export function supportedLocale(value?: string | null): Locale | undefined {
  const language = value?.trim().toLowerCase().split("-")[0];
  return locales.find(locale => locale === language);
}
export function resolveLocale(preference?: string | null, acceptLanguage?: string | null): Locale {
  const explicit = supportedLocale(preference);
  if (explicit) return explicit;
  const languages = (acceptLanguage ?? "").split(",").map((part, index) => {
    const [language, ...parameters] = part.trim().split(";");
    const quality = parameters.find(value => value.trim().startsWith("q="));
    const weight = quality ? Number(quality.trim().slice(2)) : 1;
    return { locale: supportedLocale(language), weight, index };
  }).filter(entry => entry.locale && Number.isFinite(entry.weight) && entry.weight > 0 && entry.weight <= 1)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return languages[0]?.locale ?? "en";
}
export function resolveTimeZone(value?: string | null): string {
  if (value) {
    try { return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone; } catch { /* fall back to UTC */ }
  }
  return "UTC";
}
