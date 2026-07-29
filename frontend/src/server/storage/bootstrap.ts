import { isSupabaseConfigured } from "@/lib/supabase";
import { setLifecycleStorage } from "@/server/transactions/lifecycleManager";

export function bootstrapStorage() {
  if (!isSupabaseConfigured()) return;
}
