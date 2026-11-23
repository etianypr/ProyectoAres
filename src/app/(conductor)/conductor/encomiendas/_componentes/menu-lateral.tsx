"use client";

// ----------------------------------------------------------------------------
// El menú del conductor: entra desde el borde izquierdo
// ----------------------------------------------------------------------------
//
// Ocupa el lugar donde antes estaba la flecha de volver. La flecha se fue con
// el hub: entrar a la app ya no pasa por un menú con una sola tarjeta, así que
// no queda nada atrás a donde volver (ver conductor/page.tsx). Lo que sí tenía
// que sobrevivir a ese hub es lo que vive acá adentro.
//
// Una lista plana, en el orden en que se necesita (dueño, 2026-11-22: estaba
// «muy vibecoding», con tres tarjetas sueltas con sombra que pesaban más que los
// días). Grupos separados por una línea, como el menú de Google Maps:
//
//   1. QUIÉN ESTÁ. Un teléfono de reparto pasa de mano en mano y la app queda
//      instalada: saber con qué cuenta está abierta es lo primero que hay que
//      poder comprobar, y es también lo que hace que cerrar sesión abajo tenga
//      sentido. Al lado, la Ayuda (?) y la cruz (dueño, 2026-11-22).
//   2. BUSCAR UN PAQUETE. Lo único de acá que se usa en medio del reparto.
//   3. LOS DÍAS. Cómo salió cada día guardado en este teléfono. Son cifras,
//      no pedidos — ver ResumenDia en el almacén: los nombres y teléfonos de un
//      día pasado no hacen falta para decir cómo salió.
//   4. CERRAR SESIÓN. Fijo al fondo y separado, porque es lo único de acá que no
//      se puede deshacer: borra del teléfono los pedidos y las rutas (spec 007),
//      así que pide confirmación y avisa si quedan registros sin enviar. En su
//      misma línea, Accesibilidad y Diagnóstico como íconos (dueño, 2026-11-22):
//      se abren de vez en cuando y no le quitan filas a los días.
//
// Entra por la izquierda y no desde abajo a propósito: desde abajo es de donde
// entra la hoja de trabajo, y dos paneles con el mismo gesto y distinto
// contenido se confunden.

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, CircleHelp, LogOut, Menu, RotateCw, Search, Settings, Stethoscope, X } from "lucide-react";
import { LogoDashund } from "@/components/marca/logo-dashund";
import { cn } from "@/lib/comun/utils";
import { formatCLP, formatDateLong } from "@/lib/comun/format";
import type { ResumenDia } from "@/lib/encomiendas/local/almacen";
import { lineaDelDia } from "@/lib/encomiendas/local/dias-del-menu";
import { ConfirmarSalida, useCerrarSesion } from "../../../cerrar-sesion";
import { BOTON_REDONDO, BOTON_ICONO } from "./botones";

/** Una fila del menú: 48 px, como todo lo que se toca manejando (botones.ts), sin
 *  tarjeta ni sombra. El ícono va gris: el naranjo queda para el día de hoy. */
const FILA = "flex h-12 w-full items-center gap-4 px-4 text-left text-[15px] font-medium active:bg-surface";
const ICONO_FILA = "h-5 w-5 shrink-0 text-muted";

/** El botón que lo abre. Vive acá, junto al panel, para que no haya dos lugares
 *  que decidir cómo se ve el menú. */
