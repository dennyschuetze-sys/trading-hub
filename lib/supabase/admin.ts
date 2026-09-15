import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Supabase mit Secret Key – umgeht Row Level Security. Nur für Server-Aufgaben ohne
 * eingeloggten Benutzer (Cron) und für Felder, die Benutzer nicht selbst setzen dürfen.
 * Abfragen müssen deshalb immer selbst nach user_id bzw. account_id filtern.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;
