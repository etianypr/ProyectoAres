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
import { obtenerRutaCalles } from "@/lib/geo/ors/direcciones";
import { ultimaFallaOrs } from "@/lib/geo/ors/cliente";
import { matrizCalles } from "@/lib/geo/matriz";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { resultadoCerrado } from "@/lib/encomiendas/estados";
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
import { TOLERANCIA_DESCARGA } from "./bultos";
import { matrizDeCosto } from "./pesos";
import { paradasLejanas } from "./lejanas";
import { ordenConHorarios } from "./horarios";
import { ordenarConSentido } from "./sentido";
import { matrizPorZonas, zonasPorCercania } from "./zonas";
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
/** La matriz para ordenar por zonas (zonas.ts): el costo de cada tramo más el
 *  de cambiar de zona. Las zonas salen de los metros, que son el barrio; si algo
 *  fallara, el costo solo. */
function conZonas(costo: number[][], metros: number[][]): number[][] {
  try {
    return matrizPorZonas(costo, zonasPorCercania(metros));
  } catch {
    return costo;
  }
}

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

  // Distancias reales por calles para decidir el orden, por bloques y guardadas
  // en memoria el día entero (spec 017, R1). Sin ellas se ordena en línea recta
  // y la propuesta lo dice.
  const calle = await matrizCalles(puntos);
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
  // Cada zona una sola vez (zonas.ts): el ORDEN se decide cobrando cada cambio
  // de zona; los km, los tiempos y los avisos siguen con la matriz real.
  const matrizOrden = matriz && costo ? conZonas(costo, matriz) : null;
  // Y sobre el orden que menos cuesta, los bultos fuera del auto lo antes posible,
  // casi sin manejar de más (spec 024): la tolerancia en metros de verdad y en el
  // costo sin los cambios de zona.
  const descarga = { matriz, base: costo, tolerancia: TOLERANCIA_DESCARGA };

  // Los tres órdenes. Ninguno consulta nada: todos reusan la matriz de arriba.
  const orden = (estrategia: EstrategiaRuta) =>
    ordenPorEstrategia(estrategia, base, ubicados, indiceEnMatriz, matrizOrden, minutosDeInicio, llegada, descarga);
  const corta = orden("corta");
  const ordenes: Record<EstrategiaRuta, PedidoUbicado[]> = {
    corta,
    confirmados: orden("confirmados"),
    // El optimizador con horarios corre fuera del hilo de la pantalla (R5).
    horarios: await ordenConHorarios(ubicados, [corta, orden("horarios")], indiceEnMatriz, metros, minutosDeInicio, vuelta),
  };
  const candidatas: Alternativa[] = (["corta", "horarios", "confirmados"] as const).map((estrategia) => ({
    estrategia,
    ...TITULOS[estrategia],
    paradas: ordenes[estrategia],
    ...medir(ordenes[estrategia], metros, vuelta, minutosDeInicio, costoEntre),
  }));

  const alternativas = elegirUtiles(candidatas);
  let recomendada = alternativas[0];
  let paradas = recomendada.paradas;

  // El trazado se pide SOLO para la recomendada, y no para las tres. Es la
  // consulta caraaa de este armado (ver la Decisión 5): mostrar tres opciones no
  // puede costar tres veces más. Cuando el conductor elige otra, se le pide el
  // trazado de esa en ese momento (ver elegirAlternativa).
  //
  // Un día que no entra en una consulta (ORS acepta 70 puntos) lo parte en tramos
  // y lo pega obtenerRutaCalles.
  // Con la vuelta: la línea del mapa, los km y el reloj cuentan el regreso.
  let calles = await obtenerRutaCalles([base, ...paradas.map(coord), llegada]);

  // El orden otra vez, sabiendo en qué paradas no se puede dar la vuelta
  // (sentido.ts). Solo la más corta: las otras tienen un orden que respetar.
  // Es una mejora: si falla, o el armado ya tomó más de MS_PARA_MEJORAS (mala
  // señal), se queda la ruta que ya está.
  if (calles && recomendada.estrategia === "corta" && Date.now() - empezo < MS_PARA_MEJORAS) {
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
