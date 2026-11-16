"use client";

// La cabecera de la hoja antes de armar la ruta (spec 027, pasos 1 a 3): cargar
// la guía, resolver los ⚠ o armar la ruta. Cada paso con su botón, a la vista
// con la hoja cerrada; lo de adentro es solo lo de ese paso.
//
// Mientras se carga un pedido la cabecera se calla y queda un contador de
// pendientes: los pedidos se cargan en tanda, y armar la ruta a mitad de una tanda
// deja afuera los que faltaban.

import { AlertTriangle, Camera, Check, ChevronRight, Plus } from "lucide-react";
import type { Paso } from "../_hooks/paso-del-dia";
import { BOTON_PRINCIPAL } from "./parada-activa";

/** "Viernes 6 de noviembre", de "YYYY-MM-DD" (a mediodía: sin correrse de día). */
function diaEscrito(fecha: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${fecha}T12:00:00`))
    .replace(",", "");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const TITULO = "text-[21px] font-extrabold leading-tight tracking-tight";
const SECUNDARIO =
  "flex h-10 items-center justify-center gap-1.5 rounded-full border border-separator bg-card text-sm font-semibold text-brand active:scale-[0.97]";

/** Con pedidos ya cargados, sumar más queda a la vista con la hoja cerrada, como al empezar
 *  el día (dueño, 2026-11-15: «ahora que tengo 21 pedidos listos debería existir la
 *  posibilidad de agregar más»). Antes eran dos enlaces chicos al final de la lista, dentro
 *  de la hoja (enlaces-hoja.tsx), y no se veían. */
function MasPedidos({ onCargarGuia, onAgregar }: { onCargarGuia: () => void; onAgregar: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={onCargarGuia} className={SECUNDARIO}>
        <Camera className="h-4 w-4" />
        Agregar guía
      </button>
      <button type="button" onClick={onAgregar} className={SECUNDARIO}>
        <Plus className="h-4 w-4" />
        Agregar pedido
      </button>
    </div>
  );
}

export function CabeceraSinParada({
  paso,
  cargando,
  pendientes,
  conProblema,
  fecha,
  onCargarGuia,
  onAgregar,
  onResolver,
  armarRuta,
}: {
  paso: Extract<Paso, "guia" | "resolver" | "ruta">;
  /** Está abierto el formulario de un pedido. */
  cargando: boolean;
  /** Pedidos pendientes, todavía sin ruta. */
  pendientes: number;
  /** Cuántos de ellos tienen un ⚠. */
  conProblema: number;
  fecha: string;
  onCargarGuia: () => void;
  onAgregar: () => void;
  /** Abre el primer pedido con ⚠ y, al guardarlo, el siguiente. */
  onResolver: () => void;
  /** El botón para armar la ruta (GenerarRutaLocal): con ⚠, pregunta antes. */
  armarRuta: React.ReactNode;
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
          <p className="text-xs text-muted">Sin ruta asignada.</p>
        </div>
      </div>
    );
  }

  if (paso === "guia") {
    return (
      <div className="space-y-2.5">
        {/* Sin saludo: el estado y la fecha, como una app de transportes (dueño,
            2026-11-15, lenguaje de pantalla). El nombre del conductor está en el menú. */}
        <div>
          <p className={TITULO}>Sin pedidos para hoy</p>
          <p className="text-sm text-muted">{diaEscrito(fecha)}</p>
        </div>
        {/* Un solo «Cargar guía» (antes estaba también adentro de la hoja y
            no se sabía si era lo mismo). El día empieza por la guía (spec 005). */}
        <button type="button" onClick={onCargarGuia} className={BOTON_PRINCIPAL}>
          <Camera className="h-4 w-4" />
          Cargar guía
        </button>
        <button
          type="button"
          onClick={onAgregar}
          className="flex w-full items-center justify-center gap-1 py-1 text-sm text-muted active:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar pedido manualmente
        </button>
      </div>
    );
  }

  if (paso === "resolver") {
    return (
      <div className="space-y-2.5">
        {/* Un solo «Armar la ruta» (dueño, 2026-11-09: dos botones grandes se
            veían toscos). Resolver queda en la pastilla, a un toque. */}
        <div className="flex items-center justify-between gap-2">
          <p className={TITULO}>{pendientes === 1 ? "1 pedido" : `${pendientes} pedidos`}</p>
          <button
            type="button"
            onClick={onResolver}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full bg-warn-bg px-3 text-xs font-semibold text-warn active:scale-[0.97]"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {conProblema} por resolver
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {armarRuta}
        <MasPedidos onCargarGuia={onCargarGuia} onAgregar={onAgregar} />
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div>
        <p className={TITULO}>{pendientes === 1 ? "1 pedido listo" : `${pendientes} pedidos listos`}</p>
        <p className="flex items-center gap-1 text-sm text-muted">
          <Check className="h-3.5 w-3.5 text-ok" />
          {pendientes === 1 ? "Ubicado" : "Todos ubicados"}
        </p>
      </div>
      {armarRuta}
      <MasPedidos onCargarGuia={onCargarGuia} onAgregar={onAgregar} />
    </div>
  );
}
