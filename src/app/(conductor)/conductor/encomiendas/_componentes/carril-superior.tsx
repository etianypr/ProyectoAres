"use client";

// Lo de arriba del mapa: el menú, escanear, el cartel de navegación con el
// resumen del día adentro y los avisos del GPS (sale de pantalla.tsx, spec 002
// T037).

import { ScanLine } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import type { Navegacion } from "../_hooks/use-navegacion";
import { BotonMenu } from "./menu-lateral";
import { CAJA_CARRIL, InstruccionNavegacion } from "./instruccion-navegacion";

export function CarrilSuperior({
  altoNotificaciones,
  onAbrirMenu,
  onEscanear,
  navegacion,
  resumen,
  errorUbicacion,
  señalDebil,
}: {
  /** Lo que ocupan los avisos de arriba: el carril se corre para abajo. */
  altoNotificaciones: number;
  onAbrirMenu: () => void;
  /** null = no hay pedidos que escanear. */
  onEscanear: (() => void) | null;
  /** null con una propuesta a la vista. */
  navegacion: Navegacion | null;
  /** Cómo va el día (entregadas/total), o null sin ruta. */
  resumen: React.ReactNode;
  errorUbicacion: string | null;
  señalDebil: boolean;
}) {
  // Se corre para abajo lo que ocupen los avisos, en vez de quedar tapado por
  // ellos: el cartel de navegación es lo que el conductor está leyendo para saber
  // dónde doblar.
  return (
    <div
      className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex flex-col gap-2 transition-[margin-top] duration-200"
      style={{ marginTop: altoNotificaciones }}
    >
      <div className="flex items-center gap-2">
        {/* Donde estaba la flecha de volver. Se fue con el hub: entrar ya no
            pasa por un menú, así que no hay nada atrás. Lo que el hub sí
            guardaba —quién está y cómo cerrar sesión— vive ahora acá adentro,
            junto con los días. */}
        <BotonMenu onAbrir={onAbrirMenu} />
        {/* Escanear la etiqueta de cada paquete (spec 005): dice su parada. */}
        {onEscanear ? (
          <button
            type="button"
            onClick={onEscanear}
            aria-label="Escanear etiqueta"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand shadow-md active:bg-background"
          >
            <ScanLine className="h-4 w-4" />
          </button>
        ) : null}
        {navegacion?.paso ? (
          <InstruccionNavegacion
            paso={navegacion.paso}
            siguiente={navegacion.siguiente}
            metros={navegacion.metrosAManiobra}
            resumen={resumen}
          />
        ) : resumen ? (
          // Sin maniobra queda el mismo cartel, en el mismo lugar, con el
          // resumen solo. Pegado a la derecha (ml-auto) para que no se mueva
          // de costado cuando la navegación aparece o se corta: el número
          // termina siempre en el mismo borde.
          <div className={cn(CAJA_CARRIL, "ml-auto")}>{resumen}</div>
        ) : null}
      </div>
    
      {errorUbicacion ? (
        <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn shadow-md">
          {errorUbicacion}
        </p>
      ) : señalDebil ? (
        <p className="self-start rounded-full bg-warn-bg px-3 py-1.5 text-xs text-warn shadow-md">
          Señal de GPS débil: la ubicación puede estar desactualizada.
        </p>
      ) : null}
    </div>
  );
}
