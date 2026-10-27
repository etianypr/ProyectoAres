// Orden de paradas CON horarios (spec 017, R2).
//
// "Respeta horarios" metía los pedidos con bloque de a uno en la ruta más corta.
// Medido sobre días reales salía 20–120 % más larga que la corta y aun así
// dejaba gente fuera de su bloque: cada inserción miraba solo su pedido, y nadie
// volvía a acomodar lo ya puesto. Esto mira la ruta ENTERA con un solo número:
//
//   costo = metros
//         + PESO_FUERA  × minutos fuera de un bloque
//         + PESO_ESPERA × minutos esperando a que abra
//         + PESO_TARDE  × minutos de parada pasadas las 18:00
//
// y la mejora con las jugadas del optimizador de distancia (mover una parada,
// mover un grupo, dar vuelta un tramo), más sacudidas.
//
// El reloj es el MISMO de planificar.ts (velocidad urbana, minutos por parada, y
// llegar antes de que abra solo se espera al final de la ruta), para que lo que
// se optimiza acá sea exactamente lo que después se mide y se avisa.
//
// Rápido (spec 017, R5): los metros de una jugada se calculan sin recorrer la
// ruta, y como los castigos nunca restan, una jugada que ya suma más metros que
// el costo actual se descarta sin simular el día. Determinista: cuántas vueltas
// da depende del tamaño del día y no del reloj, así que el mismo día da la misma
// ruta en cualquier teléfono.

import { EPSILON } from "./costo";

/** Un minuto fuera del bloque vale como 2 km de camino: llegar fuera de horario
 *  es un viaje perdido, y eso pesa más que dar una vuelta. */
export const PESO_FUERA = 2000;
/** Un minuto esperando a que abra vale 50 m. */
export const PESO_ESPERA = 50;
/** Un minuto de parada pasadas las 18:00 vale 5 km: el día se termina. */
export const PESO_TARDE = 5000;
const FIN_DEL_DIA = 18 * 60;

export type Ventana = { abre: number; cierra: number };

export type DiaConHorarios = {
  /** metros[i * n + j] por calle; el 0 es la partida. */
  metros: ArrayLike<number>;
  n: number;
  /** Bloque de cada punto en minutos del día, o null. */
  ventanas: (Ventana | null)[];
  /** Minuto del día en que se sale. */
  inicio: number;
  kmh: number;
  /** Minutos que se queda en cada parada. */
  servicio: number;
};

export type Evaluacion = { costo: number; metros: number; fuera: number; espera: number; tarde: number };

/** Mide un orden (que empieza en 0) con el reloj de planificar.ts. */
export function evaluar(orden: number[], dia: DiaConHorarios): Evaluacion {
  const { metros: m, n, ventanas } = dia;
  const minutosPorMetro = 60 / (dia.kmh * 1000);
  let ultimoSinBloque = -1;
  for (let k = orden.length - 1; k >= 1; k--) {
    if (!ventanas[orden[k]]) {
      ultimoSinBloque = k;
      break;
    }
  }
  let t = dia.inicio;
  let metros = 0;
  let fuera = 0;
  let espera = 0;
  let tarde = 0;
  for (let k = 1; k < orden.length; k++) {
    const tramo = m[orden[k - 1] * n + orden[k]];
    metros += tramo;
    t += tramo * minutosPorMetro;
    const v = ventanas[orden[k]];
    if (v) {
      if (t < v.abre) {
        // Detrás de esta solo quedan paradas con bloque: se espera a que abra.
        // Si no, llegar antes es una visita perdida (ver planificar.simular).
        if (k > ultimoSinBloque) {
          espera += v.abre - t;
          t = v.abre;
        } else {
          fuera += v.abre - t;
        }
      } else if (t > v.cierra) {
        fuera += t - v.cierra;
      }
    }
    if (t > FIN_DEL_DIA) tarde += t - FIN_DEL_DIA;
    t += dia.servicio;
  }
  return {
    costo: metros + PESO_FUERA * fuera + PESO_ESPERA * espera + PESO_TARDE * tarde,
    metros,
    fuera,
    espera,
    tarde,
  };
}

/** Lo que la búsqueda necesita en arreglos planos: el bucle caliente no arma
 *  objetos. */
type Rapido = {
  n: number;
  m: ArrayLike<number>;
  abre: Float64Array;
  cierra: Float64Array;
  conBloque: Uint8Array;
  minutosPorMetro: number;
  servicio: number;
  inicio: number;
};

