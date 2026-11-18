"use client";

// «Borrar pedidos» (dueño, 2026-11-18: «no existe forma de borrar las OF con sus direcciones para
// poder hacer un nuevo escaneo»): al final de la hoja, antes de la ruta (en la cabecera alargaba la
// pestaña y cambiaba el diseño, dueño). Borra los pedidos que nadie tocó (sin etiqueta, resultado ni
// llamada, y fuera de la ruta), como «Deshacer esta carga» pero sin depender del resumen de la carga,
// que se cierra. Pide un segundo toque; los ya iniciados quedan y se dice cuántos.

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { borrarSinIniciar, sinIniciar, type Pedido } from "@/lib/encomiendas/local/almacen";

export function BorrarPedidos({
  fecha,
  pedidos,
  idsEnRuta,
  onBorrados,
}: {
  fecha: string;
  pedidos: Pedido[];
  idsEnRuta: Set<string>;
  /** Volver a leer los pedidos del día. */
  onBorrados: () => Promise<void>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const cuantos = sinIniciar(pedidos, idsEnRuta).length;
  if (cuantos === 0 && !aviso) return null;

  async function borrar() {
    setBorrando(true);
    try {
      const { quedan } = await borrarSinIniciar(fecha);
      await onBorrados();
      setAviso(quedan === 0 ? null : quedan === 1 ? "Quedó 1 pedido ya iniciado." : `Quedaron ${quedan} pedidos ya iniciados.`);
    } catch {
      setAviso("No se pudieron borrar. Vuelve a intentarlo.");
    } finally {
      setBorrando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="space-y-2">
      {cuantos > 0 && !confirmando ? (
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setConfirmando(true);
          }}
          className="flex w-full items-center justify-center gap-1 py-1 text-sm text-muted active:text-foreground"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Borrar pedidos
        </button>
      ) : null}
      {confirmando ? (
        <div className="space-y-2 rounded-2xl bg-danger-bg p-3">
          <p className="text-sm text-danger">
            {cuantos === 1 ? "¿Borrar 1 pedido no iniciado?" : `¿Borrar ${cuantos} pedidos no iniciados?`} No se puede deshacer.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setConfirmando(false)} className="h-10 rounded-full border border-separator bg-card text-sm font-semibold text-muted">
              Cancelar
            </button>
            <button
              type="button"
              disabled={borrando}
              onClick={() => void borrar()}
              className="h-10 rounded-full bg-danger text-sm font-semibold text-white disabled:opacity-60"
            >
              {borrando ? "Borrando…" : `Borrar ${cuantos}`}
            </button>
          </div>
        </div>
      ) : null}
      {aviso ? <p className="text-center text-xs text-muted">{aviso}</p> : null}
    </div>
  );
}
