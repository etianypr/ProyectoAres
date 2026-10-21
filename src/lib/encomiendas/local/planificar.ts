// A qué hora se llega a cada parada y dónde va un pedido con horario.
//
// Lo usan el selector inicial (estrategia "respeta horarios", ver
// generar-ruta.ts) y la ruta en curso cuando un receptor elige otro horario
// (ver replanificar.ts). Puro: sin red ni IndexedDB.
//
// Es una ESTIMACIÓN y la pantalla lo dice: promedio urbano y minutos fijos por
// parada. Alcanza para ordenar y para avisar "no llegas a su horario"; no para
// prometerle una hora al receptor, y por eso el WhatsApp no promete ninguna.

import { bloquePorId } from "@/lib/encomiendas/config";
import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";

/** Velocidad urbana promedio en Arica, contando semáforos y esperas. */
export const KMH_CIUDAD = 25;

/** Cuánto se tarda en cada parada: estacionar, caminar, entregar, volver. */
export const MIN_POR_PARADA = 4;

/** Cuánto se puede llegar tarde a un bloque antes de AVISAR que no se cumple.
 *  Al ordenar se apunta al bloque mismo: la holgura es para el error de la
 *  estimación, no un objetivo. */
export const MIN_TOLERANCIA_BLOQUE = 15;

/** Sin matriz de calles, la línea recta se alarga en este factor: en Arica las
 *  calles no van derecho, y una quebrada en el medio puede doblar el camino. */
export const FACTOR_CALLES = 1.3;

/** Lo mínimo que el planificador necesita saber de un pedido. */
export type PuntoDeRuta = { id: string; lat: number; lng: number; bloqueHorarioId: string | null };

/** Metros por calle entre dos puntos. `a` es null cuando se parte del inicio. */
export type MetrosEntre = (a: PuntoDeRuta | null, b: PuntoDeRuta) => number;

/** Sin matriz: línea recta corregida por FACTOR_CALLES. */
export function metrosEstimados(desde: Coordenada): MetrosEntre {
  return (a, b) => distanciaMetros(a ?? desde, b) * FACTOR_CALLES;
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function ventana(p: PuntoDeRuta): { abre: number; cierra: number } | null {
  const b = bloquePorId(p.bloqueHorarioId);
  return b ? { abre: minutos(b.desde), cierra: minutos(b.hasta) } : null;
}

/** Minutos fuera de la ventana [abre, cierra + tolerancia] (0 = dentro). */
function fueraDe(llegada: number, p: PuntoDeRuta, tolerancia: number): number {
  const v = ventana(p);
  if (!v) return 0;
  return Math.max(0, v.abre - llegada) + Math.max(0, llegada - (v.cierra + tolerancia));
}

type Simulacion = { llegadas: number[]; termino: number };

/** Recorre el orden y estima a qué minuto del día se atiende cada parada.
 *
 *  Llegar antes de que abra un bloque es una visita perdida, salvo al FINAL de
 *  la ruta: si detrás solo quedan pedidos con horario, el conductor puede ir
 *  cuando abre (y eso no atrasa a nadie sin horario). Ahí se espera. */
function simular(orden: PuntoDeRuta[], minutoInicio: number, metros: MetrosEntre): Simulacion {
  const ultimoSinBloque = orden.findLastIndex((p) => !ventana(p));
  let t = minutoInicio;
  let anterior: PuntoDeRuta | null = null;
  const llegadas = orden.map((p, i) => {
    t += (metros(anterior, p) / 1000 / KMH_CIUDAD) * 60;
    const v = ventana(p);
    if (v && i > ultimoSinBloque && t < v.abre) t = v.abre;
    const llegada = t;
    t += MIN_POR_PARADA;
    anterior = p;
    return llegada;
  });
  return { llegadas, termino: t };
}

/** Minuto del día en que se atiende cada parada del orden. */
export function llegadas(orden: PuntoDeRuta[], minutoInicio: number, metros: MetrosEntre): number[] {
  return simular(orden, minutoInicio, metros).llegadas;
}

/** Minutos fuera del bloque elegido, con la tolerancia de aviso (0 = dentro). */
export function minutosFueraDeBloque(llegada: number, parada: PuntoDeRuta): number {
  return fueraDe(llegada, parada, MIN_TOLERANCIA_BLOQUE);
}

/** Metros de recorrer el orden completo desde el inicio. */
export function metrosDelOrden(orden: PuntoDeRuta[], metros: MetrosEntre): number {
  let total = 0;
  let anterior: PuntoDeRuta | null = null;
  for (const p of orden) {
    total += metros(anterior, p);
    anterior = p;
  }
  return total;
}

/** Mete cada pedido con horario donde se atiende dentro de su bloque. `base`
 *  conserva su orden: solo se insertan los nuevos.
 *
 *  Van de a uno, del bloque más temprano al más tarde. Cada lugar posible se
 *  compara por: minutos fuera de horario de TODA la ruta (para que meter uno no
 *  deje fuera a otro ya ubicado), después a qué hora termina el recorrido, y
 *  después los metros. Un bloque que ya no se alcanza en ningún lugar no
 *  reordena nada: el pedido va al final y queda el aviso para llamarlo. */
export function ubicarConHorario<T extends PuntoDeRuta>(
  base: T[],
  conHorario: T[],
  minutoInicio: number,
  metros: MetrosEntre,
): T[] {
  const abre = (p: T) => ventana(p)?.abre ?? Infinity;
  let orden = [...base];

  for (const p of [...conHorario].sort((a, b) => abre(a) - abre(b))) {
    let mejor: { orden: T[]; i: number; fuera: number; termino: number; metros: number } | null =
      null;
    for (let i = 0; i <= orden.length; i++) {
      const prueba = [...orden.slice(0, i), p, ...orden.slice(i)];
      const sim = simular(prueba, minutoInicio, metros);
      const fuera = prueba.reduce((suma, q, k) => suma + fueraDe(sim.llegadas[k], q, 0), 0);
      const candidato = { orden: prueba, i, fuera, termino: sim.termino, metros: metrosDelOrden(prueba, metros) };
      if (
        !mejor ||
        candidato.fuera < mejor.fuera ||
        (candidato.fuera === mejor.fuera && candidato.termino < mejor.termino) ||
        (candidato.fuera === mejor.fuera &&
          candidato.termino === mejor.termino &&
          candidato.metros < mejor.metros)
      ) {
        mejor = candidato;
      }
    }
    const alcanza =
      mejor && minutosFueraDeBloque(simular(mejor.orden, minutoInicio, metros).llegadas[mejor.i], p) === 0;
    orden = mejor && alcanza ? mejor.orden : [...orden, p];
  }

  return orden;
}

/** Los pedidos a cuyo bloque se llegaría fuera de horario con este orden. */
export function fueraDeHorario<T extends PuntoDeRuta>(
  orden: T[],
  minutoInicio: number,
  metros: MetrosEntre,
): T[] {
  const t = llegadas(orden, minutoInicio, metros);
  return orden.filter((p, i) => minutosFueraDeBloque(t[i], p) > 0);
}

/** Minuto del día de un instante, en la hora del teléfono (que está en Chile). */
export function minutoDelDia(instante: Date = new Date()): number {
  return instante.getHours() * 60 + instante.getMinutes();
}
