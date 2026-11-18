// Spec 038 (tiempos): los días de prueba que comparten la prueba dorada del
// optimizador (038-orden-dorado.test.mjs) y la medición (scripts/medir-rutas.mjs),
// para que lo que se mide sea exactamente lo que se compara.
//
// Los puntos son los del fixture de la spec 024 (al azar sobre calles de Arica, no
// son direcciones de nadie) y los pedidos solo llevan un id inventado. Sin red ni
// IndexedDB: la red de calles es la que la app lleva adentro.
import { readFileSync } from "node:fs";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { matrizDeCosto } from "@/lib/encomiendas/local/generar-ruta/pesos";
import { ordenarConRumboDelDia, prepararRedDelDia } from "@/lib/encomiendas/local/generar-ruta/red-del-dia";
import { metrosPorMatriz, ordenPorEstrategia, vueltaPorMatriz } from "@/lib/encomiendas/local/generar-ruta/estrategias";
import { bultosDe, TOLERANCIA_DESCARGA } from "@/lib/encomiendas/local/generar-ruta/bultos";
import { ordenConHorarios } from "@/lib/encomiendas/local/generar-ruta/horarios";
import { estaConfirmado } from "@/lib/encomiendas/estados";
import { bloquePorId } from "@/lib/encomiendas/config";

export const DIA = JSON.parse(readFileSync(new URL("./fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));

/** Las 8:00: a esa hora todos los bloques siguen abiertos (estrategias.ts). */
export const MINUTO_DE_SALIDA = 8 * 60;

/** Números al azar reproducibles (el mismo generador del optimizador). */
export function azar(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** De 1 a 4 bultos por punto; el 0 (la partida) no cuenta. */
export function bultosAlAzar(n, semilla) {
  const r = azar(semilla);
  return Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 1 + Math.floor(r() * 4)));
}

/** Las primeras k filas y columnas. */
export function recortar(m, k) {
  return m.slice(0, k).map((fila) => fila.slice(0, k));
}

/** Copia de hastaLaLlegada (generar-ruta/index.ts, privada ahí): terminando en otro
 *  lado, la columna 0 pasa a ser llegar a la central y se saca la última. */
export function hastaLaLlegada(m, cero) {
  return m.slice(0, -1).map((fila, i) => [i === 0 ? cero : fila[fila.length - 1], ...fila.slice(1, -1)]);
}

/** El día con la red propia, como calcularRutaLocal (generar-ruta/index.ts): la red,
 *  la matriz de metros, la de costo (pesos.ts) y el orden sin rumbo que arranca la
 *  búsqueda con rumbo. Con `terminaEnOtroLado`, el punto siguiente es la llegada. */
export async function diaConRed(cuantas, terminaEnOtroLado = false) {
  const puntos = DIA.puntos.slice(0, cuantas + 1 + (terminaEnOtroLado ? 1 : 0));
  const red = await prepararRedDelDia(puntos, terminaEnOtroLado);
  if (!red) throw new Error("no se pudo pegar algún punto a la red");
  const matriz = terminaEnOtroLado ? hastaLaLlegada(red.metros, 0) : red.metros;
  const segundos = terminaEnOtroLado ? hastaLaLlegada(red.segundos, 0) : red.segundos;
  const costo = matrizDeCosto(matriz, segundos);
  return { cuantas, puntos, red, matriz, costo, sinRumbo: sinRumbo(puntos, cuantas, costo) };
}

/** El orden sin rumbo, rápido: el arranque de la búsqueda con rumbo (index.ts). */
export function sinRumbo(puntos, cuantas, costo) {
  return ordenarParadas(puntos.slice(0, cuantas + 1), costo, (i) => costo[i][0], false).slice(1);
}

/** Los días de las estrategias (spec 038, plan Fase 0): lo que cambia de cada
 *  pedido según su número (1…n). */
export const ESCENARIOS = {
  "10 confirmados": (i) => (i % 8 === 0 ? { disponibilidad: "confirmado" } : {}),
  "5 con bloque": (i) => {
    const bloques = { 7: "10-12", 19: "12-14", 31: "14-16", 43: "16-18", 55: "12-14" };
    return bloques[i] ? { disponibilidad: "horario_indicado", bloqueHorarioId: bloques[i] } : {};
  },
  // «Pidió otra hora» (spec 033): un solo pedido con su bloque, que además cuenta
  // como confirmado (estados.ts).
  "Pidió otra hora": (i) => (i === 23 ? { disponibilidad: "horario_indicado", bloqueHorarioId: "14-16" } : {}),
};

/** Los pedidos de un escenario: solo lo que el armado lee. Con `bultos`, los de
 *  bultosAlAzar; sin ellos, sin escanear (cada uno vale uno). */
export function pedidosDelEscenario(nombre, cuantas, bultos = null) {
  return Array.from({ length: cuantas }, (_, k) => {
    const i = k + 1;
    return {
      id: `p${String(i).padStart(3, "0")}`,
      lat: DIA.puntos[i].lat,
      lng: DIA.puntos[i].lng,
      disponibilidad: "pendiente_respuesta",
      bloqueHorarioId: null,
      bultos: bultos ? bultos[i] : null,
      resultado: "pendiente",
      ...ESCENARIOS[nombre](i),
    };
  });
}

/**
 * Las estrategias como las arma calcularRutaLocal con la red propia
 * (generar-ruta/index.ts): la más económica con rumbo, «Confirmados primero» y
 * «Respeta horarios» (solo si hay confirmados o bloques, como allá). `etapa(nombre,
 * fn)` envuelve cada paso para medirlo; sin ella, solo lo corre. Devuelve los ids
 * en orden de cada una.
 */
export async function estrategiasDelEscenario(dia, ubicados, etapa = (_nombre, fn) => fn()) {
  const { puntos, red, matriz, costo } = dia;
  const base = puntos[0];
  // Un Map nuevo por propuesta: ordenarGrupo (estrategias.ts) recuerda lo ya
  // ordenado por este Map, como dentro de una propuesta y no entre dos.
  const indiceEnMatriz = new Map(ubicados.map((p, i) => [p.id, i + 1]));
  const metros = metrosPorMatriz(base, indiceEnMatriz, matriz);
  const vuelta = vueltaPorMatriz(base, indiceEnMatriz, matriz);
  const descarga = { matriz, base: costo, tolerancia: TOLERANCIA_DESCARGA };
  const orden = (estrategia) =>
    ordenPorEstrategia(estrategia, base, ubicados, indiceEnMatriz, costo, MINUTO_DE_SALIDA, base, descarga);

  const conRumbo = await etapa("corta con rumbo", () => ordenarConRumboDelDia(red, dia.sinRumbo, [0, ...ubicados.map(bultosDe)]));
  const corta = conRumbo.map((i) => ubicados[i - 1]);
  const hayConfirmados = ubicados.some((p) => estaConfirmado(p.disponibilidad));
  const hayBloques = ubicados.some((p) => bloquePorId(p.bloqueHorarioId));
  const salida = { corta: corta.map((p) => p.id) };
  if (hayConfirmados) salida.confirmados = (await etapa("confirmados", () => orden("confirmados"))).map((p) => p.id);
  if (hayBloques) {
    const arranque = await etapa("horarios (arranque)", () => orden("horarios"));
    salida.horariosArranque = arranque.map((p) => p.id);
    const horarios = await etapa("horarios (con horarios)", () =>
      ordenConHorarios(ubicados, [corta, arranque], indiceEnMatriz, metros, MINUTO_DE_SALIDA, vuelta),
    );
    salida.horarios = horarios.map((p) => p.id);
  }
  return salida;
}
