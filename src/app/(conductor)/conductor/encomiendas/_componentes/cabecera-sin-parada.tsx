"use client";

// La cabecera de la hoja antes de armar la ruta (spec 027, pasos 1 a 3): cargar
// la guía, resolver los ⚠ o armar la ruta. Cada paso con su botón, a la vista
// con la hoja cerrada; lo de adentro es solo lo de ese paso.
//
// Mientras se carga un pedido la cabecera se calla y queda un contador de
// pendientes: los pedidos se cargan en tanda, y armar la ruta a mitad de una tanda
// deja afuera los que faltaban.

import { AlertTriangle, Camera, Check, Plus } from "lucide-react";
import type { Paso } from "../_hooks/paso-del-dia";
import { BarraPasos } from "./barra-pasos";
import { BOTON_PRINCIPAL } from "./parada-activa";

/** "Viernes 6 de noviembre", de "YYYY-MM-DD" (a mediodía: sin correrse de día). */
function diaEscrito(fecha: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${fecha}T12:00:00`))
    .replace(",", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const TITULO = "text-[21px] font-extrabold leading-tight tracking-tight";

export function CabeceraSinParada({
  paso,
  cargando,
  pendientes,
  conProblema,
  nombreConductor,
  fecha,
  onCargarGuia,
  onAgregar,
  onResolver,
  armarRuta,
  armarIgual,
}: {
  paso: Extract<Paso, "guia" | "resolver" | "ruta">;
  /** Está abierto el formulario de un pedido. */
  cargando: boolean;
  /** Pedidos pendientes, todavía sin ruta. */
  pendientes: number;
  /** Cuántos de ellos tienen un ⚠. */
  conProblema: number;
  nombreConductor: string;
  fecha: string;
  onCargarGuia: () => void;
  onAgregar: () => void;
  /** Abre el primer pedido con ⚠ y, al guardarlo, el siguiente. */
  onResolver: () => void;
  /** El botón para armar la ruta (GenerarRutaLocal). */
  armarRuta: React.ReactNode;
  /** «Armar la ruta igual», con pedidos en duda (GenerarRutaLocal como enlace). */
  armarIgual: React.ReactNode;
}) {
  if (cargando) {
    return (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold tabular-nums text-brand">
          {pendientes}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {pendientes === 1 ? "1 pedido pendiente" : `${pendientes} pedidos pendientes`}
          </p>
          <p className="text-xs text-muted">Sin ruta armada.</p>
        </div>
      </div>
    );
  }

  if (paso === "guia") {
    return (
      <div className="space-y-2.5">
        <BarraPasos paso="guia" />
        <div>
          <p className={TITULO}>Hola, {nombreConductor.split(" ")[0]}</p>
          <p className="text-sm text-muted">{diaEscrito(fecha)} · sin pedidos</p>
        </div>
        {/* Un solo «Cargar la guía» (antes estaba también adentro de la hoja y
            no se sabía si era lo mismo). El día empieza por la guía (spec 005). */}
        <button type="button" onClick={onCargarGuia} className={BOTON_PRINCIPAL}>
          <Camera className="h-4 w-4" />
          Cargar la guía
        </button>
        <button
          type="button"
          onClick={onAgregar}
          className="flex w-full items-center justify-center gap-1 py-1 text-sm text-muted active:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar un pedido a mano
        </button>
      </div>
    );
  }

  if (paso === "resolver") {
    return (
      <div className="space-y-2.5">
        <BarraPasos paso="resolver" />
        <div className="flex items-center justify-between gap-2">
          <p className={TITULO}>{pendientes === 1 ? "1 pedido" : `${pendientes} pedidos`}</p>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn">
            <AlertTriangle className="h-3.5 w-3.5" />
            {conProblema} por resolver
          </span>
        </div>
        <button type="button" onClick={onResolver} className={BOTON_PRINCIPAL}>
          <AlertTriangle className="h-4 w-4" />
          {conProblema === 1 ? "Resolver el ⚠" : `Resolver los ${conProblema} ⚠`}
        </button>
        {armarIgual}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <BarraPasos paso="ruta" />
      <div>
        <p className={TITULO}>{pendientes === 1 ? "1 pedido listo" : `${pendientes} pedidos listos`}</p>
        <p className="flex items-center gap-1 text-sm text-muted">
          <Check className="h-3.5 w-3.5 text-ok" />
          {pendientes === 1 ? "Ubicado" : "Todos ubicados"}
        </p>
      </div>
      {armarRuta}
    </div>
  );
}
