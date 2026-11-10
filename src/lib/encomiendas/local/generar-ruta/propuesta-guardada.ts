"use client";

// La propuesta de ruta a la vista sobrevive a cerrar la app (dueño, 2026-11-09):
// antes vivía solo en memoria y, si ARES se cerraba antes de «Usar esta ruta», había
// que armarla de nuevo (unos 20 s y otra vez la matriz y ~20 trazados de ORS).
//
// Se guarda tal como está a la vista —invertida o con otra alternativa elegida— en
// el store `propuestas`, uno por día. Las paradas van como id y punto (el armado
// puede correrlas a su calle de acceso), y el resto del pedido se completa con
// `pedidos` al leer: el nombre y el teléfono no se copian. Los avisos sí van como
// texto (no se rehacen sin recalcular). Todo se borra con el día (STORES_DEL_DIA).
//
// Vale mientras los pendientes del día sean los mismos (la firma): si se agregó,
// borró, ubicó o corrigió un pedido, no se muestra y se arma de nuevo.

import {
  borrarPropuestaGuardada,
  guardarPropuesta,
  leerPedidos,
  leerPropuestaGuardada,
  type Pedido,
} from "../almacen";
import type { ParadaLejana } from "./lejanas";
import type { Alternativa, PedidoUbicado, PropuestaRuta } from "./tipos";

type Punto = { id: string; lat: number; lng: number };

type AlternativaGuardada = Omit<Alternativa, "paradas"> & { paradas: Punto[] };

type PropuestaEnElTelefono = Omit<
  PropuestaRuta,
  "paradas" | "sinUbicar" | "alternativas" | "lejanas" | "deAres" | "alReves" | "esperaTrazado"
> & {
  paradas: Punto[];
  alternativas: AlternativaGuardada[];
  lejanas: Omit<ParadaLejana, "direccion">[];
  deAres?: PropuestaEnElTelefono;
  alReves?: PropuestaEnElTelefono;
};

/** Los pendientes que entran en la propuesta, con lo que cambia el armado. Pura. */
export function firmaDePendientes(pedidos: Pedido[]): string {
  return pedidos
    .filter((p) => p.resultado === "pendiente")
    .map((p) => `${p.id}:${p.lat?.toFixed(5) ?? "-"},${p.lng?.toFixed(5) ?? "-"}:${p.bloqueHorarioId ?? ""}:${p.disponibilidad}:${p.bultos ?? ""}`)
    .sort()
    .join("|");
}

const aPunto = (p: PedidoUbicado): Punto => ({ id: p.id, lat: p.lat, lng: p.lng });

/** La propuesta sin los pedidos adentro. Pura. */
export function propuestaParaGuardar(p: PropuestaRuta): PropuestaEnElTelefono {
  // `sinUbicar` no se guarda (se lee de los pedidos al rearmarla), ni
  // `esperaTrazado` (una que espera su trazado no se guarda, ver abajo).
  return {
    fecha: p.fecha,
    partida: p.partida,
    llegada: p.llegada,
    trazado: p.trazado,
    tramos: p.tramos,
    distanciaM: p.distanciaM,
    duracionS: p.duracionS,
    sinTrazado: p.sinTrazado,
    motivoSinTrazado: p.motivoSinTrazado,
    cerradas: p.cerradas,
    advertencias: p.advertencias,
    elegida: p.elegida,
    paradas: p.paradas.map(aPunto),
    alternativas: p.alternativas.map((a) => ({ ...a, paradas: a.paradas.map(aPunto) })),
    lejanas: p.lejanas.map((l) => ({ pedidoId: l.pedidoId, metrosAlResto: l.metrosAlResto, metrosQueSuma: l.metrosQueSuma })),
    ...(p.deAres ? { deAres: propuestaParaGuardar(p.deAres) } : {}),
    ...(p.alReves ? { alReves: propuestaParaGuardar(p.alReves) } : {}),
  };
}

/** La propuesta rearmada con los pedidos de hoy, o null si alguno ya no está. Pura. */
export function propuestaDesdeGuardada(g: PropuestaEnElTelefono, porId: Map<string, Pedido>): PropuestaRuta | null {
  const ubicar = (puntos: Punto[]): PedidoUbicado[] | null => {
    const paradas: PedidoUbicado[] = [];
    for (const { id, lat, lng } of puntos) {
      const pedido = porId.get(id);
      if (!pedido) return null;
      paradas.push({ ...pedido, lat, lng });
    }
    return paradas;
  };
  const paradas = ubicar(g.paradas);
  if (!paradas) return null;
  const alternativas: Alternativa[] = [];
  for (const a of g.alternativas) {
    const suyas = ubicar(a.paradas);
    if (!suyas) return null;
    alternativas.push({ ...a, paradas: suyas });
  }
  const lejanas: ParadaLejana[] = g.lejanas.map((l) => ({ ...l, direccion: porId.get(l.pedidoId)?.direccion ?? "" }));
  const deAres = g.deAres ? propuestaDesdeGuardada(g.deAres, porId) : undefined;
  const alReves = g.alReves ? propuestaDesdeGuardada(g.alReves, porId) : undefined;
  if (deAres === null || alReves === null) return null;
  return {
    ...g,
    paradas,
    alternativas,
    lejanas,
    sinUbicar: [...porId.values()].filter((p) => p.resultado === "pendiente" && (p.lat == null || p.lng == null)),
    deAres,
    alReves,
  };
}

/** Guarda la propuesta a la vista. Una que espera su trazado (recién invertida) no:
 *  se guarda cuando llega, para no dejar un mapa a medias.
 *
 *  La firma sale de los pedidos guardados, no de los de la pantalla: el armado
 *  ubica pedidos y corre paradas a su calle de acceso en el teléfono sin recargar
 *  la pantalla, y con la firma vieja la propuesta se descartaba al reabrir
 *  (auditoría del día real, 2026-11-10). */
export async function guardarPropuestaVista(fecha: string, propuesta: PropuestaRuta): Promise<void> {
  if (propuesta.esperaTrazado) return;
  await guardarPropuesta({
    fecha,
    firma: firmaDePendientes(await leerPedidos(fecha)),
    datos: propuestaParaGuardar(propuesta),
    guardadaEn: new Date().toISOString(),
  });
}

/** La propuesta guardada de hoy, si sigue valiendo para estos pedidos. La que ya no
 *  vale se borra. No consulta a nadie. */
export async function propuestaGuardada(fecha: string, pedidos: Pedido[]): Promise<PropuestaRuta | null> {
  const guardada = await leerPropuestaGuardada(fecha);
  if (!guardada) return null;
  const propuesta =
    guardada.firma === firmaDePendientes(pedidos)
      ? propuestaDesdeGuardada(guardada.datos as PropuestaEnElTelefono, new Map(pedidos.map((p) => [p.id, p])))
      : null;
  if (!propuesta) await borrarPropuestaGuardada(fecha);
  return propuesta;
}

/** Usada o descartada: deja de estar guardada. */
export function olvidarPropuesta(fecha: string): Promise<void> {
  return borrarPropuestaGuardada(fecha);
}
