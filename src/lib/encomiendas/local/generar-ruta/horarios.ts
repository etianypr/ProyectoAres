// "Respeta horarios" (spec 017, R2): el optimizador con horarios sobre la matriz
// del día. Parte de la más corta y de la de meter los bloques de a uno (la de
// antes), y se queda con lo mejor que encuentre: nunca sale peor que la de antes.

import { bloquePorId } from "@/lib/encomiendas/config";
import type { Ventana } from "@/lib/rutas/orden-paradas/con-horarios";
import { optimizarSinCongelar } from "@/lib/rutas/orden-paradas/sin-congelar";
import { KMH_CIUDAD, MIN_POR_PARADA, type MetrosEntre } from "../planificar";
import type { VueltaABase } from "./estrategias";
import type { PedidoUbicado } from "./tipos";

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** El bloque del pedido en minutos del día. Uno que ya cerró no se persigue: el
 *  optimizador lo pondría primero para llegar "menos tarde", y lo que hay que
 *  hacer es llamarlo (la propuesta lo avisa). */
function ventanaVigente(p: PedidoUbicado, minutosDeInicio: number): Ventana | null {
  const b = bloquePorId(p.bloqueHorarioId);
  if (!b) return null;
  const v = { abre: minutos(b.desde), cierra: minutos(b.hasta) };
  return v.cierra <= minutosDeInicio ? null : v;
}

export async function ordenConHorarios(
  ubicados: PedidoUbicado[],
  arranques: PedidoUbicado[][],
  indiceEnMatriz: Map<string, number>,
  metros: MetrosEntre,
  minutosDeInicio: number,
  vuelta: VueltaABase,
): Promise<PedidoUbicado[]> {
  const ventanas: (Ventana | null)[] = [null];
  const porIndice: PedidoUbicado[] = [];
  for (const p of ubicados) {
    const i = indiceEnMatriz.get(p.id);
    if (i == null) return arranques[0];
    porIndice[i] = p;
    ventanas[i] = ventanaVigente(p, minutosDeInicio);
  }
  // Sin ningún bloque por cumplir, la más corta ya es la respuesta.
  if (!ventanas.some(Boolean)) return arranques[0];

  const n = ubicados.length + 1;
  const tabla = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 1; j < n; j++) {
      if (i !== j) tabla[i * n + j] = metros(i === 0 ? null : porIndice[i], porIndice[j]);
    }
  }

  // Metros de volver a la base desde cada punto: la ruta es cerrada.
  const metrosVuelta = new Float64Array(n);
  for (let i = 1; i < n; i++) metrosVuelta[i] = vuelta(porIndice[i]);

  const aIndices = (orden: PedidoUbicado[]) => [0, ...orden.map((p) => indiceEnMatriz.get(p.id) ?? 0)];
  const orden = await optimizarSinCongelar(arranques.map(aIndices), {
    metros: tabla,
    n,
    ventanas,
    inicio: minutosDeInicio,
    kmh: KMH_CIUDAD,
    servicio: MIN_POR_PARADA,
    vuelta: metrosVuelta,
  });
  const salida = orden.slice(1).map((i) => porIndice[i]);
  return salida.length === ubicados.length && salida.every(Boolean) ? salida : arranques[0];
}
