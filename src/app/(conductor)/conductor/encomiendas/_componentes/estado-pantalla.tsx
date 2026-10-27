"use client";

// La pantalla del conductor mientras abre su día, y cuando no lo pudo abrir (sale de
// pantalla.tsx, spec 002 T037).

import { LogOut, RotateCw } from "lucide-react";

export function PantallaCargando() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted">
      Cargando tu ruta…
    </div>
  );
}

export function PantallaError({ error, logout }: { error: string; logout: () => Promise<void> }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <p className="text-lg font-semibold">No se pudo abrir tu ruta</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{error}</p>
      {/* Acá había un "Volver al inicio" al hub. Ahora el hub reenvía a esta
          misma pantalla, así que ese link era un rebote infinito justo para
          el conductor que ya no puede trabajar. Las dos salidas reales son
          volver a intentar —el fallo suele ser el almacén del teléfono, que
          a veces anda al recargar— y salir de la sesión. */}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-white"
      >
        <RotateCw className="h-4 w-4" />
        Reintentar
      </button>
      <form action={logout} className="mt-6">
        <button type="submit" className="flex items-center gap-2 text-sm text-muted">
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </form>
    </div>
  );
}