function rapido(dia: DiaConHorarios): Rapido {
  const { n, ventanas } = dia;
  const abre = new Float64Array(n);
  const cierra = new Float64Array(n);
  const conBloque = new Uint8Array(n);
  ventanas.forEach((v, i) => {
    if (v) {
      abre[i] = v.abre;
      cierra[i] = v.cierra;
      conBloque[i] = 1;
    }
  });
  return {
    n,
    m: dia.metros,
    abre,
    cierra,
    conBloque,
    minutosPorMetro: 60 / (dia.kmh * 1000),
    servicio: dia.servicio,
    inicio: dia.inicio,
  };
}

/** El costo de `orden`, o Infinity apenas se sabe que no baja de `limite`.
 *  `metrosTotal` son los metros del orden completo, ya sabidos: lo que vaya
 *  sumando castigo solo puede subir desde ahí. */
function costoAcotado(r: Rapido, orden: Int32Array, limite: number, metrosTotal: number): number {
  const largo = orden.length;
  let ultimoSinBloque = -1;
  for (let k = largo - 1; k >= 1; k--) {
    if (!r.conBloque[orden[k]]) {
      ultimoSinBloque = k;
      break;
    }
  }
  let t = r.inicio;
  let castigo = 0;
  for (let k = 1; k < largo; k++) {
    const p = orden[k];
    t += r.m[orden[k - 1] * r.n + p] * r.minutosPorMetro;
    if (r.conBloque[p]) {
      if (t < r.abre[p]) {
        if (k > ultimoSinBloque) {
          castigo += PESO_ESPERA * (r.abre[p] - t);
          t = r.abre[p];
        } else {
          castigo += PESO_FUERA * (r.abre[p] - t);
        }
      } else if (t > r.cierra[p]) {
        castigo += PESO_FUERA * (t - r.cierra[p]);
      }
    }
    if (t > FIN_DEL_DIA) castigo += PESO_TARDE * (t - FIN_DEL_DIA);
    t += r.servicio;
    if (metrosTotal + castigo >= limite) return Infinity;
  }
  return metrosTotal + castigo;
}

function metrosDe(r: Rapido, orden: Int32Array): number {
  let total = 0;
  for (let k = 1; k < orden.length; k++) total += r.m[orden[k - 1] * r.n + orden[k]];
  return total;
}

/** Mejora local con primera mejora: mover un grupo de 1, 2 o 3 paradas (sin
 *  darlo vuelta) y dar vuelta un tramo, hasta que ninguna jugada mejore. Cede
 *  (yield) después de cada jugada aceptada, para poder repartir el trabajo sin
 *  congelar la pantalla (ver sin-congelar.ts). */
