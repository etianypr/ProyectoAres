"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClientSinSesionEnUrl as crearClienteSinAutoDeteccion } from "@/lib/supabase/client";
import { inicioSegunRol, leerRol } from "@/lib/auth/roles";
import { esSinSenal, mensajeClave } from "@/lib/auth/errores";
import { LogoDashund } from "@/components/marca/logo-dashund";
import { Bus, LogIn, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// Página a la que llega el link del correo de invitación/reseteo (ver
// invitarConductor en conductores/actions.ts). El link entrega la sesión en el
// fragmento de la URL (#access_token=...&type=invite).
//
// Por qué NO se deja la auto-detección por defecto: si quien abre el link
// ya tenía una sesión activa en ese navegador (ej. un admin logueado), la
// detección automática puede quedarse con la sesión VIEJA en vez de la del
// link, y la contraseña terminaría cambiándose en la cuenta equivocada. Acá
// se cierra cualquier sesión previa a la fuerza y se establece la sesión
// EXPLÍCITAMENTE a partir de los tokens del link — así la contraseña
// siempre se aplica a la cuenta del correo al que se envió la invitación,
// nunca a la que estuviera logueada antes.
type EstadoEnlace = "verificando" | "listo" | "vencido" | "sin-senal";

export default function SetPasswordPage() {
  const router = useRouter();
  // "sin-senal": el enlace no se pudo comprobar por la red, no porque venció
  // (spec 033, link-vencido). Los tokens quedan en memoria para «Reintentar».
  const [estado, setEstado] = useState<EstadoEnlace>("verificando");
  const tokensRef = useRef<{ access_token: string; refresh_token: string } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Devuelve el estado en vez de fijarlo: se fija en el .then (al abrir y en «Reintentar»).
  const procesarLink = useCallback(async (): Promise<EstadoEnlace> => {
    const supabase = crearClienteSinAutoDeteccion();
    try {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash) {
        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const tipo = params.get("type");
        if (access_token && refresh_token && (tipo === "invite" || tipo === "recovery")) {
          tokensRef.current = { access_token, refresh_token };
        }
        // Limpia los tokens de la URL: no deben quedar visibles ni reusables.
        window.history.replaceState(null, "", window.location.pathname);
      }

      const tokens = tokensRef.current;
      if (tokens) {
        // Solo en este navegador: no hace falta red para soltar la sesión previa.
        await supabase.auth.signOut({ scope: "local" });
        const { error: errSet } = await supabase.auth.setSession(tokens);
        if (errSet) {
          return esSinSenal(errSet) ? "sin-senal" : "vencido";
        }
        tokensRef.current = null;
      }

      const { data, error: errUser } = await supabase.auth.getUser();
      if (!data.user && esSinSenal(errUser)) {
        return "sin-senal";
      }
      return data.user ? "listo" : "vencido";
    } catch {
      return "sin-senal";
    }
  }, []);

  useEffect(() => {
    void procesarLink().then(setEstado);
  }, [procesarLink]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    const supabase = crearClienteSinAutoDeteccion();
    let errUpdate: Parameters<typeof mensajeClave>[0] = null;
    try {
      ({ error: errUpdate } = await supabase.auth.updateUser({ password }));
    } catch {
      errUpdate = { name: "TypeError", status: 0 };
    }
    if (errUpdate) {
      setPending(false);
      setError(mensajeClave(errUpdate));
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rol = user ? await leerRol(supabase, user.id) : null;
    router.replace(inicioSegunRol(rol));
    router.refresh();
  }

  // Fondo plano, como /login («Plano»: sin degradados; spec 033, link-vencido).
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f0ec] p-4 text-[#221a15]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoDashund className="mb-3 h-20 w-20" titulo="" />
          <h1 className="text-2xl font-extrabold tracking-tight">ARES</h1>
          <p className="text-sm text-[#6b5f57]">Contraseña nueva</p>
        </div>

        <div className="rounded-2xl bg-card p-6 shadow-xl">
          {estado === "verificando" ? (
            <p className="text-sm text-muted">Verificando enlace…</p>
          ) : estado === "sin-senal" ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
                Sin señal: no se pudo comprobar el enlace.
              </p>
              <Button type="button" size="lg" className="w-full" onClick={() => {
                  setEstado("verificando");
                  void procesarLink().then(setEstado);
                }}>
                <RotateCw className="h-4 w-4" />
                Reintentar
              </Button>
            </div>
          ) : estado === "vencido" ? (
            <div className="space-y-4">
              <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
                Este enlace no es válido o ya venció.
              </p>
              <Link
                href="/login"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-semibold text-white"
              >
                <LogIn className="h-4 w-4" />
                Ir a iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Nueva contraseña" htmlFor="password">
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              <Field label="Confirmar contraseña" htmlFor="confirmar">
                <Input
                  id="confirmar"
                  type="password"
                  autoComplete="new-password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>

              {error ? (
                <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
                  {error}
                </p>
              ) : null}

              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                <Bus className="h-4 w-4" />
                {pending ? "Guardando…" : "Guardar y entrar"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
