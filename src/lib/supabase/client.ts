import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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

/** Para «¿Olvidaste tu contraseña?» (spec 033, login-senal): flujo implícito, para
 *  que el enlace del correo llegue a /set-password con los tokens en el fragmento
 *  (#access_token=…&type=recovery), igual que los enlaces que genera el jefe. El
 *  cliente de @supabase/ssr usa PKCE y mandaría un ?code= que esa página no lee.
 *  No guarda sesión: solo pide el correo. */
export function createClientRecuperarClave() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
