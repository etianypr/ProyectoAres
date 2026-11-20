"use client";

// Adelantar OpenStreetMap mientras el conductor revisa las líneas de la guía (spec 038,
// autorizado por el dueño; solo Nominatim, nunca Google). Nominatim va de a una consulta cada
// 1,2 s: ubicar una guía de 30 líneas esperaba ~36 s solo en su fila. Mientras se revisan las
// líneas se le va preguntando, con prioridad baja, exactamente lo que preguntará la carga
// (consultaOsmDe), y la respuesta queda en la caché del día: al tocar «Crear N pedidos» OSM ya
// contestó y lo que queda es Google. Nada cambia en la pantalla.
//
// Una línea editada o quitada saca su consulta de la fila (si no tenía turno, no lo gasta) y
// la nueva entra. Cerrar, deshacer o crear corta todo (`parar`).

import { useCallback, useEffect, useRef } from "react";
import { adelantarNominatim, consultaOsmDe } from "@/lib/geo/geocoding";

/** `destinos`: la dirección que tendrá cada pedido, o null cuando no se está revisando. */
export function useAdelantoOsm(destinos: string[] | null): () => void {
  /** Consulta de OSM → su corte, mientras no termina. */
  const enCurso = useRef(new Map<string, AbortController>());
  const parar = useCallback(() => {
    for (const control of enCurso.current.values()) control.abort();
    enCurso.current.clear();
  }, []);

  // Un arreglo nuevo con las mismas direcciones no vuelve a correr el efecto.
  const clave = destinos ? JSON.stringify(destinos) : null;
  useEffect(() => {
    if (clave == null) {
      parar();
      return;
    }
    const actuales = enCurso.current;
    // La consulta pasa por el catálogo de calles (spec 044), que se carga la primera vez: una
    // revisión que cambió mientras tanto no lanza nada.
    let vigente = true;
    void (async () => {
      const consultas = new Map<string, string>();
      for (const destino of JSON.parse(clave) as string[]) {
        const q = await consultaOsmDe(destino);
        if (q && !consultas.has(q)) consultas.set(q, destino);
      }
      if (!vigente) return;
      for (const [q, control] of actuales) {
        if (consultas.has(q)) continue;
        control.abort();
        actuales.delete(q);
      }
      for (const [q, destino] of consultas) {
        if (actuales.has(q)) continue;
        const control = new AbortController();
        actuales.set(q, control);
        void adelantarNominatim(destino, control.signal).finally(() => {
          if (actuales.get(q) === control) actuales.delete(q);
        });
      }
    })();
    return () => {
      vigente = false;
    };
  }, [clave, parar]);

  // Cerrar la ventana a la fuerza (otra pantalla) también corta.
  useEffect(() => parar, [parar]);
  return parar;
}
