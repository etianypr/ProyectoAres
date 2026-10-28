"use client";

// La cabecera de la hoja cuando no hay una parada que atender: cargando pedidos,
// sin ruta armada, o la ruta terminada (sale de pantalla.tsx, spec 002 T037).
//
// Mientras se carga un pedido la cabecera se calla y queda un contador de
// pendientes: los pedidos se cargan en tanda, y armar la ruta a mitad de una tanda
// deja afuera los que faltaban.

import { ClipboardList, PackageCheck } from "lucide-react";
import { BOTON_PRINCIPAL } from "./parada-activa";

export function CabeceraSinParada({
  cargando,
  hayRuta,
  sinRutear,
  nombreConductor,
  entregadas,
  noEntregadas,
  onCargarGuia,
  armarRuta,
}: {
  /** Está abierto el formulario de un pedido. */
  cargando: boolean;
  hayRuta: boolean;
  /** Pedidos pendientes fuera de la ruta. */
  sinRutear: number;
  nombreConductor: string;
  entregadas: number;
  noEntregadas: number;
  onCargarGuia: () => void;
  /** El botón para armar la ruta (GenerarRutaLocal). */
  armarRuta: React.ReactNode;
}) {
  return (
  cargando && !hayRuta ? (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold tabular-nums text-brand">
          {sinRutear}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {sinRutear === 1
              ? "1 pedido pendiente"
              : `${sinRutear} pedidos pendientes`}
          </p>
          <p className="text-xs text-muted">Sin ruta armada.</p>
        </div>
      </div>
    ) : !hayRuta ? (
      <div className="space-y-2.5">
        <div>
          <p className="text-sm font-semibold">Hola, {nombreConductor.split(" ")[0]}</p>
          <p className="text-xs text-muted">
            {sinRutear === 0
              ? "Sin pedidos cargados."
              : sinRutear === 1
                ? "1 pedido pendiente, sin ruta armada."
                : `${sinRutear} pedidos pendientes, sin ruta armada.`}
          </p>
        </div>
        {/* Sin nada cargado la cabecera NO lleva botón: "Agregar pedido" ya está
            adentro de la hoja, al pie de la lista de pedidos, y tenerlo en los dos
            lugares hacía dudar de si eran lo mismo. Queda el de abajo, que está
            donde se ven los pedidos, y acá solo se dice qué falta y cómo llegar. */}
        {sinRutear === 0 ? (
          // El día empieza por la guía (spec 005): es lo primero que hay que hacer.
          <button type="button" onClick={onCargarGuia} className={BOTON_PRINCIPAL}>
            <ClipboardList className="h-4 w-4" />
            Cargar la guía
          </button>
        ) : (
          armarRuta
        )}
      </div>
    ) : (
      <div className="flex items-center gap-3">
        <PackageCheck className="h-7 w-7 shrink-0 text-ok" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">¡Ruta completa!</p>
          <p className="text-xs text-muted">
            {entregadas} {entregadas === 1 ? "entrega" : "entregas"}
            {noEntregadas > 0 ? ` · ${noEntregadas} sin entregar` : ""}
          </p>
        </div>
      </div>
    )
  );
}
