import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/db";

// Cliente de Supabase para componentes del navegador ("use client").
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Cliente que NO toma la sesión del enlace por su cuenta (detectSessionInUrl:
 *  false): set-password la fija a mano con los tokens del enlace, para que la
 *  contraseña nunca caiga en la cuenta que ya estaba abierta en ese navegador. */
export function createClientSinSesionEnUrl() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { detectSessionInUrl: false } },
  );
}
