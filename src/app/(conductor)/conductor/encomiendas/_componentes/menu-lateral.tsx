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
// Tres cosas y ninguna más, en el orden en que se necesitan:
//
//   1. QUIÉN ESTÁ. Un teléfono de reparto pasa de mano en mano y la app queda
//      instalada: saber con qué cuenta está abierta es lo primero que hay que
//      poder comprobar, y es también lo que hace que cerrar sesión abajo tenga
//      sentido.
//   2. LOS DÍAS. Cómo salió cada día guardado en este teléfono. Son cifras,
//      no pedidos — ver ResumenDia en el almacén: los nombres y teléfonos de un
//      día pasado no hacen falta para decir cómo salió.
//   3. CERRAR SESIÓN. Al fondo y separado, porque es lo único de acá que no se
//      puede deshacer: borra del teléfono los pedidos y las rutas (spec 007),
//      así que pide confirmación y avisa si quedan registros sin enviar.
//
// Entra por la izquierda y no desde abajo a propósito: desde abajo es de donde
// entra la hoja de trabajo, y dos paneles con el mismo gesto y distinto
// contenido se confunden.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, CircleHelp, LogOut, Menu, Search, Stethoscope, X } from "lucide-react";
import { LogoDashund } from "@/components/marca/logo-dashund";
import { cn } from "@/lib/comun/utils";
import { formatCLP, formatDateLong } from "@/lib/comun/format";
import { borrarDatosDestinatarios, leerCola, type ResumenDia } from "@/lib/encomiendas/local/almacen";
import { esApp } from "@/lib/nativo/entorno";

/** El botón que lo abre. Vive acá, junto al panel, para que no haya dos lugares
 *  que decidir cómo se ve el menú. */
export function BotonMenu({ onAbrir }: { onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label="Abrir el menú"
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card shadow-md active:bg-background"
    >
      <Menu className="h-4 w-4" />
    </button>
  );
}

