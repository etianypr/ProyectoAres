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
//                         pantalla muestra en el mapa para que el chofer la vea
//                         antes de comprometerse (ver vista-previa-ruta.tsx).
//   confirmarRutaLocal()  recién ahí la ruta queda guardada en el teléfono.
//
// Antes era un solo paso que guardaba de una: rehacer la ruta a media mañana
// reordenaba las paradas y el chofer se enteraba mirando el mapa después.
//
// Lo que no cambió es el cálculo en sí: ordenarParadas() y el pedido del trazado
// por calles son las mismas funciones que ya se usaban, y ya corrían en el
// navegador para la navegación paso a paso (ver use-navegacion.ts).

import { ubicarDireccion, geocodificarDireccion } from "@/lib/geocoding";
import type { Coordenada, Trazado } from "@/lib/geo/coordenada";
import { matrizDistancias, obtenerRutaCalles, ordenarParadas } from "@/lib/rutas";
import { bloquePorId } from "@/lib/encomiendas/config";
import { resultadoCerrado, estaConfirmado } from "@/lib/encomiendas/estados";
import {
  fueraDeHorario,
  metrosDelOrden,
  metrosEstimados,
  minutoDelDia,
  ubicarConHorario,
  type MetrosEntre,
} from "./planificar";
import {
  fijarCoordenadas,
  guardarRuta,
  leerPedidos,
  leerRuta,
  pedidosEnOrden,
  type Pedido,
  type Ruta,
} from "./almacen";

// Las direcciones se ubican al CARGAR cada pedido, una por una, así que acá
// solo se reintentan las que fallaron. Se limita cuántas para no dejar al
// chofer treinta segundos mirando una pantalla trabada; las que no entren en
// este intento se reintentan en la próxima generación.
const MAX_REINTENTOS_UBICAR = 5;

// ----------------------------------------------------------------------------
// Lo que no hace falta volver a preguntar
// ----------------------------------------------------------------------------
//
// Armar una ruta cuesta tres consultas: ubicar la dirección de partida, la
// matriz de distancias y el trazado. Y se arma sola cada vez que se abre la
// pantalla sin ruta guardada (autoGenerar), así que abrir la app, mirar la
// propuesta, cerrarla y volver a entrar valía seis consultas por ver dos veces
// exactamente lo mismo. En un día de prueba fueron 6.839 elementos de matriz
// —unas 56 generaciones— sin que nadie repartiera en serio.
//
// Las dos cachés de acá abajo no cambian nada de lo que el chofer ve; al
// contrario, la propuesta repetida aparece al instante en vez de después de un
// segundo y medio de espera.

/** La dirección de la empresa no se muda. Geocodificarla una vez por armado de
 *  ruta era una consulta regalada. Se guarda contra el TEXTO: si el
 *  administrador la corrige, la clave cambia y se vuelve a ubicar sola. */
const CLAVE_PARTIDA = "pucarani-partida-empresa";

function partidaGuardada(direccion: string): Coordenada | null {
  try {
    const crudo = localStorage.getItem(CLAVE_PARTIDA);
    if (!crudo) return null;
    const { texto, lat, lng } = JSON.parse(crudo);
    return texto === direccion && typeof lat === "number" && typeof lng === "number"
      ? { lat, lng }
      : null;
  } catch {
    // localStorage bloqueado (modo privado) o contenido de una versión vieja:
    // se geocodifica como siempre, que es lo que pasaba antes de esta caché.
    return null;
  }
}

function guardarPartida(direccion: string, coord: Coordenada): void {
  try {
    localStorage.setItem(
      CLAVE_PARTIDA,
      JSON.stringify({ texto: direccion, lat: coord.lat, lng: coord.lng }),
    );
  } catch {
    // Sin espacio o sin permiso: no guardar la caché no rompe nada.
  }
}

/** Huella de TODO lo que entra en el cálculo de una ruta. Si no cambió ni un
 *  pedido, ni su ubicación, ni de dónde se parte, la ruta que saldría es la
 *  misma y no hay nada que preguntarle a Mapbox. */
