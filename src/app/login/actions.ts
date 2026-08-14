"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inicioSegunRol } from "@/lib/auth";
import type { RolUsuario } from "@/types/db";

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
  // si eso apunta al panel, un chofer terminaría en una pantalla donde RLS le
  // niega casi todo. Solo se respeta el destino guardado si es coherente con
  // su rol; si no, cada uno arranca en su propio inicio.
  const { data: perfil } = data.user
    ? await supabase.from("perfiles").select("rol").eq("id", data.user.id).maybeSingle()
    : { data: null };
  const rol = (perfil?.rol as RolUsuario | undefined) ?? null;
  const inicio = inicioSegunRol(rol);

  const destinoValido =
    redirectTo.startsWith("/") &&
    !redirectTo.startsWith("//") &&
    (rol === "chofer" ? redirectTo.startsWith("/conductor") : !redirectTo.startsWith("/conductor"));

  redirect(destinoValido ? redirectTo : inicio);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
