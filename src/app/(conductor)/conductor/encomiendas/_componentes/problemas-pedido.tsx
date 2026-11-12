"use client";

// Los ⚠ guardados del pedido, arriba de su formulario (spec 022; maqueta elegida
// por el dueño: «Arriba del formulario»). Cada uno con su salida: elegir el lugar
// entre las opciones guardadas (sin consultar a nadie), «Va igual», «Es así», o
// qué dirección vale. Lo que se arregla corrigiendo un campo (sin ubicar, sin OF)
// se hace en el formulario de abajo.

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { MapaPunto } from "@/components/direccion/mapa-punto";
import {
  elegirLugar,
  marcarRevisado,
  quitarProblema,
  type Pedido,
} from "@/lib/encomiendas/local/almacen";
import { usarDireccionDeEtiqueta } from "@/lib/encomiendas/local/direccion-etiqueta";
import type { ProblemaGuardado } from "@/lib/encomiendas/problemas";

const CAJA = "space-y-2 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn";
const BOTON = "shrink-0 rounded-full border border-warn/30 bg-card px-3 py-1.5 text-xs font-semibold text-warn active:scale-[0.97] disabled:opacity-50";

export function ProblemasPedido({ pedido, onResuelto }: { pedido: Pedido; onResuelto: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendientes = pedido.problemas.filter((x) => !("revisado" in x && x.revisado));
  if (pendientes.length === 0) return null;

  async function hacer(accion: () => Promise<unknown>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      onResuelto();
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="max-h-[45%] shrink-0 space-y-2 overflow-y-auto border-b border-divider px-4 py-3">
      {pendientes.map((x) => (
        <Problema key={x.tipo} problema={x} pedido={pedido} ocupado={ocupado} hacer={hacer} />
      ))}
      {error ? <p className="rounded-lg bg-danger-bg px-3 py-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function Problema({
  problema: x,
  pedido,
  ocupado,
  hacer,
}: {
  problema: ProblemaGuardado;
  pedido: Pedido;
  ocupado: boolean;
  hacer: (accion: () => Promise<unknown>) => void;
}) {
  const titulo = (texto: string) => (
    <p className="flex min-w-0 flex-1 items-start gap-1.5 font-semibold">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{texto}</span>
    </p>
  );

  if ("opciones" in x) {
    return (
      <div className={CAJA}>
        {titulo(
          x.tipo === "calle_repetida"
            ? `Calle en ${x.opciones.length} lugares. Elige cuál:`
            : "Sin número: va a mitad de cuadra. Elige el punto:",
        )}
        <ul className="grid gap-1.5">
          {x.opciones.map((o, i) => (
            <li key={`${o.lat},${o.lng}`}>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => hacer(() => elegirLugar(pedido.id, o))}
                className="flex w-full items-center gap-2.5 rounded-xl bg-card p-2 text-left text-foreground active:scale-[0.99] disabled:opacity-50"
              >
                <span className="w-24 shrink-0 overflow-hidden rounded-lg">
                  <MapaPunto lat={o.lat} lng={o.lng} etiqueta={o.direccion} alto={64} ancho={96} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{o.direccion}</span>
                  {o.detalle ? <span className="block truncate text-xs text-muted">{o.detalle}</span> : null}
                  {i === 0 ? <span className="block text-[11px] font-semibold text-brand">Hoy va acá</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if ("direccion" in x) {
    // La de la etiqueta o la que escribió el receptor en WhatsApp (spec 004): la
    // de la guía no cambia hasta que el conductor elige.
    const otra = x.direccion;
    const delReceptor = x.tipo === "receptor_otra_direccion";
    return (
      <div className={CAJA}>
        {titulo(
          delReceptor
            ? otra
              ? "El receptor dice que es otra dirección:"
              : "El receptor dice que no es esa dirección"
            : "La etiqueta dice otra dirección:",
        )}
        {otra ? <p className="rounded-xl bg-card px-3 py-2 text-foreground">{otra}</p> : null}
        <div className="flex flex-wrap gap-2">
          {otra ? (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => hacer(() => usarDireccionDeEtiqueta(pedido.id, otra))}
              className={BOTON}
            >
              {delReceptor ? "Usar la del receptor" : "Usar la de la etiqueta"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={ocupado}
            onClick={() => hacer(() => quitarProblema(pedido.id, x.tipo))}
            className={BOTON}
          >
            Dejar la de la guía
          </button>
        </div>
      </div>
    );
  }

  const texto = x.tipo === "fuera_de_guia" ? "No estaba en la guía" : x.texto;
  return (
    <div className={`${CAJA} flex items-center gap-2 space-y-0`}>
      {titulo(texto)}
      <button type="button" disabled={ocupado} onClick={() => hacer(() => marcarRevisado(pedido.id, x.tipo))} className={BOTON}>
        {x.tipo === "fuera_de_guia" ? "Es así" : "Va igual"}
      </button>
    </div>
  );
}