function huella(fecha: string, base: Coordenada, ubicados: PedidoUbicado[]): string {
  const paradas = ubicados
    .map((p) => `${p.id}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .sort()
    .join("|");
  // La partida se redondea a ~10 m: partiendo del GPS, un metro de diferencia
  // entre dos lecturas no cambia el orden de treinta paradas.
  return `${fecha}|${base.lat.toFixed(4)},${base.lng.toFixed(4)}|${paradas}`;
}

/** Última propuesta calculada, en memoria. Sobrevive a cerrar y reabrir la hoja
 *  y a descartar la propuesta —que es cuando se repetía— pero no a recargar la
 *  página, y eso está bien: recargar es justo cuando conviene volver a
 *  preguntar por si el tráfico cambió. */
let ultimaPropuesta: { huella: string; propuesta: PropuestaRuta } | null = null;

/** De dónde arranca la ruta. La dirección de la empresa la pasa la pantalla
 *  (es un dato de la empresa, no de un destinatario, así que sigue viviendo en
 *  la base sin problema). */
export type PuntoInicio =
  | { tipo: "empresa"; direccion: string | null }
  | { tipo: "gps"; lat: number; lng: number }
  /** lat/lng vienen cuando el chofer eligió la dirección de una lista de
   *  sugerencias: ya está ubicada y no hay que geocodificar el texto. */
  | { tipo: "direccion"; direccion: string; lat?: number; lng?: number };

/** Pedido que sí se pudo ubicar en el mapa: entra en la ruta. */
export type PedidoUbicado = Pedido & { lat: number; lng: number };

/** Ruta calculada y todavía NO guardada. Es lo que se muestra en la
 *  previsualización; guardarla es cosa de confirmarRutaLocal. */
export type PropuestaRuta = {
  fecha: string;
  /** Punto de partida ya resuelto a coordenadas. */
  partida: Coordenada;
  /** Las paradas que faltan, en el orden de visita propuesto. */
  paradas: PedidoUbicado[];
  /** Trazado por calles de todo el recorrido, [lng, lat] por punto. */
  trazado: Trazado | null;
  distanciaM: number | null;
  duracionS: number | null;
  /** Pendientes que quedaron FUERA porque su dirección no se pudo ubicar en el
   *  mapa. La pantalla los muestra para que el conductor corrija la dirección. */
  sinUbicar: Pedido[];
  /** true si el trazado por calles no se pudo pedir (sin señal, o el servicio
   *  no respondió). La ruta sirve igual: están los puntos y el orden. */
  sinTrazado: boolean;
  /** Cuántas paradas de hoy ya están cerradas (entregadas u omitidas). No se
   *  reordenan ni se pierden: quedan primero en la ruta guardada. */
  cerradas: number;
  /** Todo lo que el chofer tiene que saber antes de salir, en frases
   *  mostrables. Se guardan CON la ruta (ver Ruta.advertencias) y no solo
   *  se muestran en la previsualización: en terreno, tres horas después, siguen
   *  siendo la explicación de por qué un pedido no está en la lista. */
  advertencias: string[];
  /** Las propuestas que vale comparar, de una a tres, con la recomendada
   *  primero. `paradas` de arriba son siempre las de la elegida.
   *
   *  Con una sola alternativa la pantalla no muestra ninguna comparación: es el
   *  caso en que el documento principal pide no obligar al chofer a elegir. */
  alternativas: Alternativa[];
  /** Cuál de `alternativas` está puesta ahora mismo. */
  elegida: EstrategiaRuta;
};

export type ResultadoRuta = {
  ruta: Ruta;
  sinUbicar: Pedido[];
  sinTrazado: boolean;
};

function tieneCoordenadas(p: Pedido): p is PedidoUbicado {
  return p.lat != null && p.lng != null;
}

// Reintenta ubicar en el mapa los pedidos que quedaron sin coordenadas y guarda
// las que se consigan.
//
// LO QUE CAMBIÓ Y POR QUÉ: antes esto usaba geocodificarDireccion(), que se
// queda con la mejor coincidencia y no dice que había otra. Un pedido con una
// dirección ambigua entraba a la ruta con coordenadas que nadie había
// confirmado, y el chofer se enteraba al llegar a la casa equivocada. Ahora se
// usa ubicarDireccion(), que devuelve `elegida` SOLO cuando no hay dudas: si hay
// dos lugares con el mismo nombre, o solo se encontró la calle, el pedido se
// queda fuera con una advertencia y el chofer decide.
//
// No se pierde nada: el pedido sigue pendiente en la lista del día y la
// advertencia le dice qué corregir. Es el cumplimiento de SC-009 —ningún pedido
// entra a una ruta sin ubicación confirmada o advertencia visible— y del
// principio IV de la constitución.
async function reintentarUbicar(
  pendientes: Pedido[],
): Promise<{ pendientes: Pedido[]; advertencias: string[] }> {
  const sinUbicar = pendientes.filter((p) => !tieneCoordenadas(p));
  if (sinUbicar.length === 0) return { pendientes, advertencias: [] };

  const encontradas: { id: string; lat: number; lng: number }[] = [];
  const advertencias: string[] = [];
  const aIntentar = sinUbicar.slice(0, MAX_REINTENTOS_UBICAR);

  // Secuencial a propósito: en paralelo se pasaría del límite de consultas por
  // segundo de OpenStreetMap. El espaciado ya no se hace acá — lo garantiza el
  // propio geocodificador (ver la fila de turnos en lib/geocoding.ts), y así una
  // dirección que Mapbox resuelve sola no paga ninguna espera.
  for (const pedido of aIntentar) {
    const r = await ubicarDireccion(pedido.direccion);
    if (r.elegida) {
      encontradas.push({ id: pedido.id, lat: r.elegida.lat, lng: r.elegida.lng });
      // Entró a la ruta, pero puede haber entrado con la puerta interpolada
      // (tipo "aproximada"): se avisa igual. Un pedido que entra con una
      // coordenada aproximada y sin decirlo es el chofer buscando el número a
      // pie en la cuadra, sin saber por qué.
      if (r.advertencia) advertencias.push(`${pedido.nombre}: ${r.advertencia}`);
      continue;
    }
    // Sin ubicación confirmada. La advertencia nombra al destinatario porque es
    // así como el chofer sabe de qué paquete se trata; el texto no sale del
    // teléfono.
    if (r.advertencia) advertencias.push(`${pedido.nombre}: ${r.advertencia}`);
  }

  // Los que no entraron en este intento no son un problema silencioso: se
  // reintentan en la próxima generación, y mientras tanto hay que decirlo.
  const sinIntentar = sinUbicar.length - aIntentar.length;
  if (sinIntentar > 0) {
    advertencias.push(
      `Quedaron ${sinIntentar} pedido(s) sin intentar ubicar en esta pasada. Vuelve a armar la ruta para seguir.`,
    );
  }

  await fijarCoordenadas(encontradas);

  const porId = new Map(encontradas.map((c) => [c.id, c] as const));
  return {
    pendientes: pendientes.map((p) => {
      const coord = porId.get(p.id);
      return coord ? { ...p, lat: coord.lat, lng: coord.lng } : p;
    }),
    advertencias,
  };
}

async function resolverInicio(
  inicio: PuntoInicio,
  primerPedido: Coordenada,
): Promise<Coordenada> {
  if (inicio.tipo === "gps") {
    return { lat: inicio.lat, lng: inicio.lng };
  }

  if (inicio.tipo === "direccion") {
    // Ya viene ubicada (el chofer la eligió de la lista de sugerencias).
    if (inicio.lat != null && inicio.lng != null) {
      return { lat: inicio.lat, lng: inicio.lng };
    }
    const coord = await geocodificarDireccion(inicio.direccion);
    // Si el chofer escribió a mano de dónde parte y no se pudo ubicar, se lo
    // decimos en vez de arrancar la ruta desde un punto que no eligió (mismo
    // criterio que tenía la versión del servidor).
    if (!coord) {
      throw new Error(
        `No se pudo ubicar la dirección de partida "${inicio.direccion}" en el mapa. Revísala.`,
      );
    }
    return coord;
  }

  // Dirección de la empresa: si no está configurada o no se pudo ubicar, se
  // parte desde el primer pedido. La ruta sigue siendo válida, solo que el
  // punto de partida es aproximado — preferible a no poder salir a repartir.
  if (!inicio.direccion) return primerPedido;

  const guardada = partidaGuardada(inicio.direccion);
  if (guardada) return guardada;

  const coord = await geocodificarDireccion(inicio.direccion);
  if (coord) guardarPartida(inicio.direccion, coord);
  return coord ?? primerPedido;
}

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
//    mostrar (ver la Decisión 5 de research.md: no generar tres rutas artificiales
//    multiplicando consultas).
//
//  · Si dos estrategias dan el mismo orden de paradas, es la misma ruta y se
//    muestra una sola vez. Es lo más común en un día donde nadie eligió
//    horario, y es justamente el caso en que el chofer no tiene que comparar nada.

export type EstrategiaRuta = "corta" | "horarios" | "confirmados";

/** Una ruta candidata, ya ordenada y medida, todavía SIN trazado. */
export type Alternativa = {
  estrategia: EstrategiaRuta;
  /** Para el botón de la comparación. */
  titulo: string;
  /** Por qué mirarla. Una frase. */
  motivo: string;
  paradas: PedidoUbicado[];
  /** Metros según la matriz de calles. Es la cifra con la que se comparan las
   *  alternativas entre sí; la definitiva la trae el trazado. */
  metrosEstimados: number;
  /** Receptores que confirmaron o eligieron un horario. */
  confirmados: number;
  /** Los que todavía no contestaron: hay que llamarlos al aproximarse. */
  pendientesDeContacto: number;
  /** Bloques horarios que la estimación dice que se alcanzan. */
  bloquesCumplidos: number;
  /** Y los que no. Es la cifra que más pesa al elegir la recomendada. */
  bloquesIncumplidos: number;
  /** Nombres de los receptores a cuyo bloque se llegaría fuera de horario,
   *  antes o después (ver planificar.ts). */
  fueraDeHorario: string[];
};

const TITULOS: Record<EstrategiaRuta, { titulo: string; motivo: string }> = {
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

function coord(p: PedidoUbicado): Coordenada {
  return { lat: p.lat, lng: p.lng };
}

/** Las distancias de la matriz de calles, para el planificador. Un par que la
 *  matriz no tiene (sin matriz, o sin camino) se estima como en planificar.ts. */
function metrosPorMatriz(
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

/** Ordena un SUBCONJUNTO de paradas partiendo de un punto dado, reusando el
 *  optimizador de distancia y la matriz que ya se pidió.
 *
 *  Se recorta una submatriz en vez de volver a consultar: la matriz completa ya
 *  tiene todos los pares, y armar la submatriz es copiar números. */
function ordenarGrupo(
  desde: Coordenada,
  grupo: PedidoUbicado[],
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
  indiceDesde: number,
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

  const orden = ordenarParadas(puntos, sub);
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

  for (const grupo of grupos) {
    if (grupo.length === 0) continue;
    const ordenado = ordenarGrupo(desde, grupo, indiceEnMatriz, matriz, indiceDesde);
    salida.push(...ordenado);
    const ultima = ordenado[ordenado.length - 1];
    desde = coord(ultima);
    indiceDesde = indiceEnMatriz.get(ultima.id) ?? 0;
  }

  return salida;
}

function ordenPorEstrategia(
  estrategia: EstrategiaRuta,
  base: Coordenada,
  ubicados: PedidoUbicado[],
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
  minutosDeInicio: number,
): PedidoUbicado[] {
  if (estrategia === "corta") {
    return ordenarGrupo(base, ubicados, indiceEnMatriz, matriz, 0);
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
  const insertado = ubicarConHorario(
    ordenarGrupo(base, sinBloque, indiceEnMatriz, matriz, 0),
    conBloque,
    minutosDeInicio,
    metros,
  );

  // Con los horarios ya puestos, cada tramo sin horario se vuelve a ordenar por
  // distancia desde donde quedó la parada anterior: es una ruta nueva, no hay
  // un orden elegido que respetar. Se queda solo si no deja a nadie fuera de su
  // horario.
  const tramos = reordenarTramos(base, insertado, indiceEnMatriz, matriz);
  const fuera = (orden: PedidoUbicado[]) => fueraDeHorario(orden, minutosDeInicio, metros).length;
  return fuera(tramos) <= fuera(insertado) ? tramos : insertado;
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
  const cerrarTramo = () => {
    const anterior = salida[salida.length - 1];
    const desde = anterior ? coord(anterior) : base;
    const indiceDesde = anterior ? (indiceEnMatriz.get(anterior.id) ?? 0) : 0;
    salida.push(...ordenarGrupo(desde, tramo, indiceEnMatriz, matriz, indiceDesde));
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
  cerrarTramo();
  return salida;
}

/** Mide un orden: cuántos metros, y a qué bloques se llegaría fuera de horario. */
function medir(
  orden: PedidoUbicado[],
  metros: MetrosEntre,
  minutosDeInicio: number,
): Omit<Alternativa, "estrategia" | "titulo" | "motivo" | "paradas"> {
  const fuera = fueraDeHorario(orden, minutosDeInicio, metros);
  const conBloque = orden.filter((p) => bloquePorId(p.bloqueHorarioId)).length;
  return {
    metrosEstimados: Math.round(metrosDelOrden(orden, metros)),
    confirmados: orden.filter((p) => estaConfirmado(p.disponibilidad)).length,
    pendientesDeContacto: orden.filter((p) => p.disponibilidad === "pendiente_respuesta").length,
    bloquesCumplidos: conBloque - fuera.length,
    bloquesIncumplidos: fuera.length,
    fueraDeHorario: fuera.map((p) => p.nombre),
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
function elegirUtiles(candidatas: Alternativa[]): Alternativa[] {
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
        ? `"${sinUbicar[0].nombre}" no entra en la ruta: su dirección no está ubicada en el mapa.`
        : `${sinUbicar.length} pedidos no entran en la ruta porque su dirección no está ubicada en el mapa.`,
    );
  }
  // Misma partida y mismos pedidos que la vez anterior: la ruta ya está
  // calculada. Se devuelve esa, con el recuento de cerradas al día (que sí pudo
  // cambiar si el chofer marcó algo mientras la propuesta estaba en pantalla) y
  // con las advertencias recién calculadas: una dirección que el chofer corrigió
  // entre las dos pasadas no puede seguir avisando.
  const clave = huella(fecha, base, ubicados);
  if (ultimaPropuesta?.huella === clave) {
    return {
      ...ultimaPropuesta.propuesta,
      sinUbicar,
      cerradas: cerradas.length,
      advertencias,
    };
  }

  const puntos: Coordenada[] = [base, ...ubicados.map((p) => ({ lat: p.lat, lng: p.lng }))];

  // Distancias reales por calles para decidir el orden. Si son más de 25 puntos
  // o la API no responde, matrizDistancias devuelve null y ordenarParadas cae
  // solo a la línea recta, como antes.
  const matriz = await matrizDistancias(puntos);

  // El índice de cada pedido en la matriz: la fila 0 es la base, así que el
  // pedido i está en la fila i + 1.
  const indiceEnMatriz = new Map(ubicados.map((p, i) => [p.id, i + 1] as const));

  // La hora a la que arranca, en minutos desde medianoche. Sirve para estimar si
  // los bloques horarios se alcanzan; se toma del reloj y no de la ruta guardada
  // porque la pregunta es "si salgo AHORA, ¿llego?".
  const minutosDeInicio = minutoDelDia();
  const metros = metrosPorMatriz(base, indiceEnMatriz, matriz);

  // Los tres órdenes. Ninguno consulta nada: todos reusan la matriz de arriba.
  const candidatas: Alternativa[] = (["corta", "horarios", "confirmados"] as const).map(
    (estrategia) => {
      const orden = ordenPorEstrategia(
        estrategia,
        base,
        ubicados,
        indiceEnMatriz,
        matriz,
        minutosDeInicio,
      );
      return {
        estrategia,
        ...TITULOS[estrategia],
        paradas: orden,
        ...medir(orden, metros, minutosDeInicio),
      };
    },
  );

  const alternativas = elegirUtiles(candidatas);
  const recomendada = alternativas[0];
  const paradas = recomendada.paradas;

  // El trazado se pide SOLO para la recomendada, y no para las tres. Es la
  // consulta caraaa de este armado (ver la Decisión 5): mostrar tres opciones no
  // puede costar tres veces más. Cuando el chofer elige otra, se le pide el
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
 *  que mostrar uno (Decisión 5). El chofer paga la consulta de la que de verdad
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
 *  chofer pudo cerrar una parada o agregar un pedido: guardarRuta vuelve a leer
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
