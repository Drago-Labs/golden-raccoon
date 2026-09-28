import type { TranslationMeta } from "./schema";

export type TranslateInput = { title: string; summary: string | null; language: string };

/** Bounded adapter: original text is always retained. */
export function translateArticle(input: TranslateInput, deps: { fail?: boolean; confidence?: number } = {}): TranslationMeta {
  if (deps.fail) {
    return {
      originalTitle: input.title,
      originalSummary: input.summary,
      translatedTitle: null,
      translatedSummary: null,
      translator: "fixture-translator",
      translatorVersion: "0.1.0",
      confidence: 0,
      state: "failed",
      needsManualReview: true,
    };
  }
  if (input.language === "en") {
    return {
      originalTitle: input.title,
      originalSummary: input.summary,
      translatedTitle: input.title,
      translatedSummary: input.summary,
      translator: "identity",
      translatorVersion: "0.1.0",
      confidence: 1,
      state: "skipped",
      needsManualReview: false,
    };
  }
  const confidence = deps.confidence ?? 0.92;
  return {
    originalTitle: input.title,
    originalSummary: input.summary,
    translatedTitle: `[en] ${input.title}`,
    translatedSummary: input.summary ? `[en] ${input.summary}` : null,
    translator: "fixture-translator",
    translatorVersion: "0.1.0",
    confidence,
    state: confidence < 0.7 ? "low_confidence" : "ok",
    needsManualReview: confidence < 0.7,
  };
}