export function BotonMenu({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label="Abrir menú"
      className={cn(BOTON_REDONDO, "active:bg-background")}
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}

export function MenuLateral({
  nombreConductor,
  dias,
  conDatos,
  sinEnviar,
  onReintentar,
  enviando,
  onReleer,
  fechaActiva,
  onCerrar,
  onBuscarOf,
  onAyuda,
  onAccesibilidad,
}: {
  nombreConductor: string;
  dias: ResumenDia[];
  /** Fechas que todavía tienen pedidos o ruta en el teléfono. */
  conDatos: ReadonlySet<string>;
  /** Registros de la cola por fecha. */
  sinEnviar: ReadonlyMap<string, number>;
  /** El mismo envío de la cola que «Reintentar» en «Tu día». */
  onReintentar: () => void;
  enviando: boolean;
  /** Vuelve a leer los días y la cola (al terminar un envío). */
  onReleer: () => void;
  /** El día que la app está trabajando: se marca en la lista. */
  fechaActiva: string;
  onCerrar: () => void;
  /** Abre la búsqueda de un paquete por su OF (spec 003). */
  onBuscarOf: () => void;
  /** Cómo se usa la app, en corto (ver ayuda.tsx). */
  onAyuda: () => void;
  /** Lo que el conductor deja a su gusto: las llamadas en altavoz (accesibilidad.tsx). */
  onAccesibilidad: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, [onCerrar]);

  // La confirmación de salida es la misma de la pantalla de error y la de cuenta
  // sin vincular (spec 033, error-logout; ver (conductor)/cerrar-sesion.tsx).
  const salida = useCerrarSesion();

  // Al terminar un envío se vuelve a contar lo que quedó en la cola.
  useEffect(() => {
    if (!enviando) onReleer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enviando]);

  if (typeof document === "undefined") return null;

  return createPortal(
    // Portal a document.body: el mapa y la hoja están dentro de contenedores con
    // transform, y un "fixed inset-0" ahí adentro se confina a esa caja en vez
    // de cubrir la pantalla.
    <div
      className="animate-fade-in fixed inset-0 z-pantalla bg-black/40"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Menú del conductor"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-cajon flex h-full w-[82%] max-w-xs flex-col bg-card pt-[max(0.75rem,env(safe-area-inset-top))] shadow-card"
      >
        {/* Quién está. La cruz al lado y no en la esquina opuesta: el menú se
            abre con el pulgar izquierdo y se cierra con el mismo pulgar. */}
        <div className="flex items-center gap-3 pb-3 pl-4 pr-2">
          <LogoDashund className="h-7 w-16 shrink-0" titulo="" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Sesión de</p>
            <p className="truncate text-lg font-semibold leading-tight">{nombreConductor}</p>
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={onAyuda} aria-label="Ayuda" className={BOTON_ICONO}>
              <CircleHelp className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar menú"
              className={BOTON_ICONO}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-t border-divider py-2">
            <button type="button" onClick={onBuscarOf} className={FILA}>
              <Search className={ICONO_FILA} />
              Buscar paquete por OF
            </button>
          </div>

          <section aria-labelledby="menu-dias" className="border-t border-divider pb-2">
            <h2 id="menu-dias" className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
              Días de trabajo
            </h2>

            {/* Los días son solo de consulta (la app trabaja el día en curso; ver
                encomiendas/page.tsx). Lo decía una nota bajo la lista: las
                pantallas no llevan instrucciones, así que pasó a la Ayuda. */}
            {dias.length === 0 ? (
              // Sin ninguna ruta armada todavía. Se dice, en vez de dejar el hueco
              // vacío: un panel en blanco parece algo que no cargó.
              <p className="px-4 py-3 text-sm text-muted">Sin días registrados.</p>
            ) : (
              <ul>
                {dias.map((dia, i) => {
                  const esActivo = dia.fecha === fechaActiva;
                  const linea = lineaDelDia(dia, { fechaActiva, conDatos, sinEnviar });
                  return (
                    <li
                      key={dia.fecha}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        i > 0 && "border-t border-divider",
                        esActivo && "bg-brand-soft",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        {/* Mayúscula solo al comienzo: `capitalize` dejaba «22 De Noviembre». */}
                        <p className="truncate text-sm font-medium leading-tight first-letter:uppercase">
                          {formatDateLong(dia.fecha)}
                        </p>
                        {/* «Quedó sin cerrar» solo si el día todavía tiene datos en
                            el teléfono (spec 033, dia-sin-cerrar). */}
                        <p className={cn("mt-0.5 text-xs", linea.alarma ? "font-medium text-warn" : "text-muted")}>
                          {linea.texto}
                        </p>
                        {/* Lo de ese día que el servidor todavía no tiene: el mismo
                            envío de «Tu día», que manda toda la cola. */}
                        {!esActivo && linea.sinEnviar > 0 ? (
                          <p className="mt-0.5 flex items-center gap-2 text-xs font-medium text-warn">
                            {linea.sinEnviar} sin enviar
                            <button
                              type="button"
                              onClick={onReintentar}
                              disabled={enviando}
                              className="flex items-center gap-1 underline disabled:opacity-50"
                            >
                              <RotateCw className="h-3 w-3" />
                              {enviando ? "Enviando…" : "Reintentar"}
                            </button>
                          </p>
                        ) : null}
                        {/* Lo que se cobra en la puerta (spec 005): cobrado de lo
                            que había que cobrar, para cuadrar la plata. */}
                        {dia.porPagar > 0 ? (
                          <p className="mt-0.5 text-xs tabular-nums text-muted">
                            Cobrado {formatCLP(dia.cobrado)} de {formatCLP(dia.aCobrar)} · {dia.porPagar} por pagar
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-semibold">
                        <span className="flex items-center gap-1 tabular-nums text-ok">
                          <Check className="h-3.5 w-3.5 shrink-0" />
                          {dia.entregadas}/{dia.paradas}
                        </span>
                        {dia.noEntregadas > 0 ? (
                          <span className="flex items-center gap-1 tabular-nums text-danger">
                            <X className="h-3.5 w-3.5 shrink-0" />
                            {dia.noEntregadas}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {salida.confirmando ? (
          <ConfirmarSalida
            salida={salida}
            className="border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3"
          />
        ) : (
          <div className="flex items-center border-t border-divider pb-[max(0.5rem,env(safe-area-inset-bottom))] pr-2 pt-2">
            <button type="button" onClick={() => void salida.pedir()} className={cn(FILA, "min-w-0 flex-1")}>
              <LogOut className={ICONO_FILA} />
              Cerrar sesión
            </button>
            {/* La raya los separa de «Cerrar sesión», que es lo único que no se deshace. */}
            <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-divider" />
            {/* Un engranaje y no la figura de accesibilidad: son las preferencias
                del conductor (altavoz…), no ayudas para una discapacidad (dueño,
                2026-11-22). */}
            <button type="button" onClick={onAccesibilidad} aria-label="Accesibilidad" className={BOTON_ICONO}>
              <Settings className="h-5 w-5" />
            </button>
            {/* También fuera de la APK: ahí vive el modo prueba, que es como se
                prueba la app desde un PC sin escribir en la base (2026-10-28), y
                la salida si la cámara se traba (escáner de Google, spec 028). */}
            <Link href="/conductor/diagnostico" aria-label="Diagnóstico" className={BOTON_ICONO}>
              <Stethoscope className="h-5 w-5" />
            </Link>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
