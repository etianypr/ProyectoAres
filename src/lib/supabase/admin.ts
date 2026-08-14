import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con la llave service_role: bypassa RLS por completo y puede
// invitar/crear usuarios (Auth Admin API). SOLO se importa desde Server
// Actions — nunca desde un archivo "use client" ni se expone al navegador.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno (Supabase > Settings > API > service_role).",
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
