"use client";

// Armado de la ruta del día, en el TELÉFONO. Antes esto era generarRuta() en
// src/lib/encomiendas/actions.ts: unas 190 líneas, de las cuales ~120 eran
// reconciliación contra la base (leer la ruta existente, conservar las paradas
// entregadas, borrar las demás, calcular desde qué número seguir la secuencia
// para no chocar con la clave única, y volver a insertar). Nada de eso existe
// acá: la ruta es un objeto que se reemplaza, y lo único que hay que preservar
// —lo ya cerrado en el día— lo garantiza guardarRuta() en un solo lugar.
//
// El armado son DOS pasos, y esa separación es a propósito:
//
//   calcularRutaLocal()   ordena las paradas y pide el trazado, SIN guardar
//                         nada. Lo que devuelve es una propuesta, que la
//                         pantalla muestra en el mapa para que el conductor la vea
//                         antes de comprometerse (ver vista-previa-ruta.tsx).
//   confirmarRutaLocal()  recién ahí la ruta queda guardada en el teléfono.
//
// Antes era un solo paso que guardaba de una: rehacer la ruta a media mañana
// reordenaba las paradas y el conductor se enteraba mirando el mapa después.
//
// Lo que no cambió es el cálculo en sí: ordenarParadas() y el pedido del trazado
// por calles son las mismas funciones que ya se usaban, y ya corrían en el

// Módulos (spec 002 T032):
//   tipos.ts            PuntoInicio, PropuestaRuta, Alternativa…
//   partida.ts          de dónde se parte (y la dirección de la empresa guardada)
//   ubicar-pedidos.ts   reintentar los pedidos sin punto
//   estrategias.ts      las tres maneras de ordenar y cuáles mostrar
//   horarios.ts         "respeta horarios" con el optimizador con horarios (spec 017)
//   bultos.ts           los bultos fuera antes, casi sin km de más (spec 024)
//   pesos.ts            el orden cobra km y tiempo en plata (spec 024)
//   invertir.ts         «Invertir orden de ruta» (spec 024)
//   cambiar-propuesta.ts elegir otra alternativa, quitar o devolver una parada, retrazar
//   propuesta-guardada.ts la propuesta a la vista sobrevive a cerrar la app
//   index.ts            calcular la propuesta

import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { rutaPorCalles } from "@/lib/geo/ruta-por-calles";
import { ultimaFallaOrs } from "@/lib/geo/ors/cliente";
import { matrizCalles, type MatrizCalles, type SinMatriz } from "@/lib/geo/matriz";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { bloquePorId } from "@/lib/encomiendas/config";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { estaConfirmado, resultadoCerrado } from "@/lib/encomiendas/estados";
import { minutoDelDia } from "../planificar";
import { leerPedidos, leerRuta, pedidosEnOrden, tramosConPedidos } from "../almacen";
import { resolverInicio } from "./partida";
import { corregirAccesos, reintentarUbicar, tieneCoordenadas } from "./ubicar-pedidos";
import { avisoDeHorario, avisoSinTrazado } from "./avisos";
import {
  coord,
  elegirUtiles,
  medir,
  metrosPorMatriz,
  MINUTO_SALIDA_MAS_TEMPRANA,
  ordenPorEstrategia,
  TITULOS,
  vueltaPorMatriz,
} from "./estrategias";
import { bultosDe, TOLERANCIA_DESCARGA } from "./bultos";
import { matrizDeCosto, pesosDeManejar } from "./pesos";
import { medirConRumbo, ordenarConRumboDelDia, prepararRedDelDia } from "./red-del-dia";
import { paradasLejanas } from "./lejanas";
import { ordenConHorarios } from "./horarios";
import { ordenarConSentido } from "./sentido";
import type { Alternativa, EstrategiaRuta, PedidoUbicado, PropuestaRuta, PuntoInicio } from "./tipos";

export type { Alternativa, EstrategiaRuta, PedidoUbicado, PropuestaRuta, PuntoInicio, ResultadoRuta } from "./tipos";
export { avisoSinTrazado } from "./avisos";

/** Huella de TODO lo que entra en el cálculo de una ruta. Si no cambió ni un
 *  pedido, ni su ubicación, ni su horario, ni quién confirmó, ni sus bultos
 *  (spec 024), ni de dónde y a qué hora se parte, la ruta que saldría es la misma y no hay nada que
 *  preguntarle a OpenRouteService. Antes no miraba los horarios: un cliente que eligió
 *  bloque seguía recibiendo la propuesta vieja (spec 017, R3). */
