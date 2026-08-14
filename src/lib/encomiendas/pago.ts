// Agrupación de la actividad por día, y la cuenta del ingreso y del pago.
// Funciones puras, en un archivo SIN "use server" (ver la nota de ./actions.ts:
// un módulo "use server" solo puede exportar funciones async).
//
// ⚠️ LA CUENTA DE ACÁ NO ES LA QUE MANDA (0031).
//
// Lo que vale un día lo calcula y lo escribe la BASE, en
// private.encomienda_congelar_dia(), apenas cambia la actividad de ese día. Las
// pantallas leen esas cifras ya congeladas de encomienda_pagos; no recalculan
// nada.
//
// La cuenta tiene que vivir allá porque el teléfono del conductor inserta su
// actividad directo contra Postgres (ver 0026) y no pasa por el servidor de la
// app: en ese momento no hay TypeScript que pueda correr.
//
// calcularPagoDia e ingresoEstimado sobreviven acá para UNA cosa: las vistas
// previas —"Agregar día" y "Recalcular"—, que muestran cuánto va a quedar el
// día ANTES de escribirlo, mientras se teclean los números. Eso no puede salir
// de la base sin una consulta por tecla, y desde que la tarifa se puede editar
// a mano (0033) lo que se teclea es también la tarifa.
//
// O sea que son dos copias de la misma aritmética. Si cambia una, hay que
// cambiar la otra — está anotado también en la 0031.

import { VALOR_APROXIMADO_PEDIDO } from "./config";
import type {
  EncomiendaActividadOrigen,
  EncomiendaActividadTipo,
  EncomiendaPago,
  EncomiendaTipoPago,
} from "@/types/db";

/** Cómo cerró el día un conductor. Sale de contar los eventos que el teléfono
 *  registró en encomienda_actividad para ese (chofer, fecha) — ver 0026.
 *
 *  Ya no existe un "sinCerrar": las paradas que el conductor no llegó a cerrar
 *  viven en su teléfono y nunca se envían, así que el servidor no las conoce.
 *  Para la liquidación es irrelevante (nunca se pagaron), y para el panel era un
 *  dato que solo aparecía si la ruta estaba en la base. */
export type ConteoDia = {
  entregados: number;
  omitidos: number;
};

/** Los números que definen cuánto vale un día.
 *
 *  Los tiene la regla de pago, pero también —congelados— cada día ya calculado
 *  (0031). Y esa es la razón de que este tipo exista aparte: agregarle
 *  actividad a un día que YA existe lo recalcula con la tarifa de ese día, no
 *  con la regla de ahora. Una vista previa que use la regla mostraría una cifra
 *  distinta de la que la base va a escribir. */
export type TarifaPago = {
  tipo_pago: EncomiendaTipoPago;
  valor_pago: number;
  valor_pedido: number;
  monto_dia: number;
  meta_entregas_dia: number | null;
  bono_monto: number | null;
};

/** La tarifa con la que está calculado un día, si la tiene. */
export function tarifaDelDia(pago: EncomiendaPago | null | undefined): TarifaPago | null {
  if (!pago || pago.regla_valor_pedido == null || pago.regla_tipo_pago == null) return null;
  return {
    tipo_pago: pago.regla_tipo_pago,
    valor_pago: Number(pago.regla_valor_pago ?? 0),
    valor_pedido: pago.regla_valor_pedido,
    monto_dia: pago.regla_monto_dia ?? 0,
    meta_entregas_dia: pago.regla_meta_entregas_dia,
    bono_monto: pago.regla_bono_monto,
  };
}

/** Cuánto se estima que entra por cada entrega (0029). Sin tarifa no hay valor
 *  y se cae al respaldo, para que la vista previa muestre algo en vez de un
 *  hueco.
 *
 *  numeric/integer de PostgREST puede llegar como string: sin este Number() y
 *  su comprobación, un NaN se pasearía por la pantalla. */
export function valorPedido(tarifa: TarifaPago | null | undefined): number {
  const valor = Number(tarifa?.valor_pedido);
  return Number.isFinite(valor) && valor > 0 ? valor : VALOR_APROXIMADO_PEDIDO;
}

// Ingreso ESTIMADO, no real: Starken maneja el valor de cada envío en su
// propio sistema y Pucarani nunca lo conoce (ver la 0021). Lo real se anota a
// mano por mes y se contrasta contra esto (encomienda_ingresos_reales, 0029).
//
// El valor por entrega se pide explícito y no se toma de una constante: es
// configurable, así que quien llame tiene que decir con cuál está calculando
// en vez de suponerlo.
export function ingresoEstimado(entregados: number, valorPorEntrega: number): number {
  return Math.round(entregados * valorPorEntrega);
}

// Ya no hay una función "diaTrabajado". Antes hacía falta porque una ruta podía
// existir en la base sin que el conductor hubiera salido (la app la generaba
// sola al abrirla), así que había que deducir el día trabajado del estado de la
// ruta — con todo el enredo que documenta la 0025.
//
// Con la actividad en eventos la pregunta desaparece: una fila en
// encomienda_actividad SOLO existe si el conductor hizo algo en terreno, aunque
// haya sido nada más que llamar. Si no salió, no hay filas y ese (chofer, fecha)
// simplemente no aparece. Así que todo lo que llega hasta acá es un día
// trabajado, por definición.

