"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientSinSesionEnUrl as crearClienteSinAutoDeteccion } from "@/lib/supabase/client";
import { inicioSegunRol, leerRol } from "@/lib/auth/roles";
import { Bus, KeyRound } from "lucide-react";
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
export default function SetPasswordPage() {
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);
  const [sinSesion, setSinSesion] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = crearClienteSinAutoDeteccion();

    async function procesarLink() {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      const tipo = params.get("type");

      if (access_token && refresh_token && (tipo === "invite" || tipo === "recovery")) {
        await supabase.auth.signOut();
        const { error: errSet } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        // Limpia los tokens de la URL: no deben quedar visibles ni reusables.
        window.history.replaceState(null, "", window.location.pathname);
        if (errSet) {
          setError(null);
          setSinSesion(true);
          setVerificando(false);
          return;
        }
      }

      const { data } = await supabase.auth.getUser();
      setSinSesion(!data.user);
      setVerificando(false);
    }

    procesarLink();
  }, []);

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
    const { error: errUpdate } = await supabase.auth.updateUser({ password });
    if (errUpdate) {
      setPending(false);
      setError(errUpdate.message);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const rol = user ? await leerRol(supabase, user.id) : null;
    router.replace(inicioSegunRol(rol));
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand to-brand-dark p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
            <KeyRound className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-semibold">Gestión de encomiendas</h1>
          <p className="text-sm text-white/70">Crea tu contraseña para continuar</p>
        </div>

        <div className="rounded-2xl bg-card p-6 shadow-xl">
          {verificando ? (
            <p className="text-sm text-muted">Verificando enlace…</p>
          ) : sinSesion ? (
            <p className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger">
              Este enlace no es válido o ya expiró. Pide una nueva invitación al
              administrador.
            </p>
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
