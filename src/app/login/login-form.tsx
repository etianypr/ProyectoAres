"use client";

import { useActionState, useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { login, type LoginState } from "@/lib/auth/acciones";
import { mensajeOlvido } from "@/lib/auth/errores";
import { createClientRecuperarClave } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogIn, Mail } from "lucide-react";

// Sin señal la server action ni llega y antes caía al error genérico de Next
// (spec 033, login-senal). El redirect del login exitoso se relanza tal cual.
async function loginConSenal(prev: LoginState, datos: FormData): Promise<LoginState> {
  try {
    return await login(prev, datos);
  } catch (e) {
    unstable_rethrow(e);
    return { error: "Sin señal. Intenta de nuevo." };
  }
}

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(loginConSenal, {});
  const [olvido, setOlvido] = useState(false);

  if (olvido) return <OlvidoClave onVolver={() => setOlvido(false)} />;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="redirect" value={redirectTo} />
      <Field label="Correo" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          required
        />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
      </Field>

      {state.error ? (
        <p className="rounded-lg bg-danger-bg border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        <LogIn className="h-4 w-4" />
        {pending ? "Ingresando…" : "Iniciar sesión"}
      </Button>
      <button
        type="button"
        onClick={() => setOlvido(true)}
        className="w-full py-1 text-center text-sm font-medium text-brand"
      >
        ¿Olvidaste tu contraseña?
      </button>
    </form>
  );
}

/** Pide el correo y manda el enlace para cambiar la contraseña (spec 033,
 *  login-senal; dueño 2026-11-13). La respuesta es la misma exista o no la
 *  cuenta. El enlace llega a /set-password, que ya acepta type=recovery. */
function OlvidoClave({ onVolver }: { onVolver: () => void }) {
  const [correo, setCorreo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respuesta, setRespuesta] = useState<{ ok: boolean; texto: string } | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setRespuesta(null);
    try {
      const supabase = createClientRecuperarClave();
      const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
        redirectTo: `${window.location.origin}/set-password`,
      });
      setRespuesta(mensajeOlvido(error));
    } catch (err) {
      setRespuesta(mensajeOlvido({ name: err instanceof Error ? err.name : "TypeError", status: 0 }));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Field label="Correo" htmlFor="correo-olvido">
        <Input
          id="correo-olvido"
          type="email"
          autoComplete="email"
          placeholder="tucorreo@ejemplo.com"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
        />
      </Field>
      {respuesta ? (
        <p
          className={
            respuesta.ok
              ? "rounded-lg border border-divider bg-background px-3 py-2 text-sm"
              : "rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-sm text-danger"
          }
        >
          {respuesta.texto}
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full" disabled={enviando}>
        <Mail className="h-4 w-4" />
        {enviando ? "Enviando…" : respuesta && !respuesta.ok ? "Reintentar" : "Mandar el enlace"}
      </Button>
      <button type="button" onClick={onVolver} className="w-full py-1 text-center text-sm font-medium text-muted">
        Volver a iniciar sesión
      </button>
    </form>
  );
}
