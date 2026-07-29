import { isSupabaseConfigured } from "@/lib/supabase";

export function bootstrapStorage() {
  if (!isSupabaseConfigured()) return;
}
