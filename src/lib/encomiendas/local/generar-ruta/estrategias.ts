// Las tres maneras de ordenar el día y cuáles vale la pena mostrar.

import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { bloquePorId } from "@/lib/encomiendas/config";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { estaConfirmado } from "@/lib/encomiendas/estados";
import { FACTOR_CALLES, fueraDeHorario, metrosDelOrden, metrosEstimados, ubicarConHorario, type MetrosEntre } from "../planificar";
import type { Alternativa, EstrategiaRuta, PedidoUbicado } from "./tipos";

// ----------------------------------------------------------------------------
// De una ruta a tres: las estrategias
// ----------------------------------------------------------------------------
//
// El documento principal pide algo que no es "la ruta más corta": pide el mejor
// resultado OPERATIVO, contando los bloques horarios que eligieron los
// receptores, quiénes confirmaron y cuántos pedidos se pueden llegar a entregar.
// Y pide mostrar UNA sola ruta cuando es claramente la mejor, y hasta tres
// cuando comparar aporta algo.
//
// Cómo se resuelve acá, y por qué así:
//
//  · ordenarParadas() no se toca. Es el optimizador de distancia, tiene pruebas
//    que comprueban que da el óptimo exacto hasta 14 paradas, y meterle pesos de
//    disponibilidad adentro convertiría esas pruebas en algo que ya no se puede
//    afirmar. En vez de eso se lo usa como pieza: se arman tres ÓRDENES distintos
//    llamándolo sobre subconjuntos distintos.
//
//  · Los tres órdenes salen GRATIS. Se calculan con la matriz que ya se pidió,
//    sin una sola consulta más. Lo que cuesta plata y segundos es el TRAZADO por
//    calles, y eso se pide solo para las propuestas que de verdad se van a
//    mostrar (ver docs/ARQUITECTURA.md, propuestas de ruta: no generar tres rutas artificiales
//    multiplicando consultas).
//
//  · Si dos estrategias dan el mismo orden de paradas, es la misma ruta y se
//    muestra una sola vez. Es lo más común en un día donde nadie eligió
//    horario, y es justamente el caso en que el conductor no tiene que comparar nada.

export const TITULOS: Record<EstrategiaRuta, { titulo: string; motivo: string }> = {
  corta: {
    titulo: "La más corta",
    motivo: "Menos kilómetros y menos tiempo al volante.",
  },
  horarios: {
    titulo: "Respeta horarios",
    motivo: "Ordenada para llegar dentro del bloque que eligió cada cliente.",
  },
  confirmados: {
    titulo: "Confirmados primero",
    motivo: "Entrega antes a quienes ya dijeron que están, por si el día se corta.",
  },
};

export function coord(p: PedidoUbicado): Coordenada {
  return { lat: p.lat, lng: p.lng };
}

/** Las distancias de la matriz de calles, para el planificador. Un par que la
 *  matriz no tiene (sin matriz, o sin camino) se estima como en planificar.ts. */
export function metrosPorMatriz(
  base: Coordenada,
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
): MetrosEntre {
  const estimado = metrosEstimados(base);
  return (a, b) => {
    const desde = a ? indiceEnMatriz.get(a.id) : 0;
    const hasta = indiceEnMatriz.get(b.id);
    const m = matriz && desde != null && hasta != null ? matriz[desde]?.[hasta] : undefined;
    return m != null && Number.isFinite(m) ? m : estimado(a, b);
  };
}

/** Metros de volver a la base desde cada parada: la ruta del día termina
 *  donde empezó (terreno 2026-10-28). La columna 0 de la matriz es la base. */
export type VueltaABase = (p: PedidoUbicado) => number;

export function vueltaPorMatriz(
  base: Coordenada,
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
): VueltaABase {
  return (p) => {
    const i = indiceEnMatriz.get(p.id);
    const m = matriz && i != null ? matriz[i]?.[0] : undefined;
    return m != null && Number.isFinite(m) ? m : distanciaMetros(p, base) * FACTOR_CALLES;
  };
}

/** Metros del orden completo, volviendo a la base al final. */
export function metrosConVuelta(orden: PedidoUbicado[], metros: MetrosEntre, vuelta: VueltaABase): number {
  return metrosDelOrden(orden, metros) + (orden.length > 0 ? vuelta(orden[orden.length - 1]) : 0);
}

/** Ordena un SUBCONJUNTO de paradas partiendo de un punto dado, reusando el
 *  optimizador de distancia y la matriz que ya se pidió.
 *
 *  Se recorta una submatriz en vez de volver a consultar: la matriz completa ya
 *  tiene todos los pares, y armar la submatriz es copiar números.
 *
 *  Con `volverA` el grupo es el último del día: se ordena sabiendo que después
 *  se vuelve a la base, así que no termina en la otra punta. */
