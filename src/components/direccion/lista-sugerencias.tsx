"use client";

// La lista de direcciones que ofrece el campo mientras se escribe, cada renglón
// con su proveedor y sus marcas de calidad (sale de direccion-input.tsx, spec 002
// T041).

import type { RefObject } from "react";
import { MapPin, SearchX } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { NOMBRE_FUENTE, type SugerenciaDireccion } from "@/lib/geo/geocoding";

/** Las marcas que le corresponden a una sugerencia, de la más grave a la menos.
 *
 *  Se calculan acá y no dentro del JSX para que el orden sea explícito: si un
 *  resultado tiene dos problemas, el conductor tiene que leer primero el que lo
 *  manda a otra cuadra. */
function marcasDe(s: SugerenciaDireccion): { texto: string; grave: boolean }[] {
  const marcas: { texto: string; grave: boolean }[] = [];

  // El más peligroso primero: el renglón se ve normal —calle correcta, un número
  // ahí puesto— y sin embargo ese número no existe en esa calle.
  if (s.coincideNumero === false) marcas.push({ texto: "otro número", grave: true });
  if (s.soloCalle) marcas.push({ texto: "sin número", grave: false });
  if (s.confianza === "baja") marcas.push({ texto: "poco preciso", grave: false });

  return marcas;
}

export function ListaSugerencias({
  listaRef,
  id,
  lista,
  resaltada,
  onResaltar,
  onElegir,
  buscando,
  sinResultados,
  consulta,
  onUsarTalCual,
}: {
  listaRef: RefObject<HTMLUListElement | null>;
  id?: string;
  lista: SugerenciaDireccion[];
  resaltada: number;
  onResaltar: (i: number) => void;
  onElegir: (s: SugerenciaDireccion) => void;
  buscando: boolean;
  sinResultados: boolean;
  /** Lo que se escribió, para ofrecer usarlo tal cual. */
  consulta: string;
  /** Darla por buena tal como está escrita; null = la pantalla no lo permite. */
  onUsarTalCual: (() => void) | null;
}) {
  return (
    <ul
          ref={listaRef}
          id={id}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto overflow-x-hidden rounded-xl border border-separator bg-card py-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
        >
          {lista.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === resaltada}>
              <button
                type="button"
                // El blur del campo llega antes que el clic: con el mouse esto
                // evita que el campo lo pierda; en el teléfono lo cubre la
                // espera de MS_CIERRE_TRAS_BLUR.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onElegir(s)}
                onMouseEnter={() => onResaltar(i)}
                className={cn(
                  "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                  i === resaltada ? "bg-brand-soft" : "bg-card",
                )}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium leading-tight">
                    {s.direccion}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {s.detalle ? <span className="min-w-0 truncate">{s.detalle}</span> : null}
                    {/* De qué proveedor salió, SIEMPRE y no solo en OSM: saber
                        que una dirección la resolvió Mapbox y la otra
                        OpenStreetMap es lo que explica por qué una trae número y
                        la otra no. El nombre sale de NOMBRE_FUENTE y no de un
                        ternario acá: el `else` etiquetaba como "Mapbox" todo lo
                        que no fuera OSM. */}
                    <span className="shrink-0 rounded bg-background px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                      {NOMBRE_FUENTE[s.fuente]}
                    </span>
                  </span>
                </span>
                {/* Las marcas de calidad. Van a la derecha, donde el pulgar no
                    las tapa al recorrer la lista. */}
                {marcasDe(s).map((m) => (
                  <span
                    key={m.texto}
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                      m.grave ? "bg-danger-bg text-danger" : "bg-warn-bg text-warn",
                    )}
                  >
                    {m.texto}
                  </span>
                ))}
              </button>
            </li>
          ))}
      
          {buscando && lista.length === 0 ? (
            <li className="px-3 py-2.5 text-xs text-muted">Buscando direcciones…</li>
          ) : null}
      
          {sinResultados ? (
            <li>
              <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted">
                <SearchX className="h-3.5 w-3.5 shrink-0" />
                No encontramos esa dirección.
              </p>
              {onUsarTalCual ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onUsarTalCual}
                  className="flex w-full items-start gap-2 border-t border-separator px-3 py-2.5 text-left transition-colors active:bg-background"
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium leading-tight">
                      Usar &laquo;{consulta}&raquo; tal como está
                    </span>
                    {/* Antes decía "hay que marcar el punto a mano" y ese
                        flujo no existía en ninguna parte: era una promesa que
                        la pantalla no podía cumplir. Ahora hay dos caminos y
                        los dos están a un toque, así que se nombran. */}
                    <span className="block text-xs text-muted">
                      Queda sin ubicar. Para ubicarla: &laquo;Estoy en la puerta&raquo;, o pega
                      su Plus Code acá.
                    </span>
                  </span>
                </button>
              ) : (
                <p className="px-3 pb-2.5 text-xs text-muted">
                  Puedes guardarla igual y corregirla después.
                </p>
              )}
            </li>
          ) : null}
        </ul>
  );
}