export function MenuLateral({
  nombreConductor,
  dias,
  fechaActiva,
  onCerrar,
  logout,
  onBuscarOf,
  onAyuda,
}: {
  nombreConductor: string;
  dias: ResumenDia[];
  /** El día que la app está trabajando: se marca en la lista. */
  fechaActiva: string;
  onCerrar: () => void;
  /** La acción de servidor que cierra la sesión. Llega como prop y no importada
   *  acá para que este componente no dependa de una ruta del panel. */
  logout: () => void | Promise<void>;
  /** Abre la búsqueda de un paquete por su OF (spec 003). */
  onBuscarOf: () => void;
  /** Cómo se usa la app, en corto (ver ayuda.tsx). */
  onAyuda: () => void;
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

  // null = sin pedir confirmación; un número = cuántos registros siguen sin enviar.
  const [confirmandoSalida, setConfirmandoSalida] = useState<number | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  const [errorSalida, setErrorSalida] = useState<string | null>(null);

  async function pedirSalida() {
    const cola = await leerCola().catch(() => []);
    setConfirmandoSalida(cola.length);
  }

  async function salir() {
    setSaliendo(true);
    setErrorSalida(null);
    try {
      await borrarDatosDestinatarios();
    } catch {
      setSaliendo(false);
      setErrorSalida("No se pudieron borrar los datos del teléfono. Intenta de nuevo.");
      return;
    }
    try {
      await logout();
    } catch {
      // Sin señal el cierre de sesión no llega al servidor: que no quede
      // "Saliendo…" para siempre (spec 017, E12).
      setSaliendo(false);
      setErrorSalida("Los datos del teléfono ya se borraron, pero sin señal no se pudo cerrar la sesión. Intenta de nuevo con señal.");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    // Portal a document.body: el mapa y la hoja están dentro de contenedores con
    // transform, y un "fixed inset-0" ahí adentro se confina a esa caja en vez
    // de cubrir la pantalla.
    <div
      className="animate-fade-in fixed inset-0 z-50 bg-black/40"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label="Menú del conductor"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-cajon flex h-full w-[82%] max-w-xs flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))] shadow-card"
      >
        {/* Quién está. La cruz al lado y no en la esquina opuesta: el menú se
            abre con el pulgar izquierdo y se cierra con el mismo pulgar. */}
        <div className="flex items-start gap-3 px-4 pb-4 pt-2">
          <LogoDashund className="h-11 w-10 shrink-0" titulo="" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Sesión de</p>
            <p className="truncate text-lg font-semibold leading-tight">{nombreConductor}</p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar el menú"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-card"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto border-t border-divider px-4 pt-3">
          <button
            type="button"
            onClick={onBuscarOf}
            className="mb-4 flex w-full items-center gap-2.5 rounded-2xl bg-card px-3.5 py-3 text-left text-sm font-medium shadow-soft active:bg-background"
          >
            <Search className="h-4 w-4 shrink-0 text-brand" />
            Buscar un paquete por su OF
          </button>
          <button
            type="button"
            onClick={onAyuda}
            className="mb-4 -mt-2 flex w-full items-center gap-2.5 rounded-2xl bg-card px-3.5 py-3 text-left text-sm font-medium shadow-soft active:bg-background"
          >
            <CircleHelp className="h-4 w-4 shrink-0 text-brand" />
            Ayuda
          </button>

          <p className="px-1 pb-2 text-xs font-medium text-muted">Tus días</p>

          {dias.length === 0 ? (
            // Sin ninguna ruta armada todavía. Se dice, en vez de dejar el hueco
            // vacío: un panel en blanco parece algo que no cargó.
            <p className="rounded-2xl bg-card px-3.5 py-3 text-sm text-muted shadow-soft">
              Sin días todavía.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-2xl bg-card shadow-soft">
              {dias.map((dia, i) => {
                const esActivo = dia.fecha === fechaActiva;
                return (
                  <li
                    key={dia.fecha}
                    className={cn(
                      "flex items-center gap-3 px-3.5 py-3",
                      i > 0 && "border-t border-divider",
                      esActivo && "bg-brand-soft",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium capitalize leading-tight">
                        {formatDateLong(dia.fecha)}
                      </p>
                      {/* Un día sin cerrar es lo único que este resumen tiene
                          que poder gritar: quedó una parada sin marcar y el
                          servidor no valoró el día. */}
                      <p className="mt-0.5 text-xs text-muted">
                        {esActivo
                          ? "Hoy"
                          : dia.cierre == null
                            ? "Quedó sin cerrar"
                            : `${dia.paradas} ${dia.paradas === 1 ? "parada" : "paradas"}`}
                      </p>
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

          {/* Los días son de consulta: la app trabaja el día en curso y un
              conductor no vuelve a repartir uno pasado (ver encomiendas/page.tsx).
              El historial completo, pedido por pedido, lo mira la oficina. */}
          <p className="px-1 pb-4 pt-2 text-xs text-muted">
            Los días anteriores son solo para mirar.
          </p>
        </div>

        {confirmandoSalida != null ? (
          <div className="space-y-3 border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <p className="text-sm">
              Se borran de este teléfono los pedidos y las rutas. Quedan solo las cifras de cada día.
            </p>
            {confirmandoSalida > 0 ? (
              <p className="text-sm font-medium text-warn">
                Hay {confirmandoSalida} {confirmandoSalida === 1 ? "registro" : "registros"} sin enviar:
                salen cuando vuelvas a entrar con esta cuenta.
              </p>
            ) : null}
            {errorSalida ? <p className="text-sm font-medium text-danger">{errorSalida}</p> : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saliendo}
                onClick={() => void salir()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-danger text-sm font-semibold text-white disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                {saliendo ? "Saliendo…" : "Cerrar sesión"}
              </button>
              <button
                type="button"
                disabled={saliendo}
                onClick={() => setConfirmandoSalida(null)}
                className="h-11 rounded-full px-4 text-sm font-medium text-muted active:bg-card"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() => void pedirSalida()}
              className="flex items-center gap-2 rounded-xl px-1 py-2 text-sm font-medium text-muted active:text-danger"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
            {/* Solo en la APK (spec 015): ahí no hay barra de direcciones para
                llegar a la pantalla de diagnóstico de otra forma. */}
            {esApp() ? (
              <Link
                href="/conductor/diagnostico"
                className="flex items-center gap-1.5 rounded-xl px-1 py-2 text-xs text-muted"
              >
                <Stethoscope className="h-3.5 w-3.5" />
                Diagnóstico
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
