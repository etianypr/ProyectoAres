"use client";

// Los seis campos que definen cuánto vale un día de reparto: cuánto se estima
// que entra por entrega, el fijo por día trabajado, cómo se paga cada pedido y
// el bono opcional por meta.
//
// Viven acá y no dentro de un formulario porque ahora hay TRES lugares que los
// piden: la regla de pago (regla-pago.tsx), la carga de un día pasado con otra
// tarifa (agregar-dia.tsx) y el recálculo de un día ya cargado
// (actividad-dia.tsx). Son los mismos números y los mismos `name`, que es lo que
// permite que el servidor los lea con una sola función (leerTarifa, actions.ts).
//
// Si estuvieran copiados en cada pantalla, arreglar el parseo del porcentaje en
// una y olvidarse de las otras dos daría sueldos distintos según desde dónde se
// cargó el día — sin ningún aviso.

import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/label";
import type { TarifaPago } from "@/lib/encomiendas/pago";
import { ENCOMIENDA_TIPO_PAGO, type EncomiendaTipoPago } from "@/types/db";

/** Lo que hay TECLEADO en el formulario: texto, no números. Los montos van en
 *  crudo (solo dígitos), que es lo que entrega MoneyInput y lo que el servidor
 *  espera leer con num(). */
export type ValoresTarifa = {
  tipo_pago: EncomiendaTipoPago;
  valor_pedido: string;
  valor_pago: string;
  monto_dia: string;
  meta_entregas_dia: string;
  bono_monto: string;
};

/** Prellena los campos con una tarifa existente —la regla de pago, o la que un
 *  día ya tiene congelada—. Casi siempre se cambia UNA cosa, así que arrancar
 *  en blanco es la forma más fácil de guardar una tarifa distinta a la que se
 *  quería. */
export function valoresDeTarifa(tarifa: TarifaPago | null): ValoresTarifa {
  if (!tarifa) {
    return {
      tipo_pago: "porcentaje",
      valor_pedido: "",
      valor_pago: "",
      monto_dia: "",
      meta_entregas_dia: "",
      bono_monto: "",
    };
  }
  const valorPago = Number(tarifa.valor_pago ?? 0);
  return {
    tipo_pago: tarifa.tipo_pago,
    valor_pedido: String(tarifa.valor_pedido ?? ""),
    // El porcentaje admite decimales y el monto fijo son pesos sin decimales:
    // "7.5" tiene que sobrevivir, "950.00" tiene que quedar en "950".
    valor_pago:
      tarifa.tipo_pago === "porcentaje" ? String(valorPago) : String(Math.round(valorPago)),
    monto_dia: String(tarifa.monto_dia ?? 0),
    meta_entregas_dia: tarifa.meta_entregas_dia != null ? String(tarifa.meta_entregas_dia) : "",
    bono_monto: tarifa.bono_monto != null ? String(tarifa.bono_monto) : "",
  };
}

/** La tarifa que representan los campos, para poder mostrar la plata ANTES de
 *  guardar. Tiene que leer los mismos textos igual que leerTarifa() en el
 *  servidor, o la vista previa mostraría una cifra distinta de la que se
 *  guarda: los montos son dígitos crudos y el porcentaje admite coma o punto. */
export function tarifaDeValores(v: ValoresTarifa): TarifaPago {
  const entero = (texto: string) => {
    const n = Math.trunc(Number(texto.replace(/\D/g, "")));
    return Number.isFinite(n) ? n : 0;
  };
  const decimal = (texto: string) => {
    const n = Number(texto.trim().replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };

  return {
    tipo_pago: v.tipo_pago,
    valor_pago: v.tipo_pago === "porcentaje" ? decimal(v.valor_pago) : entero(v.valor_pago),
    valor_pedido: entero(v.valor_pedido),
    monto_dia: entero(v.monto_dia),
    // Sin meta no hay bono: el par se completa o no existe, igual que en el
    // servidor y en la base.
    meta_entregas_dia: v.meta_entregas_dia.trim() === "" ? null : entero(v.meta_entregas_dia),
    bono_monto: v.bono_monto.trim() === "" ? null : entero(v.bono_monto),
  };
}

/** Los campos sueltos, sin <form> ni contenedor: se sueltan dentro de la grilla
 *  de quien los use (todas son `grid sm:grid-cols-2`). */
export function CamposTarifa({
  valores,
  onChange,
}: {
  valores: ValoresTarifa;
  onChange: (valores: ValoresTarifa) => void;
}) {
  const set = <K extends keyof ValoresTarifa>(campo: K, valor: ValoresTarifa[K]) =>
    onChange({ ...valores, [campo]: valor });

  return (
    <>
      <Field
        label="Ingreso aproximado por entrega"
        htmlFor="valor_pedido"
        hint="Lo que se estima que entra por cada paquete entregado"
      >
        <MoneyInput
          id="valor_pedido"
          name="valor_pedido"
          value={valores.valor_pedido}
          onChange={(v) => set("valor_pedido", v)}
          placeholder="950"
        />
      </Field>
      <Field
        label="Fijo por día trabajado"
        htmlFor="monto_dia"
        hint="Se paga cada día que salió a repartir, aunque no logre entregas"
      >
        <MoneyInput
          id="monto_dia"
          name="monto_dia"
          value={valores.monto_dia}
          onChange={(v) => set("monto_dia", v)}
          placeholder="0"
        />
      </Field>

      <Field label="Tipo de pago" htmlFor="tipo_pago">
        <Select
          id="tipo_pago"
          name="tipo_pago"
          value={valores.tipo_pago}
          onChange={(e) => set("tipo_pago", e.target.value as EncomiendaTipoPago)}
        >
          {Object.entries(ENCOMIENDA_TIPO_PAGO).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={valores.tipo_pago === "porcentaje" ? "Porcentaje (%)" : "Monto fijo por pedido"}
        htmlFor="valor_pago"
        hint={
          valores.tipo_pago === "porcentaje"
            ? "Del ingreso estimado, o sea del valor por entrega de arriba"
            : undefined
        }
      >
        {valores.tipo_pago === "porcentaje" ? (
          <Input
            id="valor_pago"
            name="valor_pago"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={valores.valor_pago}
            onChange={(e) => set("valor_pago", e.target.value)}
            required
          />
        ) : (
          <MoneyInput
            id="valor_pago"
            name="valor_pago"
            value={valores.valor_pago}
            onChange={(v) => set("valor_pago", v)}
            placeholder="0"
          />
        )}
      </Field>

      <Field label="Meta de entregas/día para el bono" htmlFor="meta_entregas_dia" hint="Opcional">
        <Input
          id="meta_entregas_dia"
          name="meta_entregas_dia"
          type="number"
          min={1}
          value={valores.meta_entregas_dia}
          onChange={(e) => set("meta_entregas_dia", e.target.value)}
        />
      </Field>
      <Field label="Monto del bono" htmlFor="bono_monto" hint="Opcional">
        <MoneyInput
          id="bono_monto"
          name="bono_monto"
          value={valores.bono_monto}
          onChange={(v) => set("bono_monto", v)}
          placeholder="0"
        />
      </Field>
    </>
  );
}
