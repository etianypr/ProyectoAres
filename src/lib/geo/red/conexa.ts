// La parte conexa de la red: dónde se puede llegar y desde dónde se puede salir
// (terreno 2026-11-23). La red trae calles a las que se entra y de las que no se
// sale con las reglas de giro: 257 aristas detrás de una calle de un sentido en el
// borde norte de la descarga, islas de huellas al sur y unas pocas trampas en la
// ciudad (una calle de servicio que termina en una de un sentido en contra, una de
// un sentido que muere en una barrera). Una parada pegada a una de ellas no tenía
// camino: la línea entera la dibujaba ORS, que da la vuelta en cada parada, y la
// parada quedaba puesta a ciegas en el orden.
//
// Se mide sobre ARCOS (con rumbo) y con las mismas reglas de `giro`: por cruces,
// una calle de servicio que termina en una de un sentido en contra parecería
// conectada. La parte conexa es la componente fuerte más grande. Pura.
import { arcoValido, cabeza, nArcos, type Red } from "./grafo";
import { giro } from "./caminos";

const conexas = new WeakMap<Red, Uint8Array>();

/** Por arco: 1 si está en la componente fuerte más grande (Tarjan, sin recursión). */
function arcosConexos(red: Red): Uint8Array {
  const listo = conexas.get(red);
  if (listo) return listo;
  const total = nArcos(red);
  const indice = new Int32Array(total).fill(-1);
  const bajo = new Int32Array(total);
  const enPila = new Uint8Array(total);
  const componente = new Int32Array(total).fill(-1);
  /** Por dónde va la revisión de las salidas de cada arco (índice en `red.salen`). */
  const siguiente = new Int32Array(total);
  const pila: number[] = [];
  const llamadas: number[] = [];
  const tamanos: number[] = [];
  let contador = 0;
  const abrir = (a: number) => {
    indice[a] = bajo[a] = contador++;
    siguiente[a] = red.salenInicio[cabeza(red, a)];
    pila.push(a);
    enPila[a] = 1;
    llamadas.push(a);
  };

  for (let raiz = 0; raiz < total; raiz++) {
    if (!arcoValido(red, raiz) || indice[raiz] >= 0) continue;
    abrir(raiz);
    while (llamadas.length > 0) {
      const a = llamadas[llamadas.length - 1];
      const fin = red.salenInicio[cabeza(red, a) + 1];
      let abrioHijo = false;
      while (siguiente[a] < fin) {
        const s = red.salen[siguiente[a]++];
        if (giro(red, a, s, {}) < 0) continue;
        if (indice[s] < 0) {
          abrir(s);
          abrioHijo = true;
          break;
        }
        if (enPila[s]) bajo[a] = Math.min(bajo[a], indice[s]);
      }
      if (abrioHijo) continue;
      // Todas sus salidas revisadas: si es la raíz de una componente, se saca entera.
      llamadas.pop();
      if (bajo[a] === indice[a]) {
        const c = tamanos.length;
        let tam = 0;
        for (;;) {
          const x = pila.pop()!;
          enPila[x] = 0;
          componente[x] = c;
          tam++;
          if (x === a) break;
        }
        tamanos.push(tam);
      }
      const padre = llamadas[llamadas.length - 1];
      if (padre !== undefined) bajo[padre] = Math.min(bajo[padre], bajo[a]);
    }
  }

  let mayor = 0;
  for (let c = 1; c < tamanos.length; c++) if (tamanos[c] > tamanos[mayor]) mayor = c;
  const conexo = new Uint8Array(total);
  for (let a = 0; a < total; a++) if (componente[a] === mayor && tamanos.length > 0) conexo[a] = 1;
  conexas.set(red, conexo);
  return conexo;
}

/** ¿Se puede llegar a este arco y seguir desde él a todo el resto de la red? */
export const arcoConexo = (red: Red, arco: number): boolean => arcosConexos(red)[arco] === 1;

/** ¿Alguno de los sentidos de la arista está en la parte conexa? Ahí se puede parar. */
export function aristaConexa(red: Red, arista: number): boolean {
  const conexo = arcosConexos(red);
  return conexo[2 * arista] === 1 || conexo[2 * arista + 1] === 1;
}

/** Los sentidos en que se puede pasar por un punto de la arista (0 hacia `hasta`,
 *  1 hacia `desde`): los de la parte conexa. En 10 aristas de Arica uno de los dos
 *  entra a una trampa. Si ninguno está (un lugar pegado a mano, en pruebas), los
 *  que permite la calle. */
export function sentidosDePaso(red: Red, arista: number): (0 | 1)[] {
  const validos = ([0, 1] as const).filter((s) => arcoValido(red, 2 * arista + s));
  const conexos = validos.filter((s) => arcoConexo(red, 2 * arista + s));
  return conexos.length > 0 ? conexos : validos;
}
