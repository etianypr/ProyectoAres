"use client";

// La cabecera mientras se carga el auto (spec 027, paso 4). Antes, con la ruta
// recién armada y el auto vacío en la central, la cabecera ya era la parada 1
// con «Pedido entregado», y el avance de la carga quedaba adentro de la hoja. Lo
// que se hace en ese momento es escanear: eso va acá, a la vista con la hoja
// cerrada. «Salir a repartir» no bloquea (ver use-carga-auto.ts): con paquetes
// sin escanear pide un segundo toque en el mismo lugar (spec 033, salir-repartir).

import { ScanLine, Truck } from "lucide-react";
import type { CargaAuto } from "../_hooks/use-carga-auto";
import { useSegundoToque } from "../_hooks/use-segundo-toque";
import { BOTON_PRINCIPAL } from "./parada-activa";

export function CabeceraCarga({
  carga,
  guardando,
  onEscanear,
  onSalir,
}: {
  carga: CargaAuto;
  guardando: boolean;
  onEscanear: () => void;
  onSalir: () => void;
}) {
  const { escaneados, total } = carga;
  const faltan = carga.faltan.length;
  const salida = useSegundoToque();
  return (
    <div className="space-y-2.5">
      <div className="space-y-2">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-[30px] font-semibold leading-none tracking-tight tabular-nums">{escaneados}</span>
          <span className="text-sm text-muted">
            de {total} {total === 1 ? "paquete escaneado" : "paquetes escaneados"}
          </span>
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#ececef]">
          <div
            className="h-full rounded-full bg-ok transition-[width] duration-500"
            style={{ width: `${total > 0 ? (escaneados / total) * 100 : 0}%` }}
          />
        </div>
      </div>
      <button type="button" onClick={onEscanear} className={BOTON_PRINCIPAL}>
        <ScanLine className="h-4 w-4" />
        {escaneados === 0 ? "Escanear paquete" : "Seguir escaneando"}
      </button>
      <button
        type="button"
        disabled={guardando}
        onClick={() => (faltan > 0 ? salida.tocar(onSalir) : onSalir())}
        className={
          salida.armado
            ? "flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-danger/30 bg-danger-bg text-sm font-semibold text-danger"
            : "flex w-full items-center justify-center gap-1.5 py-1 text-sm font-semibold text-brand disabled:opacity-50"
        }
      >
        <Truck className="h-4 w-4" />
        {salida.armado ? `Faltan ${faltan} · Salir igual` : "Salir a repartir"}
      </button>
    </div>
  );
}
