import { resultadoCerrado } from "@/lib/encomiendas/estados";
import type { Trazado } from "@/lib/geo/coordenada";
import { STORES, escribir, leerTodos } from "../idb";
import { enFila } from "./fila";
import { leerPedidos, leerRuta, leerTodosLosPedidos, pedidosEnOrden } from "./lecturas";
import { rutaAlDia } from "./migrar";
import type { Pedido, Ruta } from "./tipos";

/** Un día ya trabajado, resumido en las tres cifras que se leen de un vistazo.
 *
 *  Es lo que llena la lista de días del menú lateral. Solo cifras: los pedidos
 *  de un día pasado —nombres, teléfonos, direcciones— no hacen falta para
 *  decir cómo salió, y no tenerlos a mano es también no poder mostrarlos por
 *  error en una pantalla que se abre con el teléfono desbloqueado. */
export type ResumenDia = {
  fecha: string;
  paradas: number;
  entregadas: number;
  noEntregadas: number;
  /** null = ese día quedó abierto. Pasa cuando el chofer cerró la app sin
   *  marcar la última parada, y es justamente lo que hay que poder ver. */
  cierre: string | null;
};

/** Los días que este teléfono tiene guardados, del más nuevo al más viejo.
 *
 *  Un día es una ruta armada: sin ruta no hubo día que resumir. Las cifras
 *  salen de los pedidos de esa ruta. */
export async function leerDias(): Promise<ResumenDia[]> {
  const [rutas, pedidos] = await Promise.all([leerTodos(STORES.rutas), leerTodosLosPedidos()]);
  return rutas
    .map(rutaAlDia)
    .map((ruta) => resumirDia(ruta, pedidos))
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

/** Las cifras de un día a partir de su ruta y sus pedidos. */
export function resumirDia(ruta: Ruta, pedidos: Pedido[]): ResumenDia {
  const enRuta = pedidosEnOrden(ruta, pedidos);
  return {
    fecha: ruta.fecha,
    paradas: enRuta.length,
    entregadas: enRuta.filter((p) => p.resultado === "entregado").length,
    noEntregadas: enRuta.filter((p) => p.resultado === "no_entregado").length,
    cierre: ruta.cierre,
  };
}

export type EntradaRuta = {
  fecha: string;
  /** Ids de pedido en orden de visita, tal como los calculó el ordenamiento. */
  pedidoIdsEnOrden: string[];
  trazado: Trazado | null;
  distanciaM: number | null;
  duracionS: number | null;
  /** Lo que quedó fuera o dudoso. Ver Ruta.advertencias. */
  advertencias?: string[];
  /** Entre 1 y 3. Ver Ruta.propuestasComparadas. */
  propuestasComparadas?: number;
};

// Guarda la ruta del día conservando SIEMPRE el orden de lo que ya se cerró:
// los pedidos entregados u omitidos quedan primero, en su orden original, y
// detrás va el orden nuevo con lo que falta. La llamada y el resultado viven en
// cada pedido, así que rehacer la ruta no los toca.
export function guardarRuta(entrada: EntradaRuta): Promise<Ruta> {
  return enFila(async () => {
    const [anterior, pedidos] = await Promise.all([
      leerRuta(entrada.fecha),
      leerPedidos(entrada.fecha),
    ]);
    const cerrados = pedidosEnOrden(anterior, pedidos)
      .filter((p) => resultadoCerrado(p.resultado))
      .map((p) => p.id);
    const yaCerrado = new Set(cerrados);

    const ruta: Ruta = {
      fecha: entrada.fecha,
      orden: [...cerrados, ...entrada.pedidoIdsEnOrden.filter((id) => !yaCerrado.has(id))],
      // Si el servicio de rutas no respondió, conservar el trazado anterior le
      // sirve más al chofer que un mapa en blanco (mismo criterio que hoy tiene
      // generarRuta en el servidor).
      trazado: entrada.trazado ?? anterior?.trazado ?? null,
      distanciaM: entrada.distanciaM ?? anterior?.distanciaM ?? null,
      duracionS: entrada.duracionS ?? anterior?.duracionS ?? null,
      // La primera generación del día manda: es el comienzo del día. Si
      // se pisara en cada rehacer, agregar un pedido a media tarde diría que el
      // conductor empezó a esa hora.
      inicio: anterior?.inicio ?? new Date().toISOString(),
      // Rehacer la ruta REABRE el día: si entraron paradas nuevas, el día
      // no estaba terminada. El servidor la vuelve a valorar cuando se cierre
      // otra vez (0032).
      cierre: null,
      // Las advertencias son de ESTE cálculo y reemplazan a las anteriores: una
      // dirección que el chofer ya corrigió no puede seguir avisando.
      advertencias: entrada.advertencias ?? [],
      propuestasComparadas: entrada.propuestasComparadas ?? 1,
    };

    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, ruta));
    return ruta;
  });
}

/** Marca la ruta del día como terminada. Es lo que le dice al servidor que ya
 *  puede valorar el día (0032).
 *
 *  Idempotente: si ya estaba cerrada no mueve la hora. Volver a cerrar por un
 *  reintento no puede correr el fin del día. */
export function cerrarDia(fecha: string): Promise<Ruta | null> {
  return enFila(async () => {
    const ruta = await leerRuta(fecha);
    if (!ruta || ruta.cierre) return ruta;

    const cerrada: Ruta = { ...ruta, cierre: new Date().toISOString() };
    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, cerrada));
    return cerrada;
  });
}

/** Reordena lo que falta visitar, sin tocar lo cerrado: lo cerrado queda
 *  primero, en su orden, y detrás los pendientes en el orden dado. Un pendiente
 *  que la lista no nombra —llegó entre leer y escribir— va al final, y uno que se
 *  cerró en el medio pasa con los cerrados. Devuelve la ruta guardada. */
export function ordenarRuta(fecha: string, pendientesEnOrden: string[]): Promise<Ruta | null> {
  return enFila(async () => {
    const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
    if (!ruta) return null;

    const enRuta = pedidosEnOrden(ruta, pedidos);
    const cerrados = enRuta.filter((p) => resultadoCerrado(p.resultado)).map((p) => p.id);
    const pendientes = new Set(enRuta.filter((p) => !resultadoCerrado(p.resultado)).map((p) => p.id));
    const pedidosPorOrden = pendientesEnOrden.filter((id) => pendientes.has(id));
    const nombrados = new Set(pedidosPorOrden);
    const resto = [...pendientes].filter((id) => !nombrados.has(id));

    const actualizada: Ruta = { ...ruta, orden: [...cerrados, ...pedidosPorOrden, ...resto] };
    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, actualizada));
    return actualizada;
  });
}

/** Cambia el trazado guardado, sin tocar el orden. Lo usa la ruta en curso al
 *  reordenarse: sin señal no se llama y queda el trazado anterior. */
export function fijarTrazado(
  fecha: string,
  calles: { trazado: Trazado; distanciaM: number; duracionS: number },
): Promise<void> {
  return enFila(async () => {
    const ruta = await leerRuta(fecha);
    if (!ruta) return;
    await escribir([STORES.rutas], ({ guardar }) => guardar(STORES.rutas, { ...ruta, ...calles }));
  });
}

/** Si no queda ningún pedido de la ruta por cerrar. Sin pedidos da false: una
 *  ruta vacía no es una ruta terminada. */
export function rutaTerminada(ruta: Ruta | null, pedidos: Pedido[]): boolean {
  const enRuta = pedidosEnOrden(ruta, pedidos);
  return enRuta.length > 0 && enRuta.every((p) => resultadoCerrado(p.resultado));
}
