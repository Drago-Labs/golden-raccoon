import type { Locale } from "./config";
const en = {
  "history": "History",
  "recommendations": "Recommendations",
  "approvals": "Approvals",
  "transactions": "Transactions",
  "agentRuns": "Agent runs",
  "savedRuns": "Saved runs",
  "savedAgentRuns": "Saved agent runs",
  "recommendation": "Recommendation",
  "target": "Target",
  "score": "Score",
  "confidence": "Confidence",
  "status": "Status",
  "created": "Created",
  "portfolio": "Portfolio",
  "emptyRuns": "No saved agent runs yet. Run portfolio agents from the dashboard to create the first record.",
  "recentActivity": "Recent activity",
  "emptyRecommendations": "No recommendation records yet.",
  "walletConfirmed": "Wallet confirmed",
  "emptyApprovals": "No wallet approvals yet.",
  "emptyTransactions": "No stored transactions yet.",
  "language": "Language"
} as const;
const tr = {
  "history": "Geçmiş",
  "recommendations": "Öneriler",
  "approvals": "Onaylar",
  "transactions": "İşlemler",
  "agentRuns": "Ajan çalışmaları",
  "savedRuns": "Kayıtlı çalışmalar",
  "savedAgentRuns": "Kayıtlı ajan çalışmaları",
  "recommendation": "Öneri",
  "target": "Hedef",
  "score": "Puan",
  "confidence": "Güven",
  "status": "Durum",
  "created": "Oluşturulma",
  "portfolio": "Portföy",
  "emptyRuns": "Henüz kayıtlı ajan çalışması yok. İlk kaydı oluşturmak için kontrol panelinden portföy ajanlarını çalıştırın.",
  "recentActivity": "Son etkinlikler",
  "emptyRecommendations": "Henüz öneri kaydı yok.",
  "walletConfirmed": "Cüzdan onayladı",
  "emptyApprovals": "Henüz cüzdan onayı yok.",
  "emptyTransactions": "Henüz kayıtlı işlem yok.",
  "language": "Dil"
} satisfies Record<keyof typeof en, string>;
export type MessageKey = keyof typeof en;
export function messages(locale: Locale) {
  const catalog = locale === "tr" ? tr : en;
  return (key: MessageKey): string => {
    if (!Object.hasOwn(catalog, key)) throw new Error("Unknown translation key");
    return catalog[key];
  };
}
