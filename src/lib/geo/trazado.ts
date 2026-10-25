// El trazado de la ruta en el teléfono: hacia dónde sigue el camino, cuánto se
// apartó el conductor, pegar su posición a la calle y cuántos metros faltan. Puro:
// se calcula en cada lectura de GPS sin consultar nada.
import {
  METROS_POR_GRADO_LAT,
  deLngLat,
  distanciaMetros,
  rumboEntre,
  type Coordenada,
  type PuntoLngLat,
  type Trazado,
} from "@/lib/geo/coordenada";

/** Índice del punto del trazado más cercano a una posición. */
function indiceMasCercano(posicion: Coordenada, puntos: Coordenada[]): number {
  let masCerca = 0;
  let mejorDist = Infinity;
  for (let i = 0; i < puntos.length; i++) {
    const d = distanciaMetros(posicion, puntos[i]);
    if (d < mejorDist) {
      mejorDist = d;
      masCerca = i;
    }
  }
  return masCerca;
}

// Hacia dónde sigue el camino que el conductor está recorriendo: se mira un punto
// del trazado unos metros más adelante y se devuelve el rumbo hacia ahí.
//
// Es mejor referencia que la brújula del teléfono —que apunta hacia donde está
// apoyado el aparato, no hacia donde va el auto— y que el rumbo del GPS, que
// solo existe yendo en movimiento. Mirando la propia ruta se sabe cómo
// orientar la vista incluso estando detenido en un semáforo.
export function rumboDelCamino(
  posicion: Coordenada,
  trazado: Trazado,
  metrosAdelante = 45,
  /** Desde qué vértice mirar hacia adelante. Se le pasa el que ya emparejó el
   *  pegado del punto (ver ajustarATrazado): sin él se busca el más cercano de
   *  TODO el trazado, y una ruta que vuelve a pasar por la misma calle puede
   *  hacer que el rumbo salga de la pasada equivocada. */
  desdeIndice?: number,
): number | null {
  if (trazado.length < 2) return null;
  const puntos = trazado.map(deLngLat);

  // El trazado se pidió desde una posición anterior, así que primero hay que
  // ubicar por qué parte de él va el conductor ahora.
  const masCerca =
    desdeIndice != null && desdeIndice >= 0 && desdeIndice < puntos.length
      ? desdeIndice
      : indiceMasCercano(posicion, puntos);

  // Desde ahí se avanza por el trazado hasta juntar la distancia de
  // anticipación: ese punto es "hacia dónde sigue el camino".
  let acumulado = 0;
  let objetivo = puntos[puntos.length - 1];
  for (let i = masCerca; i < puntos.length - 1; i++) {
    acumulado += distanciaMetros(puntos[i], puntos[i + 1]);
    if (acumulado >= metrosAdelante) {
      objetivo = puntos[i + 1];
      break;
    }
  }

  // Si el punto quedó demasiado cerca (ya casi llegando), el rumbo saldría de
  // dos posiciones casi iguales y daría un valor errático.
  if (distanciaMetros(posicion, objetivo) < 5) return null;
  return rumboEntre(posicion, objetivo);
}

/** Punto del trazado más cercano a `p`: en qué segmento cae, cuánto se avanzó
 *  dentro de él (0 a 1) y a qué distancia quedó. Es la base de las dos cuentas
 *  que el teléfono hace en cada lectura de GPS — cuánto falta para la maniobra
 *  y cuánto se apartó del camino. */
type Proyeccion = { indice: number; t: number; metros: number };

/** La proyección, mirando solo los segmentos [desde, hasta). Acotar el rango es
 *  lo que impide que el punto salte a una pasada POSTERIOR del trazado por la
 *  misma calle (ver ajustarATrazado); con el rango completo es la proyección de
 *  toda la vida. */
function proyectarEnRango(
  p: Coordenada,
  trazado: Trazado,
  desde: number,
  hasta: number,
): Proyeccion | null {
  if (trazado.length === 0) return null;

  // A metros planos alrededor de p: a esta escala (cientos de metros) la
  // curvatura de la Tierra no se nota y la cuenta es la de geometría del liceo.
  const mPorGradoLng = METROS_POR_GRADO_LAT * Math.cos((p.lat * Math.PI) / 180);
  const x = ([lng]: PuntoLngLat) => (lng - p.lng) * mPorGradoLng;
  const y = ([, lat]: PuntoLngLat) => (lat - p.lat) * METROS_POR_GRADO_LAT;

  if (trazado.length === 1) {
    return { indice: 0, t: 0, metros: Math.hypot(x(trazado[0]), y(trazado[0])) };
  }

  const primero = Math.max(0, Math.min(desde, trazado.length - 2));
  const ultimo = Math.max(primero + 1, Math.min(hasta, trazado.length - 1));

  let mejor: Proyeccion = { indice: primero, t: 0, metros: Infinity };
  for (let i = primero; i < ultimo; i++) {
    const ax = x(trazado[i]);
    const ay = y(trazado[i]);
    const dx = x(trazado[i + 1]) - ax;
    const dy = y(trazado[i + 1]) - ay;
    const largo2 = dx * dx + dy * dy;

    // Proyección de p (que está en el origen) sobre el segmento, recortada a
    // sus extremos. largo2 = 0 son dos vértices repetidos: cuenta como punto.
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2));
    const metros = Math.hypot(ax + t * dx, ay + t * dy);
    if (metros < mejor.metros) mejor = { indice: i, t, metros };
  }
  return mejor;
}

