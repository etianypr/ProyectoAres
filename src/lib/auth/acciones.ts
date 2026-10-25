"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoPermitido, inicioSegunRol, leerRol } from "./roles";

export type LoginState = { error?: string };

export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") ?? "/") || "/";

  if (!email || !password) {
    return { error: "Ingresa tu correo y contraseña." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Correo o contraseña incorrectos." };
  }

  // El destino depende del ROL, no solo de a dónde iba antes: el proxy pone
  // ?redirect=<ruta> con la página que el usuario intentó abrir sin sesión, y
  // si eso apunta al panel, un conductor terminaría en una pantalla donde RLS le
  // niega casi todo. Solo se respeta el destino guardado si es coherente con
  // su rol; si no, cada uno arranca en su propio inicio.
  const rol = data.user ? await leerRol(supabase, data.user.id) : null;
  redirect(destinoPermitido(rol, redirectTo) ? redirectTo : inicioSegunRol(rol));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
