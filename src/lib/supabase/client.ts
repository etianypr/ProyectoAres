import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/db";

// Cliente de Supabase para componentes del navegador ("use client").
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
