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
//   index.ts            calcular, elegir y confirmar la propuesta

import type { Coordenada } from "@/lib/geo/coordenada";
import { obtenerRutaCalles } from "@/lib/geo/mapbox/direcciones";
import { matrizCalles } from "@/lib/geo/mapbox/matriz";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { resultadoCerrado } from "@/lib/encomiendas/estados";
import { minutoDelDia } from "../planificar";
import { guardarRuta, leerPedidos, leerRuta, pedidosEnOrden } from "../almacen";
import { resolverInicio } from "./partida";
import { reintentarUbicar, tieneCoordenadas } from "./ubicar-pedidos";
import { coord, elegirUtiles, medir, metrosPorMatriz, ordenPorEstrategia, TITULOS } from "./estrategias";
import { ordenConHorarios } from "./horarios";
import type { Alternativa, EstrategiaRuta, PedidoUbicado, PropuestaRuta, PuntoInicio, ResultadoRuta } from "./tipos";

export type { Alternativa, EstrategiaRuta, PedidoUbicado, PropuestaRuta, PuntoInicio, ResultadoRuta } from "./tipos";

/** Huella de TODO lo que entra en el cálculo de una ruta. Si no cambió ni un
 *  pedido, ni su ubicación, ni su horario, ni quién confirmó, ni de dónde y a
 *  qué hora se parte, la ruta que saldría es la misma y no hay nada que
 *  preguntarle a Mapbox. Antes no miraba los horarios: un cliente que eligió
 *  bloque seguía recibiendo la propuesta vieja (spec 017, R3). */
