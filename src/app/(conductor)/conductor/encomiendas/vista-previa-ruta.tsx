"use client";

// Previsualización de la ruta recién calculada: se muestra ANTES de guardarla,
// con el recorrido dibujado en el mapa detrás (ver ruta-mapa.tsx, prop "previa")
// y acá el detalle — cuántas paradas, cuántos kilómetros, cuánto va a demorar y
// en qué orden va a pasar.
//
// Va como panel fijo sobre la hoja deslizable y no dentro de ella: la hoja
// abierta tapa tres cuartos de la pantalla, y lo que hay que ver justo ahora es
// el mapa con la ruta propuesta. La hoja se cierra sola al aparecer esto (ver
// BottomSheet, prop "senalCerrar").

import { useState } from "react";
import { Check, CloudOff, MapPinOff, PackageCheck, Route, X } from "lucide-react";
import { formatDistancia, formatDuracion } from "@/lib/format";
import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";

// Mismas medidas que los botones de la tarjeta de la parada activa (ver
// ruta-conductor.tsx): 48 px de alto, para el pulgar y sin mirar mucho.
const BOTON_PRINCIPAL =
  "flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground shadow-[0_1px_2px_rgba(11,93,86,0.3)] transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

function Aviso({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mt-2 flex shrink-0 items-start gap-2 rounded-xl bg-warn-bg px-3 py-2 text-xs text-warn">
      <span className="mt-0.5 shrink-0">{icono}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  );
}

export function VistaPreviaRuta({
  propuesta,
  onUsar,
  onDescartar,
}: {
  propuesta: PropuestaRuta;
  /** Guarda la ruta en el teléfono (ver confirmarRutaLocal). */
  onUsar: () => Promise<void>;
  onDescartar: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function usar() {
    setError(null);
    setGuardando(true);
    try {
      await onUsar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la ruta en el teléfono.");
    } finally {
      setGuardando(false);
    }
  }

  const { paradas, distanciaM, duracionS, sinUbicar, sinTrazado, cerradas } = propuesta;

  // Los números arrancan DESPUÉS de las paradas ya cerradas hoy, que al guardar
  // quedan primero (ver guardarRuta): así el "5" de esta lista es el mismo "5"
  // que va a mostrar el mapa y la ruta del día cuando la acepte.
  const numero = (i: number) => cerradas + i + 1;

  return (
    // Columna con tope de alto: en un teléfono chico, una ruta larga más dos
    // avisos podía empujar los botones fuera de la pantalla. Lo único que cede
    // espacio es la lista de paradas (min-h-0 flex-1); el resumen y los botones
    // están siempre a la vista.
    //
    // La mitad de la pantalla, no el 85%: este panel se abre sobre la jornada,
    // donde el mapa que dibuja la ruta propuesta es una tarjeta que queda ARRIBA
    // (ver pantalla.tsx). Con el tope viejo el panel la tapaba entera, así que
    // se veían los kilómetros y el tiempo de una ruta que no se podía mirar.
    <div className="flex max-h-[52vh] flex-col rounded-t-2xl bg-white px-4 pb-5 pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.18)]">
      <div className="flex shrink-0 items-center gap-2">
        <Route className="h-4 w-4 shrink-0 text-brand" />
        <p className="flex-1 text-sm font-semibold">Ruta propuesta</p>
        <span className="text-xs font-medium tabular-nums text-muted">
          {paradas.length === 1 ? "1 parada" : `${paradas.length} paradas`}
        </span>
      </div>

      {distanciaM != null && duracionS != null ? (
        <div className="mt-2.5 flex shrink-0 items-center gap-2 text-sm">
          <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold tabular-nums text-brand">
            {formatDistancia(distanciaM)}
          </span>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 font-semibold tabular-nums text-brand">
            {formatDuracion(duracionS)}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            manejando, sin contar las entregas
          </span>
        </div>
      ) : null}

      {/* El orden es lo que el chofer viene a revisar: se puede desplazar, pero
          sin comerse la pantalla — el mapa de atrás también es parte de esto. */}
      <ol className="mt-3 min-h-0 max-h-[17vh] flex-1 overflow-y-auto rounded-2xl bg-background">
        {paradas.map((p, i) => (
          <li
            key={p.id}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm ${i > 0 ? "border-t border-divider" : ""}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold tabular-nums text-brand-foreground">
              {numero(i)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium leading-tight">{p.nombre}</span>
              <span className="block truncate text-xs text-muted">{p.direccion}</span>
            </span>
          </li>
        ))}
      </ol>

      {cerradas > 0 ? (
        <p className="mt-2 flex shrink-0 items-start gap-2 rounded-xl bg-background px-3 py-2 text-xs text-muted">
          <PackageCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
          <span className="min-w-0 flex-1">
            {cerradas === 1
              ? "La parada que ya cerraste hoy se conserva."
              : `Las ${cerradas} paradas que ya cerraste hoy se conservan.`}
          </span>
        </p>
      ) : null}

      {sinUbicar.length > 0 ? (
        <Aviso icono={<MapPinOff className="h-3.5 w-3.5" />}>
          {sinUbicar.length === 1
            ? "1 pedido quedó afuera porque su dirección no se pudo ubicar en el mapa."
            : `${sinUbicar.length} pedidos quedaron afuera porque su dirección no se pudo ubicar en el mapa.`}{" "}
          Siguen pendientes: corrige la dirección y vuelve a armar la ruta.
        </Aviso>
      ) : null}

      {sinTrazado ? (
        <Aviso icono={<CloudOff className="h-3.5 w-3.5" />}>
          Sin señal no se pudo trazar el camino por calles. El orden de las paradas está
          listo igual y el mapa lo dibuja en cuanto haya conexión.
        </Aviso>
      ) : null}

      {error ? (
        <p className="mt-2 shrink-0 rounded-xl bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p>
      ) : null}

      <div className="mt-3 grid shrink-0 grid-cols-[auto_1fr] gap-2">
        <button
          type="button"
          onClick={onDescartar}
          disabled={guardando}
          aria-label="Descartar esta ruta"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-separator bg-card text-muted transition-transform active:scale-[0.97] disabled:opacity-50"
        >
          <X className="h-5 w-5" />
        </button>
        <button type="button" onClick={() => void usar()} disabled={guardando} className={BOTON_PRINCIPAL}>
          <Check className="h-4 w-4" />
          {guardando ? "Guardando…" : "Usar esta ruta"}
        </button>
      </div>
    </div>
  );
}
