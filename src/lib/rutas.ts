// Orden de paradas SIN VROOM: con ~30 paradas/día, vecino-más-cercano + mejora
// 2-opt corre en milisegundos y da un resultado MUY cercano al óptimo — no
// es una garantía matemática de óptimo exacto (eso requeriría resolver TSP
// exacto, inviable en tiempo razonable ya pasando ~15-20 paradas), pero es el
// estándar de la industria para este tamaño de problema sin pagar un solver.
//
// El trazado por calles, la distancia, la duración y las instrucciones paso a
// paso se le piden a la API de direcciones de Mapbox. Antes era el servidor de
// demostración de OSRM, que en su propia documentación se declara "para uso
// razonable NO COMERCIAL, sin garantías de disponibilidad" — con cinco choferes
// pidiendo el camino cada 150 metros, esto era una empresa en producción
// apoyada en un servidor de pruebas que puede cortar el acceso cualquier día.
//
// Además Mapbox entrega las instrucciones YA ESCRITAS en español, incluidos los
// avisos de voz con la distancia calculada ("En 300 metros, gire a la derecha
// hacia Vicuña Mackenna"). Con OSRM había que traducir a mano su vocabulario de
// maniobras y no había voz posible.
import type { Coordenada } from "./geocoding";

const DIRECTIONS = "https://api.mapbox.com/directions/v5/mapbox";
const MATRIX = "https://api.mapbox.com/directions-matrix/v1/mapbox";

// Perfil con tráfico real e histórico. Se usa también para el trazado del día
// completo: cuesta lo mismo que el perfil sin tráfico y la duración estimada
// sale más parecida a la realidad.
const PERFIL = "driving-traffic";

// Verificado contra la API: 25 puntos devuelve 200 y 26 devuelve 422, tanto en
// "driving" como en "driving-traffic". Una jornada de 30 paradas más la base son
// 31 puntos, así que el trazado del día SIEMPRE hay que pedirlo por tramos.
const MAX_PUNTOS_POR_CONSULTA = 25;

// Distancia en línea recta entre dos puntos, en metros. Vive acá y se exporta
// porque la usan también los hooks del chofer (ver use-navegacion y
// use-ubicacion-actual): antes estaba escrita tres veces, idéntica.
export function distanciaMetros(a: Coordenada, b: Coordenada): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Rumbo de A hacia B, en grados horarios desde el norte.
export function rumboEntre(a: Coordenada, b: Coordenada): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

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

function aCoordenadas(geometria: [number, number][]): Coordenada[] {
  return geometria.map(([lng, lat]) => ({ lat, lng }));
}

// Hacia dónde sigue el camino que el chofer está recorriendo: se mira un punto
// del trazado unos metros más adelante y se devuelve el rumbo hacia ahí.
//
// Es mejor referencia que la brújula del teléfono —que apunta hacia donde está
// apoyado el aparato, no hacia donde va el auto— y que el rumbo del GPS, que
// solo existe yendo en movimiento. Mirando la propia ruta se sabe cómo
// orientar la vista incluso estando detenido en un semáforo.
export function rumboDelCamino(
  posicion: Coordenada,
  geometria: [number, number][],
  metrosAdelante = 45,
  /** Desde qué vértice mirar hacia adelante. Se le pasa el que ya emparejó el
   *  pegado del punto (ver ajustarATrazado): sin él se busca el más cercano de
   *  TODO el trazado, y una ruta que vuelve a pasar por la misma calle puede
   *  hacer que el rumbo salga de la pasada equivocada. */
  desdeIndice?: number,
): number | null {
  if (geometria.length < 2) return null;
  const puntos = aCoordenadas(geometria);

  // El trazado se pidió desde una posición anterior, así que primero hay que
  // ubicar por qué parte de él va el chofer ahora.
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
  geometria: [number, number][],
  desde: number,
  hasta: number,
): Proyeccion | null {
  if (geometria.length === 0) return null;

  // A metros planos alrededor de p: a esta escala (cientos de metros) la
  // curvatura de la Tierra no se nota y la cuenta es la de geometría del liceo.
  const M_POR_GRADO_LAT = 111_320;
  const mPorGradoLng = M_POR_GRADO_LAT * Math.cos((p.lat * Math.PI) / 180);
  const x = ([lng]: [number, number]) => (lng - p.lng) * mPorGradoLng;
  const y = ([, lat]: [number, number]) => (lat - p.lat) * M_POR_GRADO_LAT;

  if (geometria.length === 1) {
    return { indice: 0, t: 0, metros: Math.hypot(x(geometria[0]), y(geometria[0])) };
  }

  const primero = Math.max(0, Math.min(desde, geometria.length - 2));
  const ultimo = Math.max(primero + 1, Math.min(hasta, geometria.length - 1));

  let mejor: Proyeccion = { indice: primero, t: 0, metros: Infinity };
  for (let i = primero; i < ultimo; i++) {
    const ax = x(geometria[i]);
    const ay = y(geometria[i]);
    const dx = x(geometria[i + 1]) - ax;
    const dy = y(geometria[i + 1]) - ay;
    const largo2 = dx * dx + dy * dy;

    // Proyección de p (que está en el origen) sobre el segmento, recortada a
    // sus extremos. largo2 = 0 son dos vértices repetidos: cuenta como punto.
    const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo2));
    const metros = Math.hypot(ax + t * dx, ay + t * dy);
    if (metros < mejor.metros) mejor = { indice: i, t, metros };
  }
  return mejor;
}