function huella(fecha: string, base: Coordenada, ubicados: PedidoUbicado[], minutosDeInicio: number): string {
  const paradas = ubicados
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}:${p.bloqueHorarioId ?? ""}:${p.disponibilidad}`)
    .sort()
    .join("|");
  // La partida se redondea a ~10 m: partiendo del GPS, un metro de diferencia
  // entre dos lecturas no cambia el orden de treinta paradas. La hora, al cuarto
  // de hora: cambia qué bloques se alcanzan.
  return `${fecha}|${base.lat.toFixed(4)},${base.lng.toFixed(4)}|${Math.floor(minutosDeInicio / 15)}|${paradas}`;
}

/** Antes de esta hora no se reparte: armar la ruta a las 7:00 no puede suponer
 *  que la primera parada se atiende a las 7:10 (spec 017, R3). */
const MINUTO_SALIDA_MAS_TEMPRANA = 8 * 60;

/** Deja pintar la pantalla ("Armando la ruta…") entre dos cálculos largos. */
const cederTurno = () => new Promise<void>((listo) => setTimeout(listo, 0));

/** Última propuesta calculada, en memoria. Sobrevive a cerrar y reabrir la hoja
 *  y a descartar la propuesta —que es cuando se repetía— pero no a recargar la
 *  página, y eso está bien: recargar es justo cuando conviene volver a
 *  preguntar por si el tráfico cambió. */
let ultimaPropuesta: { huella: string; propuesta: PropuestaRuta } | null = null;

// Calcula (sin guardar) la ruta de "fecha" con todos los pedidos pendientes del
// día. Lanza Error con un
// mensaje mostrable cuando no hay nada que rutear.
export async function calcularRutaLocal(
  fecha: string,
  inicio: PuntoInicio,
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
  const ubicados = pendientes.filter(tieneCoordenadas);
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

  // Las advertencias de la propuesta: lo que el reintento de ubicar dejó dicho,
  // más un resumen de los que quedaron fuera. Se arma acá y no en la pantalla
  // para que la lista viaje con la ruta guardada.
  const advertencias = [...reintento.advertencias];
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

  const clave = huella(fecha, base, ubicados, minutosDeInicio);
  if (ultimaPropuesta?.huella === clave) {
    return {
      ...ultimaPropuesta.propuesta,
      sinUbicar,
      cerradas: cerradas.length,
      advertencias,
    };
  }

  const puntos: Coordenada[] = [base, ...ubicados.map((p) => ({ lat: p.lat, lng: p.lng }))];

  // Distancias reales por calles para decidir el orden, por bloques y guardadas
  // en memoria el día entero (spec 017, R1). Sin ellas se ordena en línea recta
  // y la propuesta lo dice.
  const calle = await matrizCalles(puntos);
  const matriz = calle.metros;
  if (calle.metros === null && calle.motivo === "cupo") {
    advertencias.push(
      "Este mes ya se usaron las distancias por calle gratuitas: el orden se calculó en línea recta.",
    );
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

  // Los tres órdenes. Ninguno consulta nada: todos reusan la matriz de arriba.
  const orden = (estrategia: EstrategiaRuta) =>
    ordenPorEstrategia(estrategia, base, ubicados, indiceEnMatriz, matriz, minutosDeInicio);
  const corta = orden("corta");
  const ordenes: Record<EstrategiaRuta, PedidoUbicado[]> = {
    corta,
    confirmados: orden("confirmados"),
    // El optimizador con horarios corre fuera del hilo de la pantalla (R5).
    horarios: await ordenConHorarios(ubicados, [corta, orden("horarios")], indiceEnMatriz, metros, minutosDeInicio),
  };
  const candidatas: Alternativa[] = (["corta", "horarios", "confirmados"] as const).map((estrategia) => ({
    estrategia,
    ...TITULOS[estrategia],
    paradas: ordenes[estrategia],
    ...medir(ordenes[estrategia], metros, minutosDeInicio),
  }));

  const alternativas = elegirUtiles(candidatas);
  const recomendada = alternativas[0];
  const paradas = recomendada.paradas;

  // El trazado se pide SOLO para la recomendada, y no para las tres. Es la
  // consulta caraaa de este armado (ver la Decisión 5): mostrar tres opciones no
  // puede costar tres veces más. Cuando el conductor elige otra, se le pide el
  // trazado de esa en ese momento (ver elegirAlternativa).
  //
  // El límite de 25 puntos por consulta de Mapbox (un día de 30 paradas no
  // entra) lo resuelve obtenerRutaCalles partiendo el pedido en tramos y
  // pegando los trazados.
  const calles = await obtenerRutaCalles([base, ...paradas.map(coord)]);

  if (recomendada.bloquesIncumplidos > 0) {
    advertencias.push(
      recomendada.fueraDeHorario.length === 1
        ? `Con este orden se llegaría fuera del horario que eligió ${recomendada.fueraDeHorario[0]}. Conviene llamarlo.`
        : `Con este orden se llegaría fuera de horario a ${recomendada.fueraDeHorario.length} clientes: ${recomendada.fueraDeHorario.join(", ")}.`,
    );
  }

  const propuesta: PropuestaRuta = {
    fecha,
    partida: base,
    paradas,
    trazado: calles?.trazado ?? null,
    distanciaM: calles?.distanciaM ?? null,
    duracionS: calles?.duracionS ?? null,
    sinUbicar,
    sinTrazado: calles == null,
    cerradas: cerradas.length,
    alternativas,
    elegida: recomendada.estrategia,
    advertencias:
      calles == null
        ? [
            ...advertencias,
            "Sin trazado por calles (no hubo señal o el servicio no respondió). El orden y los puntos sirven igual.",
          ]
        : advertencias,
  };

  // Sin trazado no se guarda: quedó a medias por falta de señal y volver a
  // pedirla es justamente lo que hay que hacer la próxima vez.
  if (!propuesta.sinTrazado) ultimaPropuesta = { huella: clave, propuesta };
  return propuesta;
}

/** Cambia la alternativa puesta y le pide SU trazado.
 *
 *  El trazado se pide acá y no al calcular las tres porque es la consulta que
 *  cuesta: mostrar una comparación de tres órdenes no puede valer tres veces más
 *  que mostrar uno (Decisión 5). El conductor paga la consulta de la que de verdad
 *  quiere mirar.
 *
 *  Si la estrategia pedida no está entre las útiles, devuelve la propuesta tal
 *  cual: no es un error, es que esa alternativa no aportaba nada. */
export async function elegirAlternativa(
  propuesta: PropuestaRuta,
  estrategia: EstrategiaRuta,
): Promise<PropuestaRuta> {
  if (estrategia === propuesta.elegida) return propuesta;

  const alternativa = propuesta.alternativas.find((a) => a.estrategia === estrategia);
  if (!alternativa) return propuesta;

  const calles = await obtenerRutaCalles([
    propuesta.partida,
    ...alternativa.paradas.map(coord),
  ]);

  return {
    ...propuesta,
    paradas: alternativa.paradas,
    elegida: estrategia,
    trazado: calles?.trazado ?? null,
    distanciaM: calles?.distanciaM ?? null,
    duracionS: calles?.duracionS ?? null,
    sinTrazado: calles == null,
  };
}

/** Guarda la propuesta como la ruta del día. Entre calcular y confirmar el
 *  conductor pudo cerrar una parada o agregar un pedido: guardarRuta vuelve a leer
 *  lo guardado y conserva lo cerrado, así que la propuesta nunca lo pisa. */
export async function confirmarRutaLocal(propuesta: PropuestaRuta): Promise<ResultadoRuta> {
  const ruta = await guardarRuta({
    fecha: propuesta.fecha,
    pedidoIdsEnOrden: propuesta.paradas.map((p) => p.id),
    trazado: propuesta.trazado,
    distanciaM: propuesta.distanciaM,
    duracionS: propuesta.duracionS,
    advertencias: propuesta.advertencias,
    propuestasComparadas: propuesta.alternativas.length,
  });

  return { ruta, sinUbicar: propuesta.sinUbicar, sinTrazado: propuesta.sinTrazado };
}