// Ya no existe reglaVigente(). Resolvía cuál de las reglas del historial regía
// una fecha, con precedencia por conductor y desempate por created_at. Todo eso
// se fue con el historial (0031): ahora hay una sola regla y lo que protege al
// pasado no es la vigencia, son las cifras ya escritas de cada día.

export type PagoDesglose = {
  /** Por cantidad de pedidos entregados. */
  base: number;
  /** Fijo por el día trabajado. */
  dia: number;
  /** Bono por alcanzar la meta de entregas del día. */
  bono: number;
  total: number;
};

export const PAGO_CERO: PagoDesglose = { base: 0, dia: 0, bono: 0, total: 0 };

/** VISTA PREVIA del pago de un día. La cifra que se guarda NO sale de acá: la
 *  escribe private.encomienda_congelar_dia() en la base (ver la cabecera).
 *  Tiene que dar exactamente lo mismo que esa función — si tocás una, tocá la
 *  otra.
 *
 *  El fijo diario se paga sin condición porque esto solo se usa para un día que
 *  tiene (o va a tener) actividad, y eso ES la definición de día trabajado. */
export function calcularPagoDia(
  conteo: ConteoDia,
  tarifa: TarifaPago | null,
): PagoDesglose {
  if (!tarifa) return PAGO_CERO;

  // valor_pago es numeric: PostgREST lo devuelve como string ("15.00").
  const valor = Number(tarifa.valor_pago);
  const base =
    tarifa.tipo_pago === "porcentaje"
      ? // El porcentaje se calcula sobre el ingreso estimado con el valor por
        // entrega DE ESTA MISMA TARIFA. Por eso valor_pedido va junto y no en
        // una configuración aparte: es parte de la fórmula del sueldo.
        Math.round((ingresoEstimado(conteo.entregados, valorPedido(tarifa)) * valor) / 100)
      : Math.round(conteo.entregados * valor);

  const dia = Number(tarifa.monto_dia ?? 0);

  // >= y no >: alcanzar la meta ya paga el bono (el texto de la pantalla de
  // reglas dice lo mismo).
  const bono =
    tarifa.meta_entregas_dia != null && conteo.entregados >= tarifa.meta_entregas_dia
      ? Number(tarifa.bono_monto ?? 0)
      : 0;

  return { base, dia, bono, total: base + dia + bono };
}

/** Cuenta los eventos de un (chofer, fecha). Los de tipo "llamada" no suman ni
 *  restan: están para probar que el conductor salió, y eso ya lo dice el hecho
 *  de que exista aunque sea una fila. */
export function contarActividad(eventos: { tipo: EncomiendaActividadTipo }[]): ConteoDia {
  return {
    entregados: eventos.filter((e) => e.tipo === "entrega").length,
    omitidos: eventos.filter((e) => e.tipo === "omision").length,
  };
}

export type EventoActividad = {
  chofer_id: string | null;
  fecha: string;
  tipo: EncomiendaActividadTipo;
  origen: EncomiendaActividadOrigen;
};

export type DiaActividad<T extends EventoActividad> = {
  /** null si el conductor fue eliminado después (la FK es on delete set null,
   *  ver 0026): el día se sigue viendo, pero no se puede liquidar. */
  choferId: string | null;
  fecha: string;
  conteo: ConteoDia;
  /** Los eventos crudos del día, para las pantallas que muestran horas. */
  eventos: T[];
  /** Cuántos de esos eventos los cargó la oficina a mano (0028). 0 = día
   *  íntegro del teléfono; igual a eventos.length = día íntegro de oficina;
   *  algo en medio = el teléfono alcanzó a mandar una parte y la oficina
   *  completó el resto. La distinción no cambia el pago, pero sí lo que la
   *  pantalla puede afirmar sobre el día (ver el badge "Carga manual"). */
  manuales: number;
};

// Agrupa los eventos por (conductor, día), más nuevo primero. Solo aparecen los
// pares que tienen al menos un evento — y eso ES la definición de día
// trabajado, así que todo lo que sale de acá se paga.
//
// Una sola implementación para el panel del periodo, la vista del día y la
// confirmación de pagos: si cada uno agrupara a su manera, la proyección y lo
// confirmado podrían no coincidir sin que nadie se entere.
export function agruparPorDia<T extends EventoActividad>(eventos: T[]): DiaActividad<T>[] {
  const mapa = new Map<string, DiaActividad<T>>();

  for (const evento of eventos) {
    const clave = `${evento.fecha}|${evento.chofer_id ?? ""}`;
    let dia = mapa.get(clave);
    if (!dia) {
      dia = {
        choferId: evento.chofer_id,
        fecha: evento.fecha,
        conteo: { entregados: 0, omitidos: 0 },
        eventos: [],
        manuales: 0,
      };
      mapa.set(clave, dia);
    }
    dia.eventos.push(evento);
    if (evento.tipo === "entrega") dia.conteo.entregados++;
    if (evento.tipo === "omision") dia.conteo.omitidos++;
    if (evento.origen === "manual") dia.manuales++;
  }

  return [...mapa.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
}