function ordenarGrupo(
  desde: Coordenada,
  grupo: PedidoUbicado[],
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
  indiceDesde: number,
  volverA?: Coordenada,
): PedidoUbicado[] {
  if (grupo.length <= 1) return grupo;

  const puntos = [desde, ...grupo.map(coord)];
  const indices = [indiceDesde, ...grupo.map((p) => indiceEnMatriz.get(p.id) ?? -1)];

  // Sin matriz (más de 25 puntos, o la API no respondió) ordenarParadas cae a la
  // línea recta sola, igual que siempre.
  const sub =
    matriz && indices.every((i) => i >= 0)
      ? indices.map((fila) => indices.map((col) => matriz[fila]?.[col] ?? Infinity))
      : null;

  // Volver desde el punto i del grupo: la columna 0 de la matriz (la base) o,
  // sin matriz, la línea recta, igual que el resto del ordenamiento.
  const vuelta = volverA
    ? (i: number) => {
        const m = sub ? matriz?.[indices[i]]?.[0] : undefined;
        return m != null && Number.isFinite(m) ? m : distanciaMetros(puntos[i], volverA);
      }
    : undefined;
  const orden = ordenarParadas(puntos, sub, vuelta);
  // El índice 0 es el punto de partida; el resto mapea a grupo[i - 1].
  return orden.slice(1).map((i) => grupo[i - 1]);
}

/** Concatena grupos ordenando cada uno desde donde terminó el anterior. Es lo
 *  que hace que "respeta horarios" no sea una lista pegada a la fuerza: dentro de
 *  cada bloque, el orden sigue siendo el que menos se maneja. */
function encadenar(
  base: Coordenada,
  grupos: PedidoUbicado[][],
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
): PedidoUbicado[] {
  const salida: PedidoUbicado[] = [];
  let desde = base;
  let indiceDesde = 0;
  const ultimo = grupos.findLastIndex((g) => g.length > 0);

  for (const [k, grupo] of grupos.entries()) {
    if (grupo.length === 0) continue;
    const ordenado = ordenarGrupo(desde, grupo, indiceEnMatriz, matriz, indiceDesde, k === ultimo ? base : undefined);
    salida.push(...ordenado);
    const ultima = ordenado[ordenado.length - 1];
    desde = coord(ultima);
    indiceDesde = indiceEnMatriz.get(ultima.id) ?? 0;
  }

  return salida;
}

export function ordenPorEstrategia(
  estrategia: EstrategiaRuta,
  base: Coordenada,
  ubicados: PedidoUbicado[],
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
  minutosDeInicio: number,
): PedidoUbicado[] {
  if (estrategia === "corta") {
    return ordenarGrupo(base, ubicados, indiceEnMatriz, matriz, 0, base);
  }

  if (estrategia === "confirmados") {
    // Primero los que dijeron que están, después los que no contestaron. Si el
    // día se corta —se pincha una rueda, se acaba el día— lo que queda sin
    // entregar es lo que de todas formas era una apuesta.
    return encadenar(
      base,
      [
        ubicados.filter((p) => estaConfirmado(p.disponibilidad)),
        ubicados.filter((p) => !estaConfirmado(p.disponibilidad)),
      ],
      indiceEnMatriz,
      matriz,
    );
  }

  // "horarios": la más corta entre los que no eligieron bloque, y cada uno con
  // bloque metido donde se llega dentro de su ventana (ver planificar.ts). Es el
  // mismo cálculo que reubica un pedido cuando el receptor elige horario con la
  // ruta en curso. Antes los bloques iban primero en orden del día, y un
  // "18–20" quedaba a media mañana: se llegaba antes de que estuviera.
  const conBloque = ubicados.filter((p) => bloquePorId(p.bloqueHorarioId));
  const sinBloque = ubicados.filter((p) => !bloquePorId(p.bloqueHorarioId));
  const metros = metrosPorMatriz(base, indiceEnMatriz, matriz);
  const vuelta = vueltaPorMatriz(base, indiceEnMatriz, matriz);
  const insertado = ubicarConHorario(
    ordenarGrupo(base, sinBloque, indiceEnMatriz, matriz, 0, base),
    conBloque,
    minutosDeInicio,
    metros,
  );

  // Con los horarios ya puestos, cada tramo sin horario se vuelve a ordenar por
  // distancia desde donde quedó la parada anterior: es una ruta nueva, no hay
  // un orden elegido que respetar. Se queda solo si no deja a nadie fuera de su
  // horario.
  //
  // Es el ARRANQUE de "respeta horarios": el optimizador con horarios
  // (horarios.ts) parte de este orden y de la más corta, y se queda con lo mejor.
  const tramos = reordenarTramos(base, insertado, indiceEnMatriz, matriz);
  const fuera = (orden: PedidoUbicado[]) => fueraDeHorario(orden, minutosDeInicio, metros).length;
  // A igual cumplimiento manda la distancia: antes el reordenado ganaba aunque
  // saliera más largo (spec 017, R3).
  const diferencia = fuera(tramos) - fuera(insertado);
  return diferencia < 0 ||
    (diferencia === 0 && metrosConVuelta(tramos, metros, vuelta) <= metrosConVuelta(insertado, metros, vuelta))
    ? tramos
    : insertado;
}

