"use client";

// Las opciones de un lugar en duda (calle en varios lugares o solo la calle), abiertas y con
// «Elegir» (dueño, 2026-11-16: «no queda lo suficientemente claro que se puede elegir»). Cada
// una con un mapa ancho donde se leen las calles, su población y sector, y las calles que la
// cruzan, para distinguirla de las otras. La usan el ⚠ del pedido y «Por confirmar».

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { MapaPunto } from "@/components/direccion/mapa-punto";
import type { OpcionLugar, ProblemaGuardado } from "@/lib/encomiendas/problemas";
import { calleYNumero } from "@/lib/geo/geocoding/referencias";

const CAJA = "space-y-2 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn";
/** Cuántas opciones se ven antes de «+ N más». */
const A_LA_VISTA = 3;

export function OpcionesDeLugar({
  problema: x,
  ocupado,
  onElegir,
  encabezado,
  enTarjeta = false,
}: {
  problema: Extract<ProblemaGuardado, { opciones: unknown }>;
  ocupado: boolean;
  onElegir: (o: OpcionLugar) => void;
  /** Lo que va arriba del título (la OF, en «Por confirmar»). */
  encabezado?: React.ReactNode;
  /** Con el formato de las propuestas de la IA (tarjeta blanca), para «Por confirmar». */
  enTarjeta?: boolean;
}) {
  const [todas, setTodas] = useState(false);
  const calle = x.opciones[0] ? calleYNumero(x.opciones[0].direccion).calle : "La calle";
  const vistas = todas ? x.opciones : x.opciones.slice(0, A_LA_VISTA);
  return (
    <div className={enTarjeta ? "space-y-2 rounded-2xl bg-card p-3 shadow-soft" : CAJA}>
      {encabezado}
      <p className={enTarjeta ? "flex items-start gap-1.5 text-sm font-semibold text-warn" : "flex items-start gap-1.5 font-semibold"}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {x.tipo === "calle_repetida"
            ? `${calle} está en ${x.opciones.length} lugares · Elige el correcto:`
            : "Sin número: va a mitad de cuadra · Elige el punto:"}
        </span>
      </p>
      <ul className="grid gap-2">
        {vistas.map((o, i) => (
          <li
            key={`${o.lat},${o.lng}`}
            className={enTarjeta ? "overflow-hidden rounded-xl border border-separator text-foreground" : "overflow-hidden rounded-xl bg-card text-foreground"}
          >
            <MapaPunto lat={o.lat} lng={o.lng} etiqueta={o.direccion} alto={120} zoom={16.3} />
            <div className="flex items-center gap-2 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{o.direccion}</p>
                {o.detalle ? <p className="truncate text-xs text-muted">{o.detalle}</p> : null}
                {o.cruces && o.cruces.length > 0 ? (
                  <p className="truncate text-xs text-muted">Cruza con: {o.cruces.join(" · ")}</p>
                ) : null}
                {o.calza ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">
                    <Check className="h-3 w-3" />
                    Coincide con la guía
                  </span>
                ) : i === 0 ? (
                  <span className="mt-1 inline-block text-xs font-semibold text-brand">Sugerida</span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onElegir(o)}
                className="h-10 shrink-0 rounded-full bg-brand px-4 text-sm font-semibold text-brand-foreground active:scale-[0.97] disabled:opacity-50"
              >
                Elegir
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!todas && x.opciones.length > A_LA_VISTA ? (
        <button type="button" onClick={() => setTodas(true)} className="w-full py-1 text-xs font-semibold text-warn">
          + {x.opciones.length - A_LA_VISTA} más
        </button>
      ) : null}
    </div>
  );
}
