"use client";

// Mientras se arma la ruta (terreno 2026-10-29: "puede congelar la pantalla pero
// dejando una pantalla de carga"). La búsqueda a fondo de la ruta con menos
// kilómetros toma unos segundos y la página queda ocupada, así que se tapa todo
// con esto. La barra se mueve con una animación CSS de transform, que el
// navegador sigue dibujando aunque la página esté calculando.
//
// Spec 033 (buscando-trabado, nuevo-armar-fondo): con 86 paradas son 16–22 s sin
// salida, y con ARES en segundo plano la búsqueda se frena. Los segundos dicen que
// avanza, y «Cancelar» (o atrás) vuelve sin propuesta.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogoDashund } from "@/components/marca/logo-dashund";

export function BuscandoRuta({ onCancelar }: { onCancelar?: () => void }) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    const desde = Date.now();
    const reloj = setInterval(() => setSegundos(Math.floor((Date.now() - desde) / 1000)), 1000);
    return () => clearInterval(reloj);
  }, []);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-background px-8 text-center"
    >
      <LogoDashund animado titulo="" className="h-24 w-24" />
      {/* Ya no es la de menos km sino la que menos cuesta en km y tiempo (spec 024). */}
      <p className="text-lg font-extrabold tracking-tight">Buscando la mejor ruta</p>
      <div aria-hidden className="h-1.5 w-44 overflow-hidden rounded-full bg-border">
        <div className="barra-buscando h-full w-1/3 rounded-full bg-brand" />
      </div>
      <p aria-hidden className="-mt-2 font-mono text-sm tabular-nums text-muted">{segundos} s</p>
      {onCancelar ? (
        <button
          type="button"
          onClick={onCancelar}
          className="flex h-11 items-center justify-center rounded-full border border-separator bg-card px-6 text-sm font-semibold text-foreground active:scale-[0.97]"
        >
          Cancelar
        </button>
      ) : null}
    </div>,
    document.body,
  );
}

/** Espera a que la pantalla de carga esté dibujada: el cálculo que viene ocupa
 *  la página, y sin esto la pantalla quedaba quieta antes de mostrarla. */
export function esperarDibujo(): Promise<void> {
  return new Promise((listo) => requestAnimationFrame(() => setTimeout(listo, 0)));
}
