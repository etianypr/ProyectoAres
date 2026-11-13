"use client";

// «Cerrar sesión» del conductor, uno solo para el menú, la pantalla de error («No
// se pudo abrir tu ruta») y la de cuenta sin vincular o desactivada (spec 033,
// error-logout). Antes solo el menú confirmaba y borraba: las otras dos cerraban la
// sesión de golpe y dejaban los pedidos en el teléfono.
//
// Pide confirmación, dice cuántos registros quedan sin enviar y cierra en el orden
// de lib/encomiendas/local/salida.ts: primero la sesión, después el borrado. Sin
// señal no se cierra ni se borra nada.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, RotateCw } from "lucide-react";
import { cerrarSesion } from "@/lib/auth/acciones";
import { leerCola } from "@/lib/encomiendas/local/almacen";
import { salirYBorrar } from "@/lib/encomiendas/local/salida";
import { cn } from "@/lib/comun/utils";

export function useCerrarSesion() {
  // null = sin pedir confirmación. sinEnviar null = no se pudo leer la cola.
  const [confirmando, setConfirmando] = useState<{ sinEnviar: number | null } | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pedir() {
    setError(null);
    try {
      setConfirmando({ sinEnviar: (await leerCola()).length });
    } catch {
      setConfirmando({ sinEnviar: null });
    }
  }

  async function salir() {
    setSaliendo(true);
    setError(null);
    const r = await salirYBorrar({ cerrarSesion: () => cerrarSesion() });
    if (r.estado === "listo") {
      // Recarga entera: no queda nada del día en la memoria de la pantalla. Si el
      // borrado falló, /login lo termina (BorradoPendiente).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a propósito: recarga entera
      window.location.assign("/login");
      return;
    }
    setSaliendo(false);
    setError(
      r.estado === "sin-senal"
        ? "Sin señal: no se cerró la sesión. No se borró nada."
        : "No se pudo cerrar la sesión. No se borró nada.",
    );
  }

  return { confirmando, saliendo, error, pedir, salir, cancelar: () => setConfirmando(null) };
}

export type CerrarSesion = ReturnType<typeof useCerrarSesion>;

/** La confirmación (ya pedida con `pedir`). */
export function ConfirmarSalida({ salida, className }: { salida: CerrarSesion; className?: string }) {
  const sinEnviar = salida.confirmando?.sinEnviar;
  return (
    <div className={cn("space-y-3 text-left", className)}>
      <p className="text-sm">
        Se borran de este teléfono los pedidos y las rutas. Quedan solo las cifras de cada día.
      </p>
      {sinEnviar == null ? (
        <p className="text-sm font-medium text-warn">No se pudo leer el teléfono: puede haber registros sin enviar.</p>
      ) : sinEnviar > 0 ? (
        <p className="text-sm font-medium text-warn">
          Hay {sinEnviar} {sinEnviar === 1 ? "registro" : "registros"} sin enviar: salen cuando vuelvas a entrar
          con esta cuenta.
        </p>
      ) : null}
      {salida.error ? <p className="text-sm font-medium text-danger">{salida.error}</p> : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={salida.saliendo}
          onClick={() => void salida.salir()}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-danger text-sm font-semibold text-white disabled:opacity-50"
        >
          {salida.error ? <RotateCw className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
          {salida.saliendo ? "Saliendo…" : salida.error ? "Reintentar" : "Cerrar sesión"}
        </button>
        <button
          type="button"
          disabled={salida.saliendo}
          onClick={salida.cancelar}
          className="h-11 rounded-full px-4 text-sm font-medium text-muted active:bg-card"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** El botón secundario con su confirmación, para las pantallas sin menú. */
export function BotonCerrarSesion({ className }: { className?: string }) {
  const salida = useCerrarSesion();
  if (salida.confirmando) return <ConfirmarSalida salida={salida} className={cn("w-full max-w-xs", className)} />;
  return (
    <button
      type="button"
      onClick={() => void salida.pedir()}
      className={cn("flex items-center gap-2 text-sm text-muted", className)}
    >
      <LogOut className="h-4 w-4" />
      Cerrar sesión
    </button>
  );
}

/** «Reintentar» que vuelve a preguntarle al servidor (cuenta sin vincular o
 *  desactivada: apenas el jefe la arregla, entra sin cerrar sesión). */
export function BotonReintentar() {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() => empezar(() => router.refresh())}
      className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
    >
      <RotateCw className={cn("h-4 w-4", pendiente && "animate-spin")} />
      {pendiente ? "Revisando…" : "Reintentar"}
    </button>
  );
}
