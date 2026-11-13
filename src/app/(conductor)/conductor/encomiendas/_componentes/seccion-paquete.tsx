"use client";

// «Paquete» en el formulario del pedido (spec 033, por-pagar y no-editables): el
// POR PAGAR (No · Sí · Por revisar, con el monto), los bultos y cómo es el paquete
// en tres toques. Plegada: la mayoría de las veces llega todo con la etiqueta.
// Guarda en los campos que ya tiene el pedido; nada de esto toca el pago del
// conductor.

import { useState } from "react";
import { ChevronDown, Minus, Package, Plus } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { formatCLP } from "@/lib/comun/format";
import { Campo } from "@/components/ui/campo";
import { notaPaquete, referenciaOVacia, textoReferencia } from "@/lib/encomiendas/paquete";
import { borrarFoto, guardarFoto, type DatosPedido, type Pedido } from "@/lib/encomiendas/local/almacen";
import { CamposPaquete, paqueteDe, type EstadoPaquete } from "./campos-paquete";
import { cobroDelFormulario, montoEscrito } from "../_hooks/por-pagar";

type Cobro = { porPagar: boolean | null; monto: string };

/** El estado de la sección y lo que se guarda con el pedido. */
export function usePaqueteForm(pedido?: Pedido) {
  const [paquete, setPaquete] = useState<EstadoPaquete>(() => paqueteDe(pedido));
  const inicial: Cobro = { porPagar: pedido?.porPagar ?? null, monto: pedido?.montoPorPagar != null ? String(pedido.montoPorPagar) : "" };
  const [cobro, setCobro] = useState<Cobro>(inicial);
  const [bultos, setBultos] = useState<number | null>(pedido?.bultos ?? null);

  const referencia = referenciaOVacia({ tipo: paquete.tipo, tamano: paquete.tamano, color: paquete.color, nota: notaPaquete(paquete.nota) });
  const { porPagar, montoPorPagar } = cobroDelFormulario(cobro.porPagar, cobro.monto);
  const sucio =
    textoReferencia(referencia) !== textoReferencia(pedido?.referencia ?? null) ||
    paquete.fotoNueva != null ||
    paquete.quitarFoto ||
    porPagar !== (pedido?.porPagar ?? null) ||
    montoPorPagar !== (pedido?.montoPorPagar ?? null) ||
    bultos !== (pedido?.bultos ?? null);

  return {
    paquete,
    cambiarPaquete: (c: Partial<EstadoPaquete>) => setPaquete((p) => ({ ...p, ...c })),
    cobro,
    setCobro,
    bultos,
    setBultos,
    sucio,
    /** Lo que va con guardarPedido. */
    datos: (): Partial<DatosPedido> => ({ referencia, porPagar, montoPorPagar, bultos }),
    /** La foto va aparte: tiene su store. */
    guardarFotoDe: async (pedidoId: string) => {
      if (paquete.fotoNueva) await guardarFoto(pedidoId, paquete.fotoNueva);
      else if (paquete.quitarFoto) await borrarFoto(pedidoId);
    },
  };
}

export type PaqueteForm = ReturnType<typeof usePaqueteForm>;

const OPCION = "flex h-10 items-center justify-center rounded-full text-sm font-semibold";

export function SeccionPaquete({ form, fotoGuardadaId, deshabilitado }: { form: PaqueteForm; fotoGuardadaId: string | null; deshabilitado: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const { cobro, setCobro, bultos, setBultos } = form;
  const monto = montoEscrito(cobro.monto);
  const resumen = [
    cobro.porPagar === null ? "POR PAGAR por revisar" : cobro.porPagar ? `POR PAGAR ${monto != null ? formatCLP(monto) : "· monto por revisar"}` : "No se cobra",
    bultos != null && bultos > 1 ? `${bultos} bultos` : null,
    textoReferencia(form.datos().referencia ?? null),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-[14px] border border-separator">
      <button
        type="button"
        onClick={() => setAbierta(!abierta)}
        aria-expanded={abierta}
        className="flex min-h-11 w-full items-center gap-2 px-3.5 text-left text-sm font-medium"
      >
        <Package className="h-4 w-4 shrink-0 text-brand" />
        <span className="shrink-0">Paquete</span>
        <span className={cn("min-w-0 flex-1 truncate text-xs", cobro.porPagar === null ? "font-semibold text-warn" : "text-muted")}>
          {resumen}
          {cobro.porPagar === null ? " ⚠" : ""}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", abierta && "rotate-180")} />
      </button>
      {abierta ? (
        <div className="grid gap-2.5 border-t border-divider p-3">
          <p className="text-sm font-medium">POR PAGAR</p>
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="POR PAGAR">
            {([
              [false, "No"],
              [true, "Sí"],
              [null, "Por revisar"],
            ] as const).map(([valor, texto]) => (
              <button
                key={texto}
                type="button"
                role="radio"
                aria-checked={cobro.porPagar === valor}
                onClick={() => setCobro({ ...cobro, porPagar: valor })}
                className={cn(OPCION, cobro.porPagar === valor ? "bg-brand text-brand-foreground" : "border border-separator bg-card")}
              >
                {texto}
              </button>
            ))}
          </div>
          {cobro.porPagar ? (
            <Campo
              etiqueta="Monto"
              inputMode="numeric"
              placeholder="12.345"
              value={cobro.monto}
              onChange={(e) => setCobro({ ...cobro, monto: e.target.value })}
              className="font-mono tabular-nums"
            />
          ) : null}
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium">Bultos</p>
            <button
              type="button"
              aria-label="Un bulto menos"
              disabled={(bultos ?? 1) <= 1}
              onClick={() => setBultos(Math.max(1, (bultos ?? 1) - 1))}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-separator disabled:opacity-40"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center font-mono text-base font-semibold tabular-nums">{bultos ?? 1}</span>
            <button
              type="button"
              aria-label="Un bulto más"
              onClick={() => setBultos((bultos ?? 1) + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-separator"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <CamposPaquete valor={form.paquete} onCambiar={form.cambiarPaquete} fotoGuardadaId={fotoGuardadaId} deshabilitado={deshabilitado} />
        </div>
      ) : null}
    </div>
  );
}
