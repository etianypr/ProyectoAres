"use client";

// Mientras se arma la ruta (terreno 2026-10-29: "puede congelar la pantalla pero
// dejando una pantalla de carga"). La búsqueda a fondo de la ruta con menos
// kilómetros toma unos segundos y la página queda ocupada, así que se tapa todo
// con esto. La barra se mueve con una animación CSS de transform, que el
// navegador sigue dibujando aunque la página esté calculando.
import { createPortal } from "react-dom";
import { LogoDashund } from "@/components/marca/logo-dashund";

export function BuscandoRuta() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-in fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-background px-8 text-center"
    >
      <LogoDashund animado titulo="" className="h-24 w-24" />
      <p className="text-lg font-extrabold tracking-tight">Buscando la ruta más corta</p>
      <div aria-hidden className="h-1.5 w-44 overflow-hidden rounded-full bg-border">
        <div className="barra-buscando h-full w-1/3 rounded-full bg-brand" />
      </div>
    </div>,
    document.body,
  );
}

/** Espera a que la pantalla de carga esté dibujada: el cálculo que viene ocupa
 *  la página, y sin esto la pantalla quedaba quieta antes de mostrarla. */
export function esperarDibujo(): Promise<void> {
  return new Promise((listo) => requestAnimationFrame(() => setTimeout(listo, 0)));
}