/** Reordena por distancia cada tramo de paradas SIN horario, partiendo de la
 *  parada anterior. Las que tienen horario no se mueven. */
function reordenarTramos(
  base: Coordenada,
  orden: PedidoUbicado[],
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
): PedidoUbicado[] {
  const salida: PedidoUbicado[] = [];
  let tramo: PedidoUbicado[] = [];
  const cerrarTramo = (ultimo = false) => {
    const anterior = salida[salida.length - 1];
    const desde = anterior ? coord(anterior) : base;
    const indiceDesde = anterior ? (indiceEnMatriz.get(anterior.id) ?? 0) : 0;
    salida.push(...ordenarGrupo(desde, tramo, indiceEnMatriz, matriz, indiceDesde, ultimo ? base : undefined));
    tramo = [];
  };
  for (const p of orden) {
    if (bloquePorId(p.bloqueHorarioId)) {
      cerrarTramo();
      salida.push(p);
    } else {
      tramo.push(p);
    }
  }
  cerrarTramo(true);
  return salida;
}

/** Mide un orden: cuántos metros, y a qué bloques se llegaría fuera de horario. */
export function medir(
  orden: PedidoUbicado[],
  metros: MetrosEntre,
  vuelta: VueltaABase,
  minutosDeInicio: number,
): Omit<Alternativa, "estrategia" | "titulo" | "motivo" | "paradas"> {
  const fuera = fueraDeHorario(orden, minutosDeInicio, metros);
  const conBloque = orden.filter((p) => bloquePorId(p.bloqueHorarioId)).length;
  return {
    metrosEstimados: Math.round(metrosConVuelta(orden, metros, vuelta)),
    confirmados: orden.filter((p) => estaConfirmado(p.disponibilidad)).length,
    pendientesDeContacto: orden.filter((p) => p.disponibilidad === "pendiente_respuesta").length,
    bloquesCumplidos: conBloque - fuera.length,
    bloquesIncumplidos: fuera.length,
    fueraDeHorario: fuera.map((p) => nombreVisible(p)),
  };
}

/** La huella de un orden. Dos estrategias que dan la misma secuencia son la
 *  misma ruta, y mostrarla dos veces con distinto título es peor que mostrarla
 *  una: obliga a comparar dos cosas idénticas. */
function huellaOrden(orden: PedidoUbicado[]): string {
  return orden.map((p) => p.id).join(">");
}

/** Cuánto más corta tiene que ser una alternativa para que valga compararla.
 *  Por debajo de esto, la diferencia no cambia el día y solo agrega una
 *  decisión más que tomar antes de salir. */
const MEJORA_UTIL = 0.08;

/** Elige la recomendada y descarta las alternativas que no aportan.
 *
 *  El criterio de la recomendada NO es la distancia: primero manda cumplir los
 *  bloques horarios que los receptores eligieron —un cliente al que se llega
 *  fuera de su ventana es un viaje perdido, y eso cuesta más que dos kilómetros—
 *  y recién después la distancia. Es lo que el documento principal pide cuando
 *  dice "el mejor resultado operativo, no únicamente la menor distancia". */
export function elegirUtiles(candidatas: Alternativa[]): Alternativa[] {
  const vistas = new Set<string>();
  const distintas = candidatas.filter((c) => {
    const h = huellaOrden(c.paradas);
    if (vistas.has(h)) return false;
    vistas.add(h);
    return true;
  });

  const ordenadas = [...distintas].sort(
    (a, b) =>
      a.bloquesIncumplidos - b.bloquesIncumplidos || a.metrosEstimados - b.metrosEstimados,
  );

  const mejor = ordenadas[0];
  const utiles = ordenadas.slice(1).filter(
    (c) =>
      // Aporta si consigue algo que la recomendada no: llegar a más bloques...
      c.bloquesCumplidos > mejor.bloquesCumplidos ||
      // ...o ahorrar una cantidad de camino que se note.
      c.metrosEstimados < mejor.metrosEstimados * (1 - MEJORA_UTIL) ||
      // ...o entregarle antes a más gente que ya confirmó, sin manejar más.
      (c.confirmados > mejor.confirmados && c.metrosEstimados <= mejor.metrosEstimados),
  );

  // Máximo tres, contando la recomendada.
  return [mejor, ...utiles].slice(0, 3);
}