function proyectarEnTrazado(p: Coordenada, trazado: Trazado): Proyeccion | null {
  return proyectarEnRango(p, trazado, 0, trazado.length - 1);
}

// Cuánto se apartó una posición del trazado, en metros. Se mide contra el
// SEGMENTO más cercano y no contra el vértice más cercano: en una recta larga
// Mapbox pone dos vértices a cuadras de distancia, así que ir justo por el medio
// de esa recta daba "200 m de desvío" y habría hecho recalcular la ruta sin
// motivo. Es lo que decide si el conductor sigue el camino o se salió (ver
// use-navegacion).
export function distanciaAPolilinea(p: Coordenada, trazado: Trazado): number {
  return proyectarEnTrazado(p, trazado)?.metros ?? Infinity;
}

// ----------------------------------------------------------------------------
// Pegar la posición al camino
// ----------------------------------------------------------------------------
// El GPS de un teléfono en ciudad se equivoca por decenas de metros, así que
// dibujar el punto donde dice la lectura lo pone adentro de una manzana, sobre
// un techo o en el cerro. Ningún navegador serio muestra eso: proyectan la
// posición sobre la ruta que se está siguiendo y dibujan ahí.
//
// HASTA DÓNDE SE PEGA. 90 metros, y no es un número al voleo: el primer punto
// del trazado es donde MAPBOX enganchó a la calle la lectura del propio conductor
// al calcular el tramo, o sea la mejor respuesta que existe a "por dónde sale
// este auto al camino". Una casa, un galpón o un estacionamiento están a 20-60
// m de la calle, así que con menos tolerancia el punto se queda adentro del
// patio — que fue justo lo que se vio probando.
//
// Más allá de 90 m ya no es error de GPS: el conductor está en otra calle. Ahí el
// punto se despega y se dibuja donde de verdad está, mientras la detección de
// desvío (UMBRAL_FUERA_DE_RUTA_M, 60 m sobre la lectura CRUDA) pide la ruta
// nueva. Que el punto se despegue después de que arrancó el recálculo es lo
// correcto: primero se admite el desvío, después se muestra.
//
// Y ojo con qué se hace con el resultado: esto es PRESENTACIÓN. La decisión de
// si el conductor se salió del camino se toma con la posición CRUDA (ver
// use-navegacion), porque un punto pegado está sobre la ruta por definición y
// nunca acusaría un desvío.
const TOLERANCIA_PEGADO_M = 90;

// CUÁNTO TRAZADO SE MIRA. La proyección global tiene un problema en una ciudad
// en damero: si la ruta vuelve a pasar cerca —y en Arica pasa seguido—, el
// punto puede engancharse en un tramo POSTERIOR y aparecer diez cuadras
// adelante, con recortarTrazado borrando media ruta detrás de él.
//
// Se busca entonces solo hacia adelante desde el último vértice emparejado, y
// hasta 300 m: holgadísimo contra lo que cubre un auto entre dos lecturas de
// GPS (56 m a 100 km/h).
//
// Hacia atrás no se busca NADA, y eso es una decisión: el avance por el trazado
// tiene que ser monótono. Medido sobre el tramo real de Arica con ruido de ±16
// m, permitir aunque sea un poco de retroceso hace que el punto se deslice para
// atrás media cuadra en los vértices —el auto pegando un salto hacia atrás en
// mitad de la calle, que es de lo que más se nota—. El precio es que un pico de
// ruido puede adelantar el emparejado un segmento y dejar el punto esperando en
// el vértice un segundo, hasta que el auto lo alcanza. Se corrige solo y no se
// ve; el retroceso sí.
const VENTANA_ADELANTE_M = 300;
const HOLGURA_ATRAS_M = 0;

export type PosicionPegada = {
  lat: number;
  lng: number;
  /** Cuánto se corrigió: la distancia real entre la lectura y el camino. */
  desvioM: number;
  /** Vértice del trazado desde el que sigue el camino por recorrer. */
  indice: number;
};

export type OpcionesPegado = {
  /** Último vértice emparejado, para buscar alrededor de él. Sin esto se busca
   *  desde el principio, que es lo que corresponde en un trazado recién pedido:
   *  el punto cae en el INICIO de la ruta, la salida al camino. */
  desdeIndice?: number;
  toleranciaM?: number;
  ventanaM?: number;
  holguraAtrasM?: number;
};

