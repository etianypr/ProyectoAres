import "server-only";

// La tarifa de un día leída del formulario, compartida por la regla de pago y por
// los días cargados a mano (sale de actions.ts, spec 002 T040).

import { intNull, num, sReq } from "@/lib/comun/forms";
import { TIPOS_PAGO, esClave } from "@/lib/encomiendas/catalogos";
import type { Tarifa } from "@/lib/encomiendas/pago";

// ----------------------------------------------------------------------------
// La tarifa: los seis números que definen cuánto vale un día
//
// Son exactamente los mismos para la regla global (guardarReglaPago) y para la
// tarifa que se le dicta a un día suelto al cargarlo (0033), así que se leen y
// se validan en un solo lugar. Si se validaran por separado, la regla podría
// aceptar algo que el día rechaza —o al revés— y la diferencia solo aparecería
// en un sueldo mal calculado.
// ----------------------------------------------------------------------------

// El porcentaje NO puede leerse con num(): ese helper borra los puntos para
// soportar el formato chileno de miles ("1.234.567"), y el <input type=
// "number" step="0.1"> del formulario envía "7.5" — que num() convertiría en
// 75. Un 7,5 % guardado como 75 % es diez veces el pago del conductor, todos
// los días, sin ningún aviso. Acá el punto SÍ es separador decimal.
function porcentaje(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function leerTarifa(formData: FormData): { tarifa: Tarifa } | { error: string } {
  const tipo_pago = sReq(formData.get("tipo_pago"));
  if (!esClave(TIPOS_PAGO, tipo_pago)) return { error: "Tipo de pago inválido." };

  // El % admite decimales; el monto fijo por pedido son pesos con separador
  // de miles. Dos formatos distintos, dos parsers distintos.
  const valor_pago =
    tipo_pago === "porcentaje"
      ? porcentaje(formData.get("valor_pago"))
      : num(formData.get("valor_pago"));
  if (valor_pago < 0) return { error: "El valor de pago no puede ser negativo." };
  if (tipo_pago === "porcentaje" && valor_pago > 100) {
    return { error: "El porcentaje no puede superar 100." };
  }

  // Sin valor por entrega no hay ingreso estimado, y con tipo_pago porcentaje
  // tampoco hay sueldo: el 7 % de cero es cero. Así que se exige.
  const valor_pedido = intNull(formData.get("valor_pedido"));
  if (valor_pedido == null || valor_pedido <= 0) {
    return { error: "Pon cuánto se estima que entra por cada entrega." };
  }

  const monto_dia = intNull(formData.get("monto_dia")) ?? 0;
  if (monto_dia < 0) return { error: "El monto por día no puede ser negativo." };

  const meta_entregas_dia = intNull(formData.get("meta_entregas_dia"));
  const bono_monto = intNull(formData.get("bono_monto"));
  if ((meta_entregas_dia == null) !== (bono_monto == null)) {
    return { error: "Para el bono, completa tanto la meta de entregas como el monto." };
  }

  return {
    tarifa: { tipo_pago, valor_pago, valor_pedido, monto_dia, meta_entregas_dia, bono_monto },
  };
}

/** Los argumentos con los que la base valora un día con una tarifa dictada a
 *  mano (encomienda_valorar_dia, 0033). */
export function argumentosValorar(conductorId: string, fecha: string, tarifa: Tarifa) {
  return {
    p_conductor_id: conductorId,
    p_fecha: fecha,
    p_valor_pedido: tarifa.valor_pedido,
    p_tipo_pago: tarifa.tipo_pago,
    p_valor_pago: tarifa.valor_pago,
    p_monto_dia: tarifa.monto_dia,
    p_meta_entregas_dia: tarifa.meta_entregas_dia,
    p_bono_monto: tarifa.bono_monto,
  };
}
