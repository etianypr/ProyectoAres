"use client";

// Lo de arriba del mapa: el menú, escanear, el resumen del día y los avisos del
// GPS (sale de pantalla.tsx, spec 002 T037). El cartel de maniobras se fue con
// la navegación de ARES: guía Google Maps (spec 020).

import { Check, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { BotonMenu } from "./menu-lateral";

/** La caja del carril de arriba del mapa. */
const CAJA_CARRIL = "flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2 shadow-card";

// Cómo va el día, para el carril de arriba del mapa: entregadas sobre el
// total, y las que no se pudieron entregar solo si hay alguna. Lo que falta no
// se escribe — es la resta, y una cifra más es una cifra que hay que descartar
// antes de leer la que importa.
//
// Vive arriba y no en la hoja porque es el único dato que el conductor quiere de
// reojo, sin abrir nada. Se dibuja SIEMPRE que haya ruta.
export function ResumenDelDia({
  entregadas,
  total,
  noEntregadas,
}: {
  entregadas: number;
  total: number;
  noEntregadas: number;
}) {
  return (
  <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-semibold leading-tight">
      <span className="flex items-center gap-1 tabular-nums text-ok">
        <Check className="h-3.5 w-3.5 shrink-0" />
        {entregadas}/{total}
      </span>
      {noEntregadas > 0 ? (
        <span className="flex items-center gap-1 tabular-nums text-danger">
          <X className="h-3.5 w-3.5 shrink-0" />
          {noEntregadas}
        </span>
      ) : null}
    </div>
  );
}

export function CarrilSuperior({
  altoNotificaciones,
  onAbrirMenu,
  onEscanear,
  resumen,
  errorUbicacion,
  señalDebil,
}: {
  /** Lo que ocupan los avisos de arriba: el carril se corre para abajo. */
  altoNotificaciones: number;
  onAbrirMenu: () => void;
  /** null = no hay pedidos que escanear. */
  onEscanear: (() => void) | null;
  /** Cómo va el día (entregadas/total), o null sin ruta. */
  resumen: React.ReactNode;
  errorUbicacion: string | null;
  señalDebil: boolean;
}) {
  // Se corre para abajo lo que ocupen los avisos, en vez de quedar tapado por
  // ellos.
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-brand shadow-md active:bg-background"
          >
            <ScanLine className="h-4 w-4" />
          </button>
        ) : null}
        {resumen ? <div className={cn(CAJA_CARRIL, "ml-auto")}>{resumen}</div> : null}
      </div>
    
      {errorUbicacion ? (
        <p className="rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn shadow-md">
          {errorUbicacion}
        </p>
      ) : señalDebil ? (
        <p className="self-start rounded-full bg-warn-bg px-3 py-1.5 text-xs text-warn shadow-md">
          GPS débil
        </p>
      ) : null}
    </div>
  );
}
