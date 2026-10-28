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
//
// ----------------------------------------------------------------------------
// LA COMPARACIÓN SOLO APARECE CUANDO HAY ALGO QUE COMPARAR
//
// El documento principal es explícito: una sola ruta cuando es claramente la
// mejor, y hasta tres solo cuando las diferencias son útiles. Eso ya lo decidió
// el cálculo (ver elegirUtiles en generar-ruta.ts); acá la regla se traduce en
// una condición sola — con una alternativa no se dibuja ningún selector.
//
// Es la diferencia entre ayudar y estorbar. Un conductor con treinta pedidos y el
// motor andando no quiere elegir entre tres opciones que valen lo mismo; quiere
// que le digan por dónde arrancar.

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  CloudOff,
  MapPinOff,
  PackageCheck,
  Phone,
  Route,
  Trash2,
  X,
} from "lucide-react";
import { formatDistancia, formatDuracion } from "@/lib/comun/format";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { bloquePorId } from "@/lib/encomiendas/config";
import type { EstrategiaRuta, PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import type { QuitadoDeLaPropuesta } from "../_hooks/use-propuesta";

// Mismas medidas que los botones de la tarjeta de la parada activa (ver
// parada-activa.tsx): 48 px de alto, para el pulgar y sin mirar mucho.
const BOTON_PRINCIPAL =
  "flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground shadow-[0_1px_2px_var(--brand-shadow)] transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

function Advertencia({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
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
  onElegir,
  onDescartar,
  quitado,
  onQuitar,
  onDeshacerQuitar,
}: {
  propuesta: PropuestaRuta;
  /** Guarda la ruta en el teléfono (ver confirmarRutaLocal). */
  onUsar: () => Promise<void>;
  /** Cambia a otra alternativa. Pide su trazado, así que tarda un momento. */
  onElegir: (estrategia: EstrategiaRuta) => Promise<void>;
  onDescartar: () => void;
  /** El último pedido eliminado de la propuesta, para deshacerlo. */
  quitado: QuitadoDeLaPropuesta | null;
  /** Elimina el pedido (del teléfono y de la propuesta). */
  onQuitar: (pedidoId: string) => Promise<void>;
  onDeshacerQuitar: () => Promise<void>;
}) {
  const [guardando, setGuardando] = useState(false);
  const [cambiando, setCambiando] = useState<EstrategiaRuta | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function elegir(estrategia: EstrategiaRuta) {
    if (estrategia === propuesta.elegida) return;
    setError(null);
    setCambiando(estrategia);
    try {
      await onElegir(estrategia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular esa ruta.");
    } finally {
      setCambiando(null);
    }
  }

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

  const {
    paradas,
    distanciaM,
    duracionS,
    sinUbicar,
    sinTrazado,
    cerradas,
    alternativas,
    elegida,
  } = propuesta;

  const actual = alternativas.find((a) => a.estrategia === elegida) ?? alternativas[0];
  // Con una sola no hay nada que comparar, y es el caso normal: si nadie eligió
  // horario, las tres estrategias dan el mismo orden.
  const hayQueComparar = alternativas.length > 1;

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
    // La mitad de la pantalla, no el 85%: este panel se abre sobre el día,
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
          {/* El tiempo de ruta, con su reloj (terreno 2026-10-28). Es manejando,
              sin las entregas: lo dice la Ayuda, no la pantalla. */}
          <span className="flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 font-semibold tabular-nums text-brand">
            <Clock className="h-4 w-4" aria-label="Tiempo de ruta" />
            {formatDuracion(duracionS)}
          </span>
        </div>
      ) : null}

      {/* La comparación. Cada botón dice lo que el conductor necesita para decidir:
          cuánto se maneja, cuántos clientes ya confirmaron y a cuántos se les
          llegaría fuera de su horario. */}
      {hayQueComparar ? (
        <div className="mt-2.5 shrink-0">
          <div className="grid gap-1.5">
            {alternativas.map((a) => {
              const puesta = a.estrategia === elegida;
              return (
                <button
                  key={a.estrategia}
                  type="button"
                  onClick={() => void elegir(a.estrategia)}
                  disabled={guardando || cambiando != null}
                  aria-pressed={puesta}
                  className={[
                    "flex items-start gap-2 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60",
                    puesta
                      ? "border-brand bg-brand-soft"
                      : "border-separator bg-card active:bg-background",
                  ].join(" ")}
                >
                  {/* El estado "puesta" no se distingue solo por el color: lleva
                      su tilde. Es lo que pide la constitución para cualquier
                      estado, y acá además se mira a pleno sol. */}
                  <span
                    className={[
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                      puesta ? "border-brand bg-brand" : "border-separator",
                    ].join(" ")}
                  >
                    {puesta ? <Check className="h-3 w-3 text-brand-foreground" /> : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-sm font-semibold leading-tight">
                        {a.titulo}
                      </span>
                      <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                        {formatDistancia(a.metrosEstimados)}
                      </span>
                      {cambiando === a.estrategia ? (
                        <span className="shrink-0 text-xs text-muted">calculando…</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                      <span>{a.paradas.length === 1 ? "1 parada" : `${a.paradas.length} paradas`}</span>
                      {a.confirmados > 0 ? (
                        <span className="flex items-center gap-0.5 text-ok">
                          <Check className="h-3 w-3" />
                          {a.confirmados} confirmado{a.confirmados === 1 ? "" : "s"}
                        </span>
                      ) : null}
                      {a.pendientesDeContacto > 0 ? (
                        <span className="flex items-center gap-0.5">
                          <Phone className="h-3 w-3" />
                          {a.pendientesDeContacto} por llamar
                        </span>
                      ) : null}
                      {a.bloquesIncumplidos > 0 ? (
                        <span className="flex items-center gap-0.5 font-semibold text-warn">
                          <Clock className="h-3 w-3" />
                          {a.bloquesIncumplidos} fuera de horario
                        </span>
                      ) : a.bloquesCumplidos > 0 ? (
                        <span className="flex items-center gap-0.5 text-ok">
                          <Clock className="h-3 w-3" />
                          {a.bloquesCumplidos} en horario
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 px-1 text-[11px] text-muted">{actual.motivo}</p>
        </div>
      ) : null}

      {quitado ? (
        <p className="mt-2 flex shrink-0 items-center gap-2 rounded-xl bg-background px-3 py-1.5 text-xs">
          <Trash2 className="h-3.5 w-3.5 shrink-0 text-muted" />
          <span className="min-w-0 flex-1 truncate">Eliminado: {nombreVisible(quitado.parada)}</span>
          <button
            type="button"
            onClick={() => void onDeshacerQuitar()}
            className="shrink-0 rounded-full px-2 py-1 font-semibold text-brand active:bg-card"
          >
            Deshacer
          </button>
        </p>
      ) : null}

      {/* El orden es lo que el conductor viene a revisar: se puede desplazar, pero
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
              <span className="block truncate font-medium leading-tight">{nombreVisible(p)}</span>
              <span className="block truncate text-xs text-muted">{p.direccion}</span>
            </span>
            {/* Qué contestó este receptor. Es la mitad del valor de haberle
                avisado: sin esto, el conductor llega a la puerta sin saber si lo
                están esperando. Cada estado lleva icono Y texto, no solo
                color. */}
            {p.bloqueHorarioId ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-brand">
                <Clock className="h-3 w-3" />
                {bloquePorId(p.bloqueHorarioId)?.etiqueta ?? p.bloqueHorarioId}
              </span>
            ) : p.disponibilidad === "confirmado" ? (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-ok-bg px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                <Check className="h-3 w-3" />
                confirmó
              </span>
            ) : (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                <Phone className="h-3 w-3" />
                por llamar
              </span>
            )}
            {/* Un pedido que no va (terreno 2026-10-28) se elimina acá mismo. */}
            <button
              type="button"
              onClick={() => void onQuitar(p.id)}
              disabled={guardando}
              aria-label={`Eliminar ${nombreVisible(p)}`}
              className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted active:bg-card disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
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
        <Advertencia icono={<MapPinOff className="h-3.5 w-3.5" />}>
          {sinUbicar.length === 1
            ? "1 pedido quedó afuera porque su dirección no se pudo ubicar en el mapa."
            : `${sinUbicar.length} pedidos quedaron afuera porque su dirección no se pudo ubicar en el mapa.`}{" "}
          Siguen pendientes: corrige la dirección y vuelve a armar la ruta.
        </Advertencia>
      ) : null}

      {actual.bloquesIncumplidos > 0 ? (
        <Advertencia icono={<AlertTriangle className="h-3.5 w-3.5" />}>
          {actual.fueraDeHorario.length === 1
            ? `Con este orden llegarías fuera del horario que eligió ${actual.fueraDeHorario[0]}.`
            : `Con este orden llegarías fuera de horario a ${actual.fueraDeHorario.length} clientes: ${actual.fueraDeHorario.join(", ")}.`}{" "}
          Conviene llamarlos.
        </Advertencia>
      ) : null}

      {sinTrazado ? (
        <Advertencia icono={<CloudOff className="h-3.5 w-3.5" />}>
          Sin señal no se pudo trazar el camino por calles. El orden de las paradas está
          listo igual y el mapa lo dibuja en cuanto haya conexión.
        </Advertencia>
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