function* mejorar(r: Rapido, inicial: number[]): Generator<void, { orden: number[]; costo: number }> {
  const n = inicial.length;
  let orden = Int32Array.from(inicial);
  let prueba = new Int32Array(n);
  let metros = metrosDe(r, orden);
  let costo = costoAcotado(r, orden, Infinity, metros);
  const d = (a: number, b: number) => r.m[a * r.n + b];

  const aceptar = (c: number, m: number) => {
    [orden, prueba] = [prueba, orden];
    costo = c;
    metros = m;
  };

  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    yield;

    // Mover el grupo orden[i .. i+largo-1] entre a y b del resto.
    for (let largo = 1; largo <= 3 && !mejoro; largo++) {
      for (let i = 1; i + largo <= n && !mejoro; i++) {
        const fin = i + largo - 1;
        const antes = orden[i - 1];
        const despues = fin + 1 < n ? orden[fin + 1] : -1;
        const primero = orden[i];
        const ultimo = orden[fin];
        // Metros sin el grupo, con el hueco cerrado.
        const sinGrupo =
          metros - d(antes, primero) - (despues >= 0 ? d(ultimo, despues) - d(antes, despues) : 0);
        // Posiciones del resto: x < i es orden[x]; x >= i es orden[x + largo].
        const largoResto = n - largo;
        for (let j = 1; j <= largoResto; j++) {
          if (j === i) continue;
          const a = j - 1 < i ? orden[j - 1] : orden[j - 1 + largo];
          const b = j < largoResto ? (j < i ? orden[j] : orden[j + largo]) : -1;
          const nuevos = sinGrupo - (b >= 0 ? d(a, b) : 0) + d(a, primero) + (b >= 0 ? d(ultimo, b) : 0);
          if (nuevos >= costo - EPSILON) continue;
          // Se arma la prueba: resto[0..j-1], grupo, resto[j..].
          let k = 0;
          for (let x = 0; x < j; x++) prueba[k++] = x < i ? orden[x] : orden[x + largo];
          for (let x = i; x <= fin; x++) prueba[k++] = orden[x];
          for (let x = j; x < largoResto; x++) prueba[k++] = x < i ? orden[x] : orden[x + largo];
          const c = costoAcotado(r, prueba, costo - EPSILON, nuevos);
          if (c < costo - EPSILON) {
            aceptar(c, nuevos);
            mejoro = true;
            break;
          }
        }
      }
    }

    // Dar vuelta orden[i .. j]. Los costos son asimétricos: se lleva la suma del
    // tramo en los dos sentidos.
    for (let i = 1; i < n - 1 && !mejoro; i++) {
      let ida = 0;
      let vuelta = 0;
      for (let j = i + 1; j < n; j++) {
        ida += d(orden[j - 1], orden[j]);
        vuelta += d(orden[j], orden[j - 1]);
        const antes = orden[i - 1];
        const despues = j + 1 < n ? orden[j + 1] : -1;
        const nuevos =
          metros -
          d(antes, orden[i]) -
          ida -
          (despues >= 0 ? d(orden[j], despues) : 0) +
          d(antes, orden[j]) +
          vuelta +
          (despues >= 0 ? d(orden[i], despues) : 0);
        if (nuevos >= costo - EPSILON) continue;
        prueba.set(orden);
        for (let a = i, b = j; a <= j; a++, b--) prueba[a] = orden[b];
        const c = costoAcotado(r, prueba, costo - EPSILON, nuevos);
        if (c < costo - EPSILON) {
          aceptar(c, nuevos);
          mejoro = true;
          break;
        }
      }
    }
  }
  return { orden: Array.from(orden), costo };
}

function alAzar(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Saca dos o tres paradas y las vuelve a meter al azar: con horarios, la
 *  sacudida que sirve es la que cambia QUIÉN va antes. */
function sacudir(orden: number[], azar: () => number): number[] {
  const salida = [...orden];
  const n = salida.length;
  if (n < 4) return salida;
  const veces = 2 + Math.floor(azar() * 2);
  for (let v = 0; v < veces; v++) {
    const [p] = salida.splice(1 + Math.floor(azar() * (n - 1)), 1);
    salida.splice(1 + Math.floor(azar() * (n - 1)), 0, p);
  }
  return salida;
}

/** Sacudidas según el tamaño: el trabajo total queda parejo en vez de
 *  dispararse en los días grandes. */
function sacudidasPara(n: number): number {
  return Math.max(15, Math.min(100, Math.round(60_000 / (n * n))));
}

/**
 * La búsqueda, por partes: cede entre jugada y jugada. Devuelve el mejor orden
 * que encuentra partiendo de los `arranques` (cada uno empieza en 0 y tiene los
 * n puntos); nunca algo peor que el mejor arranque.
 */
export function* buscarConHorarios(arranques: number[][], dia: DiaConHorarios): Generator<void, number[]> {
  type Resultado = { orden: number[]; costo: number };
  const r = rapido(dia);
  let primero: Resultado | null = null;
  for (const arranque of arranques) {
    const intento: Resultado = yield* mejorar(r, arranque);
    if (!primero || intento.costo < primero.costo - EPSILON) primero = intento;
  }
  if (!primero) return [];

  let mejor: Resultado = primero;
  const azar = alAzar(Math.round(mejor.costo) * 31 + mejor.orden.length);
  const sacudidas = sacudidasPara(mejor.orden.length);
  for (let s = 0; s < sacudidas; s++) {
    const intento: Resultado = yield* mejorar(r, sacudir(mejor.orden, azar));
    if (intento.costo < mejor.costo - EPSILON) mejor = intento;
  }
  return mejor.orden;
}

/** La búsqueda de una vez (pruebas y quien no tenga pantalla que cuidar). */
export function optimizarConHorarios(arranques: number[][], dia: DiaConHorarios): number[] {
  const busqueda = buscarConHorarios(arranques, dia);
  let paso = busqueda.next();
  while (!paso.done) paso = busqueda.next();
  return paso.value;
}
