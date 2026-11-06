// Usar la ruta propuesta: se guarda como la ruta del día y los ⚠ del armado
// quedan en sus pedidos (sale de index.ts, spec 022).

import type { ProblemaGuardado } from "@/lib/encomiendas/problemas";
import { fijarProblemasDeRuta, guardarRuta } from "../almacen";
import type { PropuestaRuta, ResultadoRuta } from "./tipos";

/** Guarda la propuesta como la ruta del día. Entre calcular y confirmar el
 *  conductor pudo cerrar una parada o agregar un pedido: guardarRuta vuelve a leer
 *  lo guardado y conserva lo cerrado, así que la propuesta nunca lo pisa. */
export async function confirmarRutaLocal(propuesta: PropuestaRuta): Promise<ResultadoRuta> {
  const ruta = await guardarRuta({
    fecha: propuesta.fecha,
    pedidoIdsEnOrden: propuesta.paradas.map((p) => p.id),
    trazado: propuesta.trazado,
    tramos: propuesta.tramos,
    distanciaM: propuesta.distanciaM,
    duracionS: propuesta.duracionS,
    advertencias: propuesta.advertencias,
    propuestasComparadas: propuesta.alternativas.length,
    partida: propuesta.llegada ?? propuesta.partida,
  });
  // La parada lejana y el horario que no alcanza quedan como ⚠ en su pedido
  // (spec 022, US3): se ven en la lista, en «Resolver» y dos paradas antes.
  await fijarProblemasDeRuta(propuesta.fecha, problemasDelArmado(propuesta));

  return { ruta, sinUbicar: propuesta.sinUbicar, sinTrazado: propuesta.sinTrazado };
}

/** Los ⚠ que deja el armado, por pedido: la parada lejana (con lo que está de
 *  lejos) y el horario que la alternativa elegida no alcanza. */
export function problemasDelArmado(propuesta: PropuestaRuta): Map<string, ProblemaGuardado[]> {
  const porPedido = new Map<string, ProblemaGuardado[]>();
  const sumar = (id: string, p: ProblemaGuardado) => porPedido.set(id, [...(porPedido.get(id) ?? []), p]);
  for (const l of propuesta.lejanas) {
    sumar(l.pedidoId, { tipo: "lejana", texto: `Queda a ${(l.metrosAlResto / 1000).toFixed(1).replace(".", ",")} km del resto` });
  }
  const elegida = propuesta.alternativas.find((a) => a.estrategia === propuesta.elegida);
  for (const id of elegida?.fueraDeHorarioIds ?? []) sumar(id, { tipo: "horario", texto: "No alcanza su horario" });
  return porPedido;
}