/** Cuántos vértices hay que retroceder desde `indice` para juntar `metros`. */
function retroceder(trazado: Trazado, indice: number, metros: number): number {
  let acumulado = 0;
  let i = indice;
  while (i > 0 && acumulado < metros) {
    const [lngA, latA] = trazado[i - 1];
    const [lngB, latB] = trazado[i];
    acumulado += distanciaMetros({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
    i--;
  }
  return i;
}

/** Cuántos vértices hay que avanzar desde `indice` para juntar `metros`. */
function avanzar(trazado: Trazado, indice: number, metros: number): number {
  let acumulado = 0;
  let i = indice;
  while (i < trazado.length - 1 && acumulado < metros) {
    const [lngA, latA] = trazado[i];
    const [lngB, latB] = trazado[i + 1];
    acumulado += distanciaMetros({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
    i++;
  }
  return i;
}

export function ajustarATrazado(
  posicion: Coordenada,
  trazado: Trazado,
  opciones: OpcionesPegado = {},
): PosicionPegada | null {
  if (trazado.length < 2) return null;

  const {
    desdeIndice = 0,
    toleranciaM = TOLERANCIA_PEGADO_M,
    ventanaM = VENTANA_ADELANTE_M,
    holguraAtrasM = HOLGURA_ATRAS_M,
  } = opciones;

  const partida = Math.max(0, Math.min(desdeIndice, trazado.length - 2));
  const enVentana = proyectarEnRango(
    posicion,
    trazado,
    retroceder(trazado, partida, holguraAtrasM),
    avanzar(trazado, partida, ventanaM),
  );

  // La ventana es una preferencia, no una cárcel. Si adentro no hay nada cerca,
  // se busca en el trazado entero: pasa cuando el teléfono estuvo suspendido
  // —una llamada entrante, un túnel— y el conductor avanzó kilómetros sin que
  // llegara una sola lectura. Sin este respaldo, el índice se quedaría clavado
  // atrás y el punto no volvería a pegarse en todo el tramo.
  //
  // El riesgo conocido es el contrario: si el tramo vuelve a pasar por la misma
  // calle, el respaldo puede enganchar la pasada equivocada. Se prefiere así
  // porque un tramo va derecho a UNA parada y rara vez se dobla sobre sí mismo,
  // mientras que un teléfono que se suspende es cosa de todos los días.
  const proyeccion =
    enVentana && enVentana.metros <= toleranciaM
      ? enVentana
      : proyectarEnTrazado(posicion, trazado);

  if (!proyeccion || proyeccion.metros > toleranciaM) return null;

  // El punto exacto dentro del segmento. A esta escala —dos vértices a decenas
  // de metros— interpolar en grados y no en metros no cambia nada medible.
  const [lngA, latA] = trazado[proyeccion.indice];
  const [lngB, latB] = trazado[proyeccion.indice + 1];
  return {
    lat: latA + (latB - latA) * proyeccion.t,
    lng: lngA + (lngB - lngA) * proyeccion.t,
    desvioM: proyeccion.metros,
    indice: proyeccion.indice,
  };
}

/** El trazado que FALTA recorrer: arranca en el punto pegado y sigue hasta el
 *  final. Lo que quedó atrás se descarta.
 *
 *  Es lo que hace que la línea azul salga del punto del conductor en vez de venir
 *  desde media cuadra más atrás. Dibujar el tramo ya recorrido no es solo feo:
 *  con el mapa girado e inclinado, esa cola apunta hacia atrás y se lee como un
 *  camino que hay que tomar. */
export function recortarTrazado(
  trazado: Trazado,
  pegado: PosicionPegada,
): Trazado {
  if (trazado.length < 2) return trazado;
  return [[pegado.lng, pegado.lat], ...trazado.slice(pegado.indice + 1)];
}

// Metros que faltan hasta el final de un trazado, SIGUIENDO el camino y no en
// línea recta. Se calcula en el teléfono en cada lectura de GPS: es lo que
// permite que el cartel y la voz sepan la distancia exacta a la próxima
// maniobra sin volver a consultar la API.
//
// Se mide desde la PROYECCIÓN sobre el segmento que se está recorriendo. Antes
// se sumaba la distancia al vértice anterior MÁS ese segmento entero, o sea que
// el tramo en curso se contaba dos veces: yendo por una avenida de 500 m con un
// vértice en cada punta, avanzar 100 m hacía que el cartel dijera que faltaban
// 100 m MÁS que antes de arrancar, y recién al pasar la mitad pegaba un salto
// hacia abajo. Con los avisos de voz atados a esta distancia, además, sonaban
// tarde.
export function metrosRestantes(posicion: Coordenada, trazado: Trazado): number {
  if (trazado.length === 0) return 0;
  const puntos = trazado.map(deLngLat);
  if (puntos.length === 1) return Math.round(distanciaMetros(posicion, puntos[0]));

  const proyeccion = proyectarEnTrazado(posicion, trazado);
  if (!proyeccion) return 0;

  // Lo que queda del segmento en curso, más los siguientes enteros.
  let total =
    distanciaMetros(puntos[proyeccion.indice], puntos[proyeccion.indice + 1]) *
    (1 - proyeccion.t);
  for (let i = proyeccion.indice + 1; i < puntos.length - 1; i++) {
    total += distanciaMetros(puntos[i], puntos[i + 1]);
  }
  return Math.round(total);
}
