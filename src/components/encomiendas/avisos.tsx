"use client";

// ----------------------------------------------------------------------------
// Los avisos de la app del conductor: caen desde arriba y se quedan arriba
// ----------------------------------------------------------------------------
//
// UN solo lugar para todos. Antes cada uno se dibujaba donde había nacido —el
// de la entrega registrada sobre la hoja, el de "pedido agregado" al pie del
// formulario, el de un pedido eliminado en otro borde— y ninguno estaba donde el
// anterior: cada aviso aparecía en un sitio distinto de la pantalla según lo que
// se hubiera tocado. Eso es lo que hace que un aviso se lea recién a la tercera
// vez, cuando ya se está yendo.
//
// Arriba, y no abajo, por una razón concreta de esta app: la hoja se abre hasta
// ocupar casi toda la pantalla, y "el borde de abajo" es entonces media pantalla,
// encima de la lista que el chofer está mirando. El borde de arriba es siempre el
// borde.
//
// Lo que hay debajo se corre, no se tapa: la flecha de volver y el cartel de
// navegación son lo que se está leyendo para saber dónde doblar (ver ALTO_AVISO).

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** El aire entre el último aviso y lo que quedó debajo. */
const SEPARACION = 8;

export type Aviso = {
  /** Identifica ESTA aparición, no el tipo de aviso. Dos confirmaciones seguidas
   *  tienen que traer ids distintos: es lo que hace que la segunda se vuelva a
   *  animar en vez de dejar el cartel de la primera quieto ahí. */
  id: string;
  icono: React.ReactNode;
  texto: string;
  /** "error" lo pinta rojo y NO lo recorta a un renglón: el mensaje de un fallo
   *  es lo único que dice qué hacer (instalar la app, salir del modo privado), y
   *  cortarlo a la mitad lo vuelve inútil. Los demás son de un renglón. */
  tono?: "neutro" | "error";
  /** El botón de la derecha, si el aviso ofrece algo. Sin acción, el aviso no
   *  recibe toques: se apoya unos segundos sobre lo que haya debajo y no tiene
   *  por qué robarle un toque destinado a eso. */
  accion?: {
    etiqueta: string;
    icono?: React.ReactNode;
    onClick: () => void;
  };
};

export function PilaAvisos({
  avisos,
  onAltura,
}: {
  avisos: Aviso[];
  /** Cuánto ocupa la pila, para que la pantalla corra hacia abajo lo que había
   *  en esa franja. Se mide y no se calcula por la cantidad de avisos: el de un
   *  fallo lleva el mensaje entero y ocupa dos renglones, y un número fijo ahí
   *  deja la flecha de volver debajo del cartel. 0 con la pila vacía. */
  onAltura?: (px: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // El contenedor se dibuja siempre, vacío o no: sin avisos mide cero y no
  // intercepta nada, y así el observador no hay que montarlo y desmontarlo con
  // cada aviso que entra.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new ResizeObserver(() =>
      onAltura?.(el.offsetHeight > 0 ? el.offsetHeight + SEPARACION : 0),
    );
    observador.observe(el);
    onAltura?.(el.offsetHeight > 0 ? el.offsetHeight + SEPARACION : 0);
    return () => observador.disconnect();
  }, [onAltura]);

  return (
    <div
      ref={ref}
      className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 flex flex-col gap-2"
    >
      {avisos.map((aviso) => (
        <div
          key={aviso.id}
          role="status"
          className={cn(
            "animate-slide-down flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-lg",
            aviso.tono === "error" ? "bg-danger" : "bg-foreground",
            !aviso.accion && "pointer-events-none",
          )}
        >
          <span className="flex shrink-0 items-center">{aviso.icono}</span>
          <p
            className={cn(
              "min-w-0 flex-1 text-sm",
              aviso.tono === "error" ? "text-pretty" : "truncate",
            )}
          >
            {aviso.texto}
          </p>
          {aviso.accion ? (
            <button
              type="button"
              onClick={aviso.accion.onClick}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold active:bg-white/25"
            >
              {aviso.accion.icono}
              {aviso.accion.etiqueta}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