/** Partida y llegada a menos de esto son el mismo punto: la ruta es cerrada. */
const METROS_MISMO_PUNTO = 30;
/** Terminando en otro lado, la columna 0 pasa a ser lo que cuesta llegar a la
 *  central (la última fila/columna, que después se saca). */
function hastaLaLlegada<T>(m: T[][], cero: T): T[][] {
  return m.slice(0, -1).map((fila, i) => [i === 0 ? cero : fila[fila.length - 1], ...fila.slice(1, -1)]);
}

/** Pasado esto armando la ruta, no se piden más mejoras (ver ordenarConSentido). */
const MS_PARA_MEJORAS = 25_000;

function huella(fecha: string, base: Coordenada, llegada: Coordenada, ubicados: PedidoUbicado[], minutosDeInicio: number): string {
  const paradas = ubicados
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}:${p.bloqueHorarioId ?? ""}:${p.disponibilidad}:${p.bultos ?? ""}`)
    .sort()
    .join("|");
  // La partida se redondea a ~10 m: partiendo del GPS, un metro de diferencia
  // entre dos lecturas no cambia el orden de treinta paradas. La hora, al cuarto
  // de hora: cambia qué bloques se alcanzan.
  return `${fecha}|${base.lat.toFixed(4)},${base.lng.toFixed(4)}>${llegada.lat.toFixed(4)},${llegada.lng.toFixed(4)}|${Math.floor(minutosDeInicio / 15)}|${paradas}`;
}

/** Deja pintar la pantalla ("Armando la ruta…") entre dos cálculos largos. */
const cederTurno = () => new Promise<void>((listo) => setTimeout(listo, 0));

/** Última propuesta calculada, en memoria. Sobrevive a cerrar y reabrir la hoja
 *  y a descartar la propuesta —que es cuando se repetía— pero no a recargar la
 *  página, y eso está bien: recargar es justo cuando conviene volver a
 *  preguntar por si el tráfico cambió. */
let ultimaPropuesta: { huella: string; propuesta: PropuestaRuta; delCalculo: string[] } | null = null;

// Calcula (sin guardar) la ruta de "fecha" con todos los pedidos pendientes del
// día. Lanza Error con un
// mensaje mostrable cuando no hay nada que rutear.
export async function calcularRutaLocal(
  fecha: string,
  inicio: PuntoInicio,
  /** Donde termina, si no es donde parte: la central, partiendo de "Mi
   *  ubicación" u otra dirección (terreno 2026-10-29: repasar lo pendiente y
   *  volver a la central). Sin esto, la ruta vuelve a donde partió. */
  fin?: PuntoInicio,
): Promise<PropuestaRuta> {
  // Solo los del día y sin marcar: lo ya cerrado (entregado o no entregado) no
  // se vuelve a rutear.
  const [delDia, rutaActual] = await Promise.all([leerPedidos(fecha), leerRuta(fecha)]);
  const pendientesIniciales = delDia.filter((p) => p.resultado === "pendiente");
  const cerradas = pedidosEnOrden(rutaActual, delDia).filter((p) => resultadoCerrado(p.resultado));
  if (pendientesIniciales.length === 0) {
    throw new Error("No hay pedidos pendientes para armar una ruta.");
  }

  const reintento = await reintentarUbicar(pendientesIniciales);
  const { pendientes } = reintento;

  // "Mañana" ya cerró el pedido como no entregado (ver registrarDisponibilidad):
  // no llega acá. Lo que queda son los que se pueden visitar hoy.
  // Una parada pegada a una carretera que no es su calle se corre a la calle
  // por donde se llega (acceso.ts): si no, la ruta da la vuelta por la carretera.
  const empezo = Date.now();
  const conPunto = pendientes.filter(tieneCoordenadas);
  // Si la revisión de calles falla, se sigue con los puntos como estaban.
  const accesos = await corregirAccesos(conPunto).catch(() => ({ ubicados: conPunto, advertencias: [] as string[] }));
  const ubicados = accesos.ubicados;
  const sinUbicar = pendientes.filter((p) => !tieneCoordenadas(p));

  // A diferencia de la versión del servidor, un pedido con la dirección mal
  // escrita ya NO bloquea el día completo: se arma la ruta con los que sí
  // se pudieron ubicar y los otros quedan a la vista para corregir.
  if (ubicados.length === 0) {
    throw new Error(
      sinUbicar.length === 1
        ? "El único pedido pendiente no se pudo ubicar en el mapa. Revisa su dirección."
        : `Ninguno de los ${sinUbicar.length} pedidos pendientes se pudo ubicar en el mapa. Revisa sus direcciones.`,
    );
  }

  const base = await resolverInicio(inicio, { lat: ubicados[0].lat, lng: ubicados[0].lng });
  // Si no se puede ubicar la central, la ruta vuelve a donde partió, como antes.
  const llegada = fin ? await resolverInicio(fin, base).catch(() => base) : base;
  const terminaEnOtroLado = distanciaMetros(base, llegada) > METROS_MISMO_PUNTO;

  // Las advertencias de la propuesta: lo que el reintento de ubicar dejó dicho,
  // más un resumen de los que quedaron fuera. Se arma acá y no en la pantalla
  // para que la lista viaje con la ruta guardada.
  const advertencias = [...reintento.advertencias, ...accesos.advertencias];
  if (sinUbicar.length > 0) {
    advertencias.push(
      sinUbicar.length === 1
        ? `"${nombreVisible(sinUbicar[0])}" no entra en la ruta: su dirección no está ubicada en el mapa.`
        : `${sinUbicar.length} pedidos no entran en la ruta porque su dirección no está ubicada en el mapa.`,
    );
  }
  // Misma partida y mismos pedidos que la vez anterior: la ruta ya está
  // calculada. Se devuelve esa, con el recuento de cerradas al día (que sí pudo
  // cambiar si el conductor marcó algo mientras la propuesta estaba en pantalla) y
  // con las advertencias recién calculadas: una dirección que el conductor corrigió
  // entre las dos pasadas no puede seguir avisando.
  // La hora a la que arranca, en minutos desde medianoche. Sirve para estimar si
  // los bloques horarios se alcanzan; se toma del reloj y no de la ruta guardada
  // porque la pregunta es "si salgo AHORA, ¿llego?".
  const minutosDeInicio = Math.max(minutoDelDia(), MINUTO_SALIDA_MAS_TEMPRANA);

  const clave = huella(fecha, base, llegada, ubicados, minutosDeInicio);
  if (ultimaPropuesta?.huella === clave) {
    return {
      ...ultimaPropuesta.propuesta,
      sinUbicar,
      cerradas: cerradas.length,
      // Las de ubicar, recién calculadas, más las del cálculo de la ruta (sin
      // matriz, parada lejana, horario, sin trazado): antes estas se perdían al
      // salir del caché (spec 022).
      advertencias: [...advertencias, ...ultimaPropuesta.delCalculo],
    };
  }
  const desdeElCalculo = advertencias.length;

  const puntos: Coordenada[] = [
    base,
    ...ubicados.map((p) => ({ lat: p.lat, lng: p.lng })),
    ...(terminaEnOtroLado ? [llegada] : []),
  ];

  // Las distancias por calle para decidir el orden. Primero la red propia (spec
  // 031): en el teléfono, sin señal ni cupo, y sabiendo hacia dónde queda apuntando
  // el auto en cada parada. Si no se puede (la red no bajó todavía, un punto lejos
  // de toda calle), la matriz de ORS, por bloques y guardada en memoria el día
  // entero (spec 017, R1). Sin ninguna se ordena en línea recta y la propuesta lo dice.
  const propia = await prepararRedDelDia(puntos, terminaEnOtroLado).catch(() => null);
  const calle: MatrizCalles | SinMatriz = propia
    ? { metros: propia.metros, segundos: propia.segundos, completa: true, pedidos: 0 }
    : await matrizCalles(puntos);
  // Terminando en otro lado, todo lo que cuenta "volver a la base" cuenta volver
  // a la central, sin tocar el optimizador (hastaLaLlegada).
  const matriz = calle.metros && terminaEnOtroLado ? hastaLaLlegada(calle.metros, 0) : calle.metros;
  const segundos = calle.metros ? (terminaEnOtroLado ? hastaLaLlegada(calle.segundos, 0) : calle.segundos) : null;
  // El orden cobra km y tiempo, en plata (spec 024, pesos.ts); los km, los
  // tiempos y los avisos que se muestran siguen con los metros.
  const costo = matriz ? matrizDeCosto(matriz, segundos) : null;
  if (calle.metros === null && calle.motivo === "cupo") {
    advertencias.push("Hoy ya se usaron las distancias por calle gratuitas: el orden se calculó en línea recta.");
  } else if (calle.metros === null && calle.motivo === "sin_token") {
    advertencias.push("Sin distancias por calle configuradas: el orden se calculó en línea recta.");
  } else if (calle.metros === null && calle.motivo === "sin_respuesta") {
    advertencias.push("Sin señal para las distancias por calle: el orden se calculó en línea recta.");
  } else if (calle.metros !== null && !calle.completa) {
    advertencias.push("Algunas distancias por calle no llegaron: parte del orden se calculó en línea recta.");
  }
  await cederTurno();

  // El índice de cada pedido en la matriz: la fila 0 es la base, así que el
  // pedido i está en la fila i + 1.
  const indiceEnMatriz = new Map(ubicados.map((p, i) => [p.id, i + 1] as const));

  const metros = metrosPorMatriz(base, indiceEnMatriz, matriz);
  // La ruta termina donde empezó (terreno 2026-10-28): cada orden se arma y se
  // mide contando la vuelta a la base.
  const vuelta = vueltaPorMatriz(llegada, indiceEnMatriz, matriz);
  // Con esto se elige la recomendada entre las estrategias (elegirUtiles).
  const costoEntre = { entre: metrosPorMatriz(base, indiceEnMatriz, costo), vuelta: vueltaPorMatriz(llegada, indiceEnMatriz, costo) };
  // El ORDEN se decide con el costo solo (spec 030; dueño, 2026-11-12). Antes
  // cobraba además 3 km por cada cambio de barrio de 900 m («cada zona una sola
  // vez», zonas.ts): en la ruta real del 10-11 (87 paradas) eso prohibía dejar dos
  // paradas de pasada y volver después, y metía un salto de 2,2 km. Sin la regla:
  // 36,7 km en vez de 37,1 y 2 min menos, y menos que la ruta que el conductor
  // armó a mano en otra app (37,3 km). Los sectores municipales tampoco entran al
  // orden (+7 % de km ese día).
  const matrizOrden = costo;
  // Y sobre el orden que menos cuesta, los bultos fuera del auto lo antes posible,
  // casi sin manejar de más (spec 024): la tolerancia en metros de verdad y en el
  // costo.
  const descarga = { matriz, base: costo, tolerancia: TOLERANCIA_DESCARGA };

  // Los tres órdenes. Ninguno consulta nada: todos reusan la matriz de arriba.
  const orden = (estrategia: EstrategiaRuta) =>
    ordenPorEstrategia(estrategia, base, ubicados, indiceEnMatriz, matrizOrden, minutosDeInicio, llegada, descarga);
  // «La más económica». Con la red propia, el orden y el sentido de paso de cada
  // parada se buscan juntos (spec 031): parte del orden sin rumbo (rápido, de la
  // matriz de arriba) y nunca cuesta más que él. Sin la red, el de siempre.
  let corta: PedidoUbicado[];
  if (propia && costo) {
    const sinRumbo = ordenarParadas(puntos.slice(0, ubicados.length + 1), costo, (i) => costo[i][0], false).slice(1);
    const conRumbo = await ordenarConRumboDelDia(propia, sinRumbo, [0, ...ubicados.map(bultosDe)]);
    corta = conRumbo.map((i) => ubicados[i - 1]);
  } else {
    corta = orden("corta");
  }
  // Sin confirmados ni horarios, las otras dos son la misma ruta: no se calculan.
  const hayConfirmados = ubicados.some((p) => estaConfirmado(p.disponibilidad));
  const hayBloques = ubicados.some((p) => bloquePorId(p.bloqueHorarioId));
  const ordenes: Record<EstrategiaRuta, PedidoUbicado[]> = {
    corta,
    confirmados: hayConfirmados ? orden("confirmados") : corta,
    // El optimizador con horarios corre fuera del hilo de la pantalla (R5).
    horarios: hayBloques
      ? await ordenConHorarios(ubicados, [corta, orden("horarios")], indiceEnMatriz, metros, minutosDeInicio, vuelta)
      : corta,
  };
  // Con la red propia, las alternativas se comparan por lo que miden con rumbo: la
  // matriz de punto a punto las haría parecer más cortas de lo que son.
  const conRumbo = (paradas: PedidoUbicado[]) => {
    if (!propia) return {};
    const m = medirConRumbo(propia, paradas.map((p) => indiceEnMatriz.get(p.id) ?? 0));
    return { metrosEstimados: Math.round(m.metros), costoEstimado: Math.round(m.pesos) };
  };
  const candidatas: Alternativa[] = (["corta", "horarios", "confirmados"] as const).map((estrategia) => ({
    estrategia,
    ...TITULOS[estrategia],
    paradas: ordenes[estrategia],
    ...medir(ordenes[estrategia], metros, vuelta, minutosDeInicio, costoEntre),
    ...conRumbo(ordenes[estrategia]),
  }));

  const alternativas = elegirUtiles(candidatas);
  let recomendada = alternativas[0];
  let paradas = recomendada.paradas;

  // El trazado se pide SOLO para la recomendada, y no para las tres. Es la
  // consulta caraaa de este armado (ver la Decisión 5): mostrar tres opciones no
  // puede costar tres veces más. Cuando el conductor elige otra, se le pide el
  // trazado de esa en ese momento (ver elegirAlternativa).
  //
  // Lo dibuja la red propia (spec 031) y, si no se puede, ORS (que parte en tramos
  // un día de más de 70 puntos).
  // Con la vuelta: la línea del mapa, los km y el reloj cuentan el regreso.
  let calles = await rutaPorCalles([base, ...paradas.map(coord), llegada], pesosDeManejar);

  // El orden otra vez, sabiendo en qué paradas no se puede dar la vuelta
  // (sentido.ts). Solo la más corta: las otras tienen un orden que respetar.
  // Es una mejora: si falla, o el armado ya tomó más de MS_PARA_MEJORAS (mala
  // señal), se queda la ruta que ya está. Con la red propia no hace falta: el
  // orden ya se buscó sabiendo dónde no se da la vuelta.
  if (!propia && calles && recomendada.estrategia === "corta" && Date.now() - empezo < MS_PARA_MEJORAS) {
    const conSentido = await ordenarConSentido(base, paradas, indiceEnMatriz, matrizOrden, calles, llegada, descarga).catch(() => null);
    if (conSentido) {
      paradas = conSentido.paradas;
      calles = conSentido.calles;
      recomendada = { ...recomendada, paradas, ...medir(paradas, metros, vuelta, minutosDeInicio, costoEntre) };
      alternativas[0] = recomendada;
    }
  }

  // Una parada lejos de todas: se avisa con lo que cuesta (terreno 2026-10-28).
  const lejanas = paradasLejanas(paradas, base, metros, vuelta);
  for (const l of lejanas) {
    advertencias.push(
      `${l.direccion} queda a ${(l.metrosAlResto / 1000).toFixed(1)} km del resto y suma ${(l.metrosQueSuma / 1000).toFixed(1)} km a la ruta: revisa la dirección.`,
    );
  }

  const fueraDeHorario = avisoDeHorario(recomendada);
  if (fueraDeHorario) advertencias.push(fueraDeHorario);

  const propuesta: PropuestaRuta = {
    fecha,
    partida: base,
    llegada,
    paradas,
    trazado: calles?.trazado ?? null,
    tramos: tramosConPedidos(calles?.tramos, [null, ...paradas.map((p) => p.id), null]),
    distanciaM: calles?.distanciaM ?? null,
    duracionS: calles?.duracionS ?? null,
    sinUbicar,
    sinTrazado: calles == null,
    motivoSinTrazado: calles == null ? (ultimaFallaOrs() ?? "sin_senal") : null,
    cerradas: cerradas.length,
    alternativas,
    elegida: recomendada.estrategia,
    lejanas,
    advertencias:
      calles == null ? [...advertencias, avisoSinTrazado(ultimaFallaOrs())] : advertencias,
  };

  // Sin trazado no se guarda: quedó a medias por falta de señal y volver a
  // pedirla es justamente lo que hay que hacer la próxima vez.
  if (!propuesta.sinTrazado) {
    ultimaPropuesta = { huella: clave, propuesta, delCalculo: propuesta.advertencias.slice(desdeElCalculo) };
  }
  return propuesta;
}

export { devolverParada, elegirAlternativa, quitarParada, retrazar } from "./cambiar-propuesta";
export { confirmarRutaLocal, problemasDelArmado } from "./confirmar";
export { invertirOrden } from "./invertir";
export { guardarPropuestaVista, olvidarPropuesta, propuestaGuardada } from "./propuesta-guardada";
