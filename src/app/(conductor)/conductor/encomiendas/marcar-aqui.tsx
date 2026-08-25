"use client";

// "Estoy en la puerta": el chofer marca la casa con el GPS del teléfono.
//
// Es el último recurso del sistema de direcciones y, en Arica, el más confiable
// de todos. Ningún proveedor sabe dónde queda una casa sin número —de 23
// direcciones reales, Mapbox tiene la puerta exacta en 2 (npm run sondear)—
// pero el chofer que está parado enfrente sí lo sabe.
//
// Aparece SIEMPRE debajo del campo de dirección, no escondido detrás de un
// error. El motivo es cuándo se usa: el chofer llega, la dirección lo dejó a
// media cuadra, y entra acá desde "Sin ubicar — toca para corregir". En ese
// momento no hay ninguna búsqueda fallida en pantalla que pudiera contenerlo, y
// hacerle buscar el botón con el paquete en la mano sería no haber entendido el
// problema.
//
// Lo que NO hace: decidir por él. El GPS nunca dice "no sé" —siempre devuelve
// una posición, con un radio de error al lado— así que acá se muestran las dos
// cosas, la frase y los metros, y guardar lo decide el chofer. Un punto de
// ±80 m guardado como "la puerta" es el mismo error que veníamos arreglando en
// el geocodificador, ahora con su firma encima. La traducción de metros a frase
// vive en lib/geo/marcar.ts, que sí se puede probar.
import { useState } from "react";
import { Check, Crosshair, Loader2, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { marcaDe, entraSolo, type Marca } from "@/lib/geo/marcar";
import { useUbicacionActual } from "./use-ubicacion-actual";

/** Colores por calidad. Se calculan acá y no en el JSX para que las tres
 *  variantes se lean juntas: es lo único que distingue "andá tranquilo" de
 *  "esto no ubica ni la manzana". */
const TONO = {
  puerta: { caja: "border-ok/30 bg-ok-bg", texto: "text-ok" },
  cuadra: { caja: "border-warn/30 bg-warn-bg", texto: "text-warn" },
  dudosa: { caja: "border-danger/25 bg-danger-bg", texto: "text-danger" },
} as const;

export function MarcarAqui({
  onUsar,
  deshabilitado,
  className,
}: {
  /** El chofer confirmó este punto. Guardar es cosa de quien contiene esto: acá
   *  no se escribe nada en el teléfono. */
  onUsar: (marca: Marca) => void;
  deshabilitado?: boolean;
  className?: string;
}) {
  // El watch del GPS arranca recién al tocar el botón y se apaga al cerrar. La
  // pantalla ya tiene uno propio corriendo para el mapa; este segundo existe
  // solo mientras dura la marca, que son segundos.
  const [marcando, setMarcando] = useState(false);
  const { ubicacion, error, pedirAhora } = useUbicacionActual(marcando);

  // Mientras el watch sigue vivo la lectura se AFINA sola: el radio de error
  // baja de ±40 m a ±6 m en unos segundos. Por eso se recalcula en cada
  // renderizado en vez de congelar la primera lectura, que es la peor.
  const marca = ubicacion ? marcaDe(ubicacion, ubicacion.precisionM) : null;

  function empezar() {
    setMarcando(true);
    pedirAhora();
  }

  if (!marcando) {
    return (
      <button
        type="button"
        disabled={deshabilitado}
        onClick={empezar}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-xl border border-separator bg-card px-3 py-2.5 text-sm font-medium transition-colors active:bg-background disabled:opacity-60",
          className,
        )}
      >
        <Crosshair className="h-4 w-4 shrink-0 text-brand" />
        Estoy en la puerta
      </button>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border border-danger/25 bg-danger-bg p-3", className)}>
        <p className="text-sm font-medium text-danger">{error}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={pedirAhora}
            className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold active:bg-background"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Reintentar
          </button>
          <button
            type="button"
            onClick={() => setMarcando(false)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted active:bg-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (!marca) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border border-separator bg-card px-3 py-2.5 text-sm text-muted",
          className,
        )}
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        Buscando señal…
        <button
          type="button"
          onClick={() => setMarcando(false)}
          className="ml-auto text-xs font-semibold text-muted"
        >
          Cancelar
        </button>
      </div>
    );
  }

  const tono = TONO[marca.calidad];

  return (
    <div className={cn("rounded-xl border p-3", tono.caja, className)}>
      <p className={cn("text-sm font-medium", tono.texto)}>{marca.texto}</p>

      {/* El Plus Code del punto. Está a la vista porque es lo que hace que esta
          casa no haya que buscarla NUNCA MÁS: se dicta por teléfono, se escribe
          en el paquete, y escrito en el campo de dirección se resuelve solo y
          sin red. No se guarda aparte — sale de las coordenadas cada vez. */}
      {marca.codigo ? (
        <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
          <span className="font-mono text-[13px] font-semibold tracking-tight text-foreground select-all">
            {marca.codigo}
          </span>
          <span>anótalo en el paquete: sirve para siempre</span>
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={deshabilitado}
          onClick={() => onUsar(marca)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-60",
            // Cuando la lectura es buena, el botón es el camino obvio. Cuando no
            // lo es, pesa lo mismo pero lleva el color del aviso: se puede
            // guardar igual —el chofer manda— sabiendo qué está guardando.
            entraSolo(marca) ? "bg-ok active:bg-ok/90" : "bg-warn active:bg-warn/90",
          )}
        >
          <Check className="h-3.5 w-3.5" />
          {entraSolo(marca) ? "Usar este punto" : "Guardar así igual"}
        </button>

        <button
          type="button"
          onClick={pedirAhora}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold active:bg-background"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Volver a tomar
        </button>

        <button
          type="button"
          onClick={() => setMarcando(false)}
          className="rounded-lg px-2.5 py-2 text-xs font-semibold text-muted active:bg-white"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
