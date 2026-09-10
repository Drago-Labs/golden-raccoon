import assert from "node:assert/strict";
import { resolveLocale, resolveTimeZone } from "../src/i18n/config";
import { createFormatters } from "../src/i18n/format";
import { messages, type MessageKey } from "../src/i18n/messages";
assert.equal(resolveLocale("tr", "en;q=1"), "tr");
assert.equal(resolveLocale(undefined, "en;q=0.2,tr-TR;q=0.9"), "tr");
assert.equal(resolveLocale(undefined, "tr;q=0,en;q=1"), "en");
assert.equal(resolveLocale("unknown", "fr,tr;q=0.5"), "tr");
assert.equal(resolveTimeZone("invalid-zone"), "UTC");
assert.equal(messages("tr")("history"), "Geçmiş");
assert.throws(() => messages("en")("missing" as MessageKey));
const instant = "2026-01-01T22:30:00Z";
for (const locale of ["en", "tr"] as const) {
  const format = createFormatters(locale, "Europe/Istanbul");
  assert.equal(format.dateTime(instant), new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(instant)));
  assert.equal(format.percent(.42), new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(.42));
  assert.equal(format.dateTime("invalid"), "—");
  assert.equal(format.number(NaN), "—");
}
assert.equal(createFormatters("tr").number(1234.5), "1.234,5");
assert.equal(instant, "2026-01-01T22:30:00Z");
console.log("History locale and formatting checks passed");