function proyectarEnTrazado(p: Coordenada, geometria: [number, number][]): Proyeccion | null {
  return proyectarEnRango(p, geometria, 0, geometria.length - 1);
}

// Cuánto se apartó una posición del trazado, en metros. Se mide contra el
// SEGMENTO más cercano y no contra el vértice más cercano: en una recta larga
// Mapbox pone dos vértices a cuadras de distancia, así que ir justo por el medio
// de esa recta daba "200 m de desvío" y habría hecho recalcular la ruta sin
// motivo. Es lo que decide si el chofer sigue el camino o se salió (ver
// use-navegacion).
export function distanciaAPolilinea(p: Coordenada, geometria: [number, number][]): number {
  return proyectarEnTrazado(p, geometria)?.metros ?? Infinity;
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
// del trazado es donde MAPBOX enganchó a la calle la lectura del propio chofer
// al calcular el tramo, o sea la mejor respuesta que existe a "por dónde sale
// este auto al camino". Una casa, un galpón o un estacionamiento están a 20-60
// m de la calle, así que con menos tolerancia el punto se queda adentro del
// patio — que fue justo lo que se vio probando.
//
// Más allá de 90 m ya no es error de GPS: el chofer está en otra calle. Ahí el
// punto se despega y se dibuja donde de verdad está, mientras la detección de
// desvío (UMBRAL_FUERA_DE_RUTA_M, 60 m sobre la lectura CRUDA) pide la ruta
// nueva. Que el punto se despegue después de que arrancó el recálculo es lo
// correcto: primero se admite el desvío, después se muestra.
//
// Y ojo con qué se hace con el resultado: esto es PRESENTACIÓN. La decisión de
// si el chofer se salió del camino se toma con la posición CRUDA (ver
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
function retroceder(geometria: [number, number][], indice: number, metros: number): number {
  let acumulado = 0;
  let i = indice;
  while (i > 0 && acumulado < metros) {
    const [lngA, latA] = geometria[i - 1];
    const [lngB, latB] = geometria[i];
    acumulado += distanciaMetros({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
    i--;
  }
  return i;
}

/** Cuántos vértices hay que avanzar desde `indice` para juntar `metros`. */
function avanzar(geometria: [number, number][], indice: number, metros: number): number {
  let acumulado = 0;
  let i = indice;
  while (i < geometria.length - 1 && acumulado < metros) {
    const [lngA, latA] = geometria[i];
    const [lngB, latB] = geometria[i + 1];
    acumulado += distanciaMetros({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
    i++;
  }
  return i;
}

export function ajustarATrazado(
  posicion: Coordenada,
  geometria: [number, number][],
  opciones: OpcionesPegado = {},
): PosicionPegada | null {
  if (geometria.length < 2) return null;

  const {
    desdeIndice = 0,
    toleranciaM = TOLERANCIA_PEGADO_M,
    ventanaM = VENTANA_ADELANTE_M,
    holguraAtrasM = HOLGURA_ATRAS_M,
  } = opciones;

  const partida = Math.max(0, Math.min(desdeIndice, geometria.length - 2));
  const enVentana = proyectarEnRango(
    posicion,
    geometria,
    retroceder(geometria, partida, holguraAtrasM),
    avanzar(geometria, partida, ventanaM),
  );

  // La ventana es una preferencia, no una cárcel. Si adentro no hay nada cerca,
  // se busca en el trazado entero: pasa cuando el teléfono estuvo suspendido
  // —una llamada entrante, un túnel— y el chofer avanzó kilómetros sin que
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
      : proyectarEnTrazado(posicion, geometria);

  if (!proyeccion || proyeccion.metros > toleranciaM) return null;

  // El punto exacto dentro del segmento. A esta escala —dos vértices a decenas
  // de metros— interpolar en grados y no en metros no cambia nada medible.
  const [lngA, latA] = geometria[proyeccion.indice];
  const [lngB, latB] = geometria[proyeccion.indice + 1];
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
 *  Es lo que hace que la línea azul salga del punto del chofer en vez de venir
 *  desde media cuadra más atrás. Dibujar el tramo ya recorrido no es solo feo:
 *  con el mapa girado e inclinado, esa cola apunta hacia atrás y se lee como un
 *  camino que hay que tomar. */
export function recortarTrazado(
  geometria: [number, number][],
  pegado: PosicionPegada,
): [number, number][] {
  if (geometria.length < 2) return geometria;
  return [[pegado.lng, pegado.lat], ...geometria.slice(pegado.indice + 1)];
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
export function metrosRestantes(posicion: Coordenada, geometria: [number, number][]): number {
  if (geometria.length === 0) return 0;
  const puntos = aCoordenadas(geometria);
  if (puntos.length === 1) return Math.round(distanciaMetros(posicion, puntos[0]));

  const proyeccion = proyectarEnTrazado(posicion, geometria);
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

/** Costo de ir del punto `a` al punto `b`, ambos por índice. */
type Costo = (a: number, b: number) => number;

function distanciaOrden(orden: number[], costo: Costo): number {
  let total = 0;
  for (let i = 0; i < orden.length - 1; i++) {
    total += costo(orden[i], orden[i + 1]);
  }
  return total;
}

// Diferencia mínima para considerar que un cambio mejora. Los costos son metros
// (cientos o miles), así que esto solo frena el ruido de coma flotante: sin él,
// dos órdenes que valen lo mismo se turnarían para "mejorarse" mutuamente y el
// bucle no terminaría nunca.
const EPSILON = 1e-6;

// ----------------------------------------------------------------------------
// Lo que hace difícil este problema, y por qué se resuelve así
// ----------------------------------------------------------------------------
//
// Ordenar 30 paradas es el problema del viajante: no hay forma conocida de
// resolverlo exacto en tiempo razonable pasando de ~20 paradas. Así que hay dos
// regímenes:
//
//   · Día chico (hasta MAX_EXACTO puntos): se resuelve EXACTO. El orden que
//     sale es el mejor que existe, no "uno bueno".
//   · Día grande: construcción + mejora local. Se apunta a quedar a un puñado
//     de por ciento del óptimo, que es lo que se puede prometer.
//
// Y hay un detalle que cambia qué jugadas sirven: la matriz de calles es
// ASIMÉTRICA. Ir de A a B no cuesta lo mismo que de B a A —sentidos únicos, la
// costanera, la quebrada— y eso rompe la simplificación clásica del 2-opt, que
// da vuelta un tramo suponiendo que recorrerlo al revés cuesta igual. Por eso
// acá el 2-opt suma explícitamente el tramo invertido, y por eso se agrega el
// Or-opt, que MUEVE un grupo de paradas sin darlo vuelta y es la jugada que de
// verdad rinde cuando los costos son asimétricos.

/** Hasta este tamaño se resuelve exacto. El límite lo pone la memoria: la tabla
 *  es 2^(n-1) × (n-1) números, o sea ~850 KB con 14 puntos y 4 MB con 16. En el
 *  teléfono de un chofer no conviene pedir más, y 14 puntos son 13 paradas: la
 *  jornada corta real. */
const MAX_EXACTO = 14;

/** Cuántas paradas seguidas prueba mover el Or-opt. Más de 3 casi no encuentra
 *  nada nuevo y multiplica el trabajo. */
const MAX_SEGMENTO_OROPT = 3;

/** Arranques distintos del vecino más cercano. Esa heurística se casa con su
 *  primera decisión —y es la que más pesa—, así que se la fuerza a empezar por
 *  cada una de las paradas más cercanas a la base y se corre la mejora local
 *  sobre todas. */
const MAX_ARRANQUES = 4;

/** Tope de vueltas de mejora local. Cada vuelta mejora de verdad (el EPSILON lo
 *  garantiza), así que el bucle termina solo; esto es un cinturón por si un
 *  costo raro —NaN de una matriz mal formada— rompiera esa garantía. */
const MAX_VUELTAS = 400;

// ----------------------------------------------------------------------------
// Óptimo exacto (Held-Karp)
// ----------------------------------------------------------------------------
// Programación dinámica sobre subconjuntos: dp[conjunto][j] = lo mínimo que
// cuesta salir de la base, visitar exactamente ese conjunto de paradas y quedar
// parado en j. Es exponencial (2^n), pero con n chico son milisegundos y a
// cambio no queda ninguna duda: no existe un orden mejor.
//
// Devuelve null si no hay ningún recorrido completo posible (tramos sin camino
// entre sí, que Mapbox marca como Infinity): ahí no hay óptimo que dar y manda
// la heurística, que al menos devuelve algo.
function exacto(n: number, costo: Costo): number[] | null {
  const m = n - 1; // paradas, sin contar la base
  const combinaciones = 1 << m;
  const dp = new Float64Array(combinaciones * m).fill(Infinity);
  const desde = new Int16Array(combinaciones * m).fill(-1);

  for (let j = 0; j < m; j++) dp[(1 << j) * m + j] = costo(0, j + 1);

  for (let conjunto = 1; conjunto < combinaciones; conjunto++) {
    for (let j = 0; j < m; j++) {
      if (!(conjunto & (1 << j))) continue;
      const hasta = dp[conjunto * m + j];
      if (!Number.isFinite(hasta)) continue;

      for (let k = 0; k < m; k++) {
        if (conjunto & (1 << k)) continue;
        const siguiente = conjunto | (1 << k);
        const total = hasta + costo(j + 1, k + 1);
        if (total < dp[siguiente * m + k]) {
          dp[siguiente * m + k] = total;
          desde[siguiente * m + k] = j;
        }
      }
    }
  }

  const todas = combinaciones - 1;
  let ultimo = -1;
  let mejor = Infinity;
  for (let j = 0; j < m; j++) {
    if (dp[todas * m + j] < mejor) {
      mejor = dp[todas * m + j];
      ultimo = j;
    }
  }
  if (ultimo === -1 || !Number.isFinite(mejor)) return null;

  const orden: number[] = [];
  let conjunto = todas;
  let j = ultimo;
  while (j >= 0) {
    orden.push(j + 1);
    const previo = desde[conjunto * m + j];
    conjunto ^= 1 << j;
    j = previo;
  }
  orden.reverse();
  return [0, ...orden];
}

// ----------------------------------------------------------------------------
// Construcción: dos formas distintas de armar un primer orden
// ----------------------------------------------------------------------------

/** Vecino más cercano. `primero` fuerza por cuál parada empezar (multi-arranque). */
function vecinoMasCercano(n: number, costo: Costo, primero?: number): number[] {
  const visitado = new Array<boolean>(n).fill(false);
  visitado[0] = true;
  const orden = [0];
  let actual = 0;

  for (let k = 1; k < n; k++) {
    // Con la matriz de calles un costo puede ser Infinity (dos paradas sin
    // camino entre sí, según Mapbox), cosa que en línea recta no pasa nunca.
    // Si TODAS las que quedan son inalcanzables no hay "más cercana", así que
    // se toma la primera pendiente: mejor una parada en un orden discutible que
    // un índice -1 metido en la ruta.
    let mejor = -1;
    if (k === 1 && primero != null && primero > 0 && primero < n) {
      mejor = primero;
    } else {
      let mejorDist = Infinity;
      for (let j = 0; j < n; j++) {
        if (visitado[j]) continue;
        if (mejor === -1) mejor = j;
        const d = costo(actual, j);
        if (d < mejorDist) {
          mejorDist = d;
          mejor = j;
        }
      }
    }
    visitado[mejor] = true;
    orden.push(mejor);
    actual = mejor;
  }
  return orden;
}

/** Inserción más barata: en cada vuelta mete la parada que menos alargue la
 *  ruta, en el lugar donde menos la alargue. Suele arrancar bastante mejor que
 *  el vecino más cercano, que deja las últimas paradas tiradas lejos. */
function insercionMasBarata(n: number, costo: Costo): number[] {
  const orden = [0];
  const pendientes = new Set<number>();
  for (let i = 1; i < n; i++) pendientes.add(i);

  while (pendientes.size > 0) {
    let mejorParada = -1;
    let mejorPosicion = orden.length;
    let mejorCosto = Infinity;

    for (const parada of pendientes) {
      for (let p = 1; p <= orden.length; p++) {
        const a = orden[p - 1];
        const b = p < orden.length ? orden[p] : -1;
        const delta = costo(a, parada) + (b >= 0 ? costo(parada, b) - costo(a, b) : 0);
        if (delta < mejorCosto) {
          mejorCosto = delta;
          mejorParada = parada;
          mejorPosicion = p;
        }
      }
    }
    // Todo inalcanzable: se pega al final y se sigue.
    if (mejorParada === -1) mejorParada = pendientes.values().next().value!;

    orden.splice(mejorPosicion, 0, mejorParada);
    pendientes.delete(mejorParada);
  }
  return orden;
}

// ----------------------------------------------------------------------------
// Mejora local
// ----------------------------------------------------------------------------

function costoSegmento(seg: number[], costo: Costo): number {
  let total = 0;
  for (let i = 0; i < seg.length - 1; i++) total += costo(seg[i], seg[i + 1]);
  return total;
}

// 2-opt: da vuelta el tramo [i..j] y mira si conviene.
//
// La diferencia con la versión anterior no es qué prueba, sino cuánto cuesta
// probarlo: antes armaba el orden completo y lo sumaba entero, dos veces, por
// cada par (i,j) — O(n) por candidato. Acá las sumas del tramo en sus dos
// sentidos se arrastran al mover j, así que evaluar un candidato son cuatro
// costos. Con 61 puntos eso baja de ~230.000 sumas por pasada a ~3.700, y ese
// margen es el que después se gasta en probar MÁS órdenes, que es de donde sale
// la mejora de verdad.
function dosOptPasada(orden: number[], costo: Costo): boolean {
  const n = orden.length;
  let mejoro = false;

  for (let i = 1; i < n - 1; i++) {
    let derecho = 0; // suma del tramo [i..j] tal como está
    let invertido = 0; // el mismo tramo recorrido al revés (¡no es lo mismo!)

    for (let j = i + 1; j < n; j++) {
      derecho += costo(orden[j - 1], orden[j]);
      invertido += costo(orden[j], orden[j - 1]);

      // El último punto NO está fijo: la ruta es abierta (no vuelve a la base),
      // así que la parada final también puede moverse.
      const hayCierre = j + 1 < n;
      const antes =
        costo(orden[i - 1], orden[i]) + derecho + (hayCierre ? costo(orden[j], orden[j + 1]) : 0);
      const despues =
        costo(orden[i - 1], orden[j]) + invertido + (hayCierre ? costo(orden[i], orden[j + 1]) : 0);

      if (despues < antes - EPSILON) {
        for (let a = i, b = j; a < b; a++, b--) {
          [orden[a], orden[b]] = [orden[b], orden[a]];
        }
        mejoro = true;
        break; // el tramo cambió: las sumas que venía arrastrando ya no valen
      }
    }
  }
  return mejoro;
}

// Or-opt: SACA un grupo de 1 a 3 paradas seguidas y lo mete en otro lado, con
// el grupo en su orden o dado vuelta.
//
// Es la jugada que le faltaba, y la que más rinde con costos asimétricos: mover
// un grupo sin invertirlo no cambia ningún tramo interno, así que el 2-opt
// —que vive de invertir— se pierde justo las mejoras que no cuestan nada. El
// caso típico del reparto es una parada que quedó encajada en medio de un
// barrio al que no pertenece: el 2-opt no la puede sacar de ahí sin dar vuelta
// media ruta.
function orOptPasada(orden: number[], costo: Costo): boolean {
  const n = orden.length;

  for (let largo = 1; largo <= MAX_SEGMENTO_OROPT && largo < n - 1; largo++) {
    for (let i = 1; i + largo <= n; i++) {
      const seg = orden.slice(i, i + largo);
      const previo = orden[i - 1];
      const siguiente = i + largo < n ? orden[i + largo] : -1;

      // Lo que se ahorra al sacarlo de donde está.
      const saca =
        costo(previo, seg[0]) +
        (siguiente >= 0 ? costo(seg[largo - 1], siguiente) - costo(previo, siguiente) : 0);
      if (!Number.isFinite(saca)) continue;

      const resto = [...orden.slice(0, i), ...orden.slice(i + largo)];
      const segInvertido = [...seg].reverse();
      const internoDerecho = costoSegmento(seg, costo);
      const internoInvertido = costoSegmento(segInvertido, costo);

      for (let p = 1; p <= resto.length; p++) {
        if (p === i) continue; // volver a ponerlo donde estaba no es una mejora
        const a = resto[p - 1];
        const b = p < resto.length ? resto[p] : -1;

        for (const invertir of [false, true]) {
          const s = invertir ? segInvertido : seg;
          const interno = invertir ? internoInvertido : internoDerecho;
          const pone =
            costo(a, s[0]) +
            (b >= 0 ? costo(s[largo - 1], b) - costo(a, b) : 0) +
            (interno - internoDerecho);

          if (pone < saca - EPSILON) {
            resto.splice(p, 0, ...s);
            for (let k = 0; k < n; k++) orden[k] = resto[k];
            return true; // aplicado: se vuelve a empezar sobre el orden nuevo
          }
        }
      }
    }
  }
  return false;
}

/** Aplica las dos mejoras hasta que ninguna encuentra nada. */
function mejorarLocal(inicial: number[], costo: Costo): number[] {
  const orden = [...inicial];
  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const cambio2opt = dosOptPasada(orden, costo);
    const cambioOrOpt = orOptPasada(orden, costo);
    if (!cambio2opt && !cambioOrOpt) break;
  }
  return orden;
}

// ----------------------------------------------------------------------------
// Sacudir y volver a mejorar
// ----------------------------------------------------------------------------
//
// La mejora local termina en un mínimo LOCAL: un orden donde ninguna de las
// jugadas que sabe hacer mejora nada, aunque exista un orden bastante mejor un
// poco más allá. En cuál de esos mínimos cae depende del arranque, así que
// tocando un poco el algoritmo se puede salir MEJOR en promedio y PEOR en
// algunos casos sueltos — medido contra la versión anterior, hasta 5,7% peor en
// una de cada treinta jornadas. Que la ruta de un día concreto empeore no es un
// costo aceptable, aunque el promedio mejore.
//
// El "double bridge" es la sacudida clásica para esto: corta la ruta en cuatro
// e intercambia los dos trozos del medio. Se elige justamente porque el 2-opt
// NO puede deshacerla en un solo paso —así que no vuelve caminando al mismo
// mínimo— pero conserva el sentido de recorrido de cada trozo, que con costos
// asimétricos es lo que evita arruinar la ruta de entrada.
//
// Se sacude, se vuelve a mejorar, y el resultado se acepta SOLO si es mejor.
// Por eso esto no puede empeorar nada: en el peor caso se queda con lo que ya
// tenía y se gastaron unos milisegundos.

/** Cuántas sacudidas, según el tamaño. Una mejora local cuesta del orden de n²,
 *  así que el número se escala al revés para que el trabajo total quede parejo
 *  —unas décimas de segundo— en vez de dispararse en las jornadas grandes, que
 *  son justo las que corren en el teléfono del chofer. */
function sacudidasPara(n: number): number {
  return Math.max(20, Math.min(200, Math.round(60_000 / (n * n))));
}

/** Números al azar reproducibles: la misma jornada tiene que dar siempre la
 *  misma ruta, o el chofer regenera y le cambia el orden sin motivo. */
function alAzar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function doblePuente(orden: number[], azar: () => number): number[] {
  const n = orden.length;
  // Hacen falta al menos tres cortes después de la base.
  if (n < 8) return orden;

  const cortes = [
    1 + Math.floor(azar() * (n - 3)),
    1 + Math.floor(azar() * (n - 3)),
    1 + Math.floor(azar() * (n - 3)),
  ].sort((a, b) => a - b);
  const [p1, p2, p3] = cortes;
  if (p1 === p2 || p2 === p3) return orden;

  return [
    ...orden.slice(0, p1),
    ...orden.slice(p2, p3),
    ...orden.slice(p1, p2),
    ...orden.slice(p3),
  ];
}

/** Mejora todos los arranques, se queda con el mejor y después lo sacude unas
 *  cuantas veces por si hay algo mejor a la vuelta de la esquina. */
function mejorDeVariosArranques(arranques: number[][], costo: Costo): number[] {
  let mejor = arranques[0];
  let mejorCosto = Infinity;

  for (const arranque of arranques) {
    const candidato = mejorarLocal(arranque, costo);
    const total = distanciaOrden(candidato, costo);
    if (total < mejorCosto) {
      mejorCosto = total;
      mejor = candidato;
    }
  }

  // La semilla sale del COSTO del mejor orden, no del tamaño: sembrarla solo
  // con n le daba a todas las jornadas de 20 paradas exactamente la misma
  // secuencia de sacudidas, y con una mala racha fija había jornadas que se
  // quedaban clavadas en un valle malo. Sigue siendo reproducible —el mismo
  // día da siempre la misma ruta— pero cada jornada explora distinto.
  const azar = alAzar(Math.round(mejorCosto) * 31 + mejor.length);
  const sacudidas = sacudidasPara(mejor.length);
  for (let i = 0; i < sacudidas; i++) {
    const candidato = mejorarLocal(doblePuente(mejor, azar), costo);
    const total = distanciaOrden(candidato, costo);
    if (total < mejorCosto - EPSILON) {
      mejorCosto = total;
      mejor = candidato;
    }
  }
  return mejor;
}

// Recibe puntos donde puntos[0] es la base (depósito/oficina) y el resto son
// las paradas a visitar. Devuelve los ÍNDICES en el orden de visita óptimo
// (el índice 0 siempre queda primero).
//
// Con "matriz" (distancias REALES por calles, ver matrizDistancias) el orden
// deja de ser el que parece bueno mirando el mapa en línea recta y pasa a ser
// el que de verdad se maneja menos. Es una diferencia grande: dos paradas a
// tres cuadras en línea recta pueden estar a quince por calle si en el medio
// hay sentidos únicos, una quebrada o la costanera. Medido sobre jornadas de 9
// paradas en Arica, ordenar por calle ahorra del orden de un kilómetro por día.
//
// Sin matriz (más de 25 puntos, o la API no respondió) se cae a la línea recta,
// que es lo que se hacía siempre.
export function ordenarParadas(puntos: Coordenada[], matriz?: number[][] | null): number[] {
  const n = puntos.length;
  if (n <= 2) return puntos.map((_, i) => i);

  const enLineaRecta: Costo = (a, b) => distanciaMetros(puntos[a], puntos[b]);
  // Un tramo sin dato (dos puntos sin camino entre ellos) no puede valer 0 o la
  // mejora local lo elegiría siempre; se lo trata como imposible.
  const costo: Costo = matriz ? (a, b) => matriz[a]?.[b] ?? Infinity : enLineaRecta;

  // Día chico: el óptimo exacto sale en milisegundos, así que no hay razón para
  // conformarse con una aproximación.
  if (n <= MAX_EXACTO) {
    const optimo = exacto(n, costo);
    if (optimo) return optimo;
  }

  const arranques = [vecinoMasCercano(n, costo), insercionMasBarata(n, costo)];

  // El vecino más cercano se casa con su primera decisión, que es la que más
  // pesa en cómo queda el resto. Se lo vuelve a correr empezando por cada una
  // de las paradas más cercanas a la base.
  const masCercanas = Array.from({ length: n - 1 }, (_, i) => i + 1)
    .sort((a, b) => costo(0, a) - costo(0, b))
    .slice(0, MAX_ARRANQUES);
  for (const primero of masCercanas) arranques.push(vecinoMasCercano(n, costo, primero));

  // Con matriz se agrega además el mejor orden EN LÍNEA RECTA como arranque:
  // son dos paisajes distintos y a veces el de línea recta cae en un valle que
  // el de calles no encuentra. Se mide con el costo real, así que no puede
  // salir peor — es el mismo criterio que ya tenía esta función, ahora como un
  // arranque más en vez de una comparación aparte.
  if (matriz) arranques.push(mejorarLocal(vecinoMasCercano(n, enLineaRecta), enLineaRecta));

  return mejorDeVariosArranques(arranques, costo);
}

// ----------------------------------------------------------------------------
// Mapbox Directions
// ----------------------------------------------------------------------------

/** Falta la variable de entorno: es un error de configuración del despliegue,
 *  no una falla de red, así que se avisa fuerte en vez de degradar en silencio. */
export class ErrorTokenMapbox extends Error {
  constructor() {
    super(
      "Falta configurar NEXT_PUBLIC_MAPBOX_TOKEN. Sin ese token no hay mapa ni indicaciones.",
    );
  }
}

function urlDirections(puntos: Coordenada[], params: Record<string, string>): string {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new ErrorTokenMapbox();

  const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(";");
  const query = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    // Mapbox trae esto en "true" por defecto para los perfiles en auto, y ese
    // default es el que hacía que la ruta "diera vueltas": obliga a SEGUIR
    // DERECHO al salir de cada parada intermedia, o sea prohíbe volver por
    // donde se vino. Para una camioneta de reparto —que se detiene, entrega y
    // puede perfectamente devolverse— eso no es una restricción real: es una
    // vuelta a la manzana regalada en cada entrega.
    //
    // Medido sobre 25 jornadas de Arica: con el default, 18 de 25 rutas salían
    // más largas, hasta 1.448 m de más en una ruta de solo 4 paradas.
    continue_straight: "false",
    access_token: token,
    ...params,
  });
  return `${DIRECTIONS}/${PERFIL}/${coords}?${query}`;
}

// Límite verificado contra la API: el perfil "driving" acepta 25 coordenadas
// (26 devuelve 422) y "driving-traffic" solo 10. Se usa "driving" a propósito:
// con 25 paradas entra una jornada completa en UNA consulta, y para decidir el
// ORDEN de las paradas las velocidades de tráfico del momento no ayudan —el
// chofer va a pasar por ahí dentro de tres horas, no ahora.
const MAX_PUNTOS_MATRIZ = 25;

// Distancias reales por calles entre TODAS las paradas (matriz n×n, en metros).
// Es lo que le falta a ordenarParadas para no ordenar mirando la línea recta.
//
// Devuelve null si no entra en una sola consulta o si la API no respondió: en
// ese caso se ordena como siempre, en línea recta. Nunca lanza — que no se pueda
// afinar el orden no es motivo para dejar al chofer sin ruta.
export async function matrizDistancias(puntos: Coordenada[]): Promise<number[][] | null> {
  if (puntos.length < 2 || puntos.length > MAX_PUNTOS_MATRIZ) return null;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;

  const coords = puntos.map((p) => `${p.lng},${p.lat}`).join(";");
  const query = new URLSearchParams({ annotations: "distance", access_token: token });

  try {
    const res = await fetch(`${MATRIX}/driving/${coords}?${query}`);
    if (!res.ok) return null;
    const datos = (await res.json()) as { distances?: (number | null)[][] };
    if (!Array.isArray(datos.distances)) return null;
    // Mapbox manda null en los pares que no tienen camino entre sí.
    return datos.distances.map((fila) => fila.map((d) => d ?? Infinity));
  } catch {
    return null;
  }
}

// Parte una lista de puntos en tramos de como máximo "max", repitiendo el
// último punto de cada tramo como primero del siguiente para que los trazados
// queden pegados sin huecos.
function enTramos(puntos: Coordenada[], max: number): Coordenada[][] {
  if (puntos.length <= max) return [puntos];
  const grupos: Coordenada[][] = [];
  let i = 0;
  while (i < puntos.length - 1) {
    const fin = Math.min(i + max, puntos.length);
    grupos.push(puntos.slice(i, fin));
    i = fin - 1;
  }
  return grupos;
}

export type RutaCalles = {
  /** [lng, lat] por punto — formato GeoJSON. */
  geometria: [number, number][];
  distanciaM: number;
  duracionS: number;
};

// Trazado real (por calles) de la ruta ya ordenada, con su distancia y duración.
// Devuelve null si la API no respondió: el llamador conserva el trazado anterior
// en vez de dejar al chofer con un mapa en blanco (ver guardarRuta).
export async function obtenerRutaCalles(
  puntosOrdenados: Coordenada[],
): Promise<RutaCalles | null> {
  if (puntosOrdenados.length < 2) return null;

  const geometria: [number, number][] = [];
  let distanciaM = 0;
  let duracionS = 0;

  for (const tramo of enTramos(puntosOrdenados, MAX_PUNTOS_POR_CONSULTA)) {
    let ruta: { geometry: { coordinates: [number, number][] }; distance: number; duration: number };
    try {
      const res = await fetch(urlDirections(tramo, {}));
      if (!res.ok) return null;
      ruta = (await res.json()).routes?.[0];
    } catch (e) {
      // Un token faltante NO es una falla de red: tiene que llegar al llamador.
      if (e instanceof ErrorTokenMapbox) throw e;
      return null;
    }
    if (!ruta) return null;

    // Un tramo a medias sería peor que ninguno: el chofer vería una línea que
    // se corta en el medio de la ciudad y parece la ruta completa.
    const coords = ruta.geometry.coordinates;
    // El primer punto de cada tramo posterior es el último del anterior.
    geometria.push(...(geometria.length === 0 ? coords : coords.slice(1)));
    distanciaM += ruta.distance;
    duracionS += ruta.duration;
  }

  return {
    geometria,
    distanciaM: Math.round(distanciaM),
    duracionS: Math.round(duracionS),
  };
}

/** Aviso de voz de una maniobra, tal como lo entrega Mapbox. */
export type AvisoVoz = {
  /** Ya escrito en español ("En 300 metros, gire a la derecha hacia Chacabuco"). */
  texto: string;
  /** A cuántos metros del final del paso corresponde decirlo. */
  aMetros: number;
};

export type PasoNavegacion = {
  /** Instrucción completa en español, lista para mostrar. La escribe Mapbox
   *  (language=es): ya no hay que traducir vocabulario de maniobras a mano. */
  instruccion: string;
  /** Texto corto del cartel: normalmente la calle a la que se entra. */
  banner: string | null;
  /** Metros a recorrer ANTES de ejecutar esta maniobra, según la API. En
   *  pantalla se prefiere el cálculo local (ver metrosRestantes), que se
   *  actualiza con cada lectura de GPS. */
  distanciaM: number;
  /** "turn" | "roundabout" | "arrive" | … — solo para elegir el ícono. */
  tipo: string;
  /** "left" | "right" | "slight left" | "uturn" | … , o null. Solo para el ícono. */
  modificador: string | null;
  /** Trazado de ESTE paso, que termina justo en la maniobra. Con esto se sabe
   *  cuántos metros faltan para el giro sin volver a consultar la API. */
  geometria: [number, number][];
  /** Avisos de voz de este paso, del más lejano al más cercano. */
  avisos: AvisoVoz[];
};

type PasoCrudo = {
  maneuver?: { type?: string; modifier?: string; instruction?: string };
  distance?: number;
  geometry?: { coordinates?: [number, number][] };
  bannerInstructions?: { primary?: { text?: string } }[];
  voiceInstructions?: { announcement?: string; distanceAlongGeometry?: number }[];
};

// Tramo de navegación (posición actual → parada activa): instrucciones paso a
// paso MÁS el trazado por calles de ese tramo — distinto de obtenerRutaCalles,
// que es la ruta completa del día (todas las paradas desde la base, calculada
// una sola vez al generar). Esta es la que el chofer necesita ver: cómo ir
// desde donde está AHORA hasta la próxima entrega.
//
// Se llama una vez por parada / cada vez que el chofer se aleja lo suficiente
// de donde se pidió la última (ver useNavegacion), no en cada actualización de
// GPS. Entre consulta y consulta, la distancia a la maniobra se recalcula en el
// teléfono con metrosRestantes().
// Cuánto se le permite a Mapbox apartarse del rumbo declarado al elegir por
// qué calzada arranca la ruta. Amplio a propósito: el rumbo muchas veces no
// viene del GPS sino estimado entre dos lecturas seguidas (ver
// use-ubicacion-actual), así que es ruidoso. Con 90° igual se descarta la
// calzada CONTRARIA de una avenida dividida —que es el caso que importa— sin
// arriesgar que la consulta se quede sin ningún camino válido.
const TOLERANCIA_RUMBO = 90;

export async function obtenerNavegacion(
  origen: Coordenada,
  destino: Coordenada,
  /** Hacia dónde apunta el auto AHORA, en grados desde el norte. Sin esto,
   *  Mapbox pega la posición del chofer a la calle más cercana sin saber en qué
   *  sentido va: en una avenida dividida puede engancharlo en la calzada de
   *  enfrente y devolver una ruta que arranca dando toda la vuelta. */
  rumbo?: number | null,
): Promise<{ pasos: PasoNavegacion[]; geometria: [number, number][] } | null> {
  const comunes = {
    steps: "true",
    language: "es",
    voice_instructions: "true",
    banner_instructions: "true",
    voice_units: "metric",
  };
  // El ";" final deja el DESTINO sin restricción de rumbo: solo se sabe hacia
  // dónde va el auto en el origen.
  // Mapbox rechaza la consulta entera si el ángulo se sale de 0-360, y ese
  // rechazo se pagaría con una consulta perdida más el reintento. Se normaliza
  // acá: un rumbo raro es un dato a acomodar, no un error que valga un viaje.
  const grados = rumbo == null || Number.isNaN(rumbo) ? null : ((Math.round(rumbo) % 360) + 360) % 360;
  const conRumbo =
    grados == null ? null : { ...comunes, bearings: `${grados},${TOLERANCIA_RUMBO};` };

  let ruta:
    | { geometry?: { coordinates?: [number, number][] }; legs?: { steps?: PasoCrudo[] }[] }
    | undefined;
  try {
    let res = conRumbo ? await fetch(urlDirections([origen, destino], conRumbo)) : null;
    // Si el rumbo dejó a la consulta sin ninguna calzada que cumpla (pasa con
    // un rumbo viejo, o estando dentro de un estacionamiento), se reintenta sin
    // él: mejor una ruta imperfecta que ninguna instrucción en pantalla.
    if (!res || !res.ok) res = await fetch(urlDirections([origen, destino], comunes));
    if (!res.ok) return null;
    ruta = (await res.json()).routes?.[0];
  } catch {
    // Acá sí se traga todo, token incluido: esto corre en bucle mientras el
    // chofer maneja y no puede llenar la pantalla de errores. Si falta el token,
    // el aviso ya salió al armar la ruta (ver obtenerRutaCalles).
    return null;
  }

  const pasos = ruta?.legs?.[0]?.steps;
  if (!Array.isArray(pasos)) return null;

  return {
    pasos: pasos.map((p) => ({
      instruccion: p.maneuver?.instruction ?? "",
      banner: p.bannerInstructions?.[0]?.primary?.text ?? null,
      distanciaM: Math.round(p.distance ?? 0),
      tipo: p.maneuver?.type ?? "continue",
      modificador: p.maneuver?.modifier ?? null,
      geometria: p.geometry?.coordinates ?? [],
      avisos: (p.voiceInstructions ?? [])
        .filter((a) => a.announcement)
        .map((a) => ({ texto: a.announcement!, aMetros: Math.round(a.distanceAlongGeometry ?? 0) }))
        // Del más lejano al más cercano, que es el orden en que se van diciendo.
        .sort((a, b) => b.aMetros - a.aMetros),
    })),
    geometria: ruta?.geometry?.coordinates ?? [],
  };
}
