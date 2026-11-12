// La distancia por calle entre dos puntos sueltos, con la red propia (spec 031):
// para las cuentas que no pueden esperar a nadie con la ruta andando (sumar un
// pedido, invertir el orden), que antes solo tenían lo que hubiera quedado en
// memoria de la matriz de ORS. Sin rumbo: de punto a punto, como esa matriz.
import type { Coordenada } from "@/lib/geo/coordenada";
import { arcoValido, redCargada, type Red } from "./grafo";
import { buscar, crearBusqueda, llegada, salidasDe, type Busqueda } from "./caminos";
import { entregaEn } from "./entrada";

const medidas = new Map<string, number | null>();
let mesa: { red: Red; busqueda: Busqueda } | null = null;

const clave = (p: Coordenada) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

/** Metros por calle de `a` a `b`, o null si la red no está cargada todavía o no
 *  hay camino. No espera a nadie: usa la red solo si ya está en memoria. */
export function metrosPorLaRed(a: Coordenada, b: Coordenada): number | null {
  const red = redCargada();
  if (!red) return null;
  const par = `${clave(a)}>${clave(b)}`;
  const sabida = medidas.get(par);
  if (sabida !== undefined) return sabida;
  if (mesa?.red !== red) mesa = { red, busqueda: crearBusqueda(red) };
  // Donde se entrega cada uno: la entrada de su condominio, si está en uno.
  const desde = entregaEn(red, a);
  const hasta = entregaEn(red, b);
  let metros: number | null = null;
  if (desde && hasta) {
    const arcos = ([0, 1] as const).filter((s) => arcoValido(red, 2 * hasta.arista + s)).map((s) => 2 * hasta.arista + s);
    buscar(mesa.busqueda, salidasDe(red, desde.arista, desde.fraccion, null), {}, arcos);
    let mejor = Infinity;
    for (const arco of arcos) {
      const l = llegada(mesa.busqueda, arco, arco & 1 ? 1 - hasta.fraccion : hasta.fraccion);
      if (l && l.peso < mejor) {
        mejor = l.peso;
        metros = l.metros;
      }
    }
  }
  medidas.set(par, metros);
  return metros;
}

/** Olvida lo medido (al cerrar el día: son puntos de destinatarios). */
export function olvidarMedidas(): void {
  medidas.clear();
}
