import { resultadoCerrado } from "@/lib/encomiendas/estados";
import type { Trazado } from "@/lib/geo/coordenada";
import { STORES, escribir, leerTodos } from "../idb";
import { enFila } from "./fila";
import { leerDiaGuardado, leerPedidos, leerRuta, leerTodosLosPedidos, pedidosEnOrden } from "./lecturas";
import { diaAlDia, rutaAlDia } from "./migrar";
import type { Pedido, ResumenDia, Ruta } from "./tipos";

/** Los días de este teléfono, del más nuevo al más viejo: los ya borrados
 *  (store `dias`, spec 007) y los que todavía tienen su ruta.
 *
 *  Solo cifras: los pedidos de un día pasado —nombres, teléfonos, direcciones—
 *  no hacen falta para decir cómo salió. Un día con ruta es un día; sin ruta y
 *  sin resumen guardado no hubo día que resumir. */
export async function leerDias(): Promise<ResumenDia[]> {
  const [guardados, rutas, pedidos] = await Promise.all([
    leerTodos(STORES.dias),
    leerTodos(STORES.rutas),
    leerTodosLosPedidos(),
  ]);
  const porFecha = new Map(guardados.map((d) => [d.fecha, diaAlDia(d)] as const));
  for (const ruta of rutas.map(rutaAlDia)) {
    const vivo = resumirDia(ruta, pedidos);
    const guardado = porFecha.get(ruta.fecha);
    porFecha.set(ruta.fecha, guardado ? sumarResumenes(guardado, vivo) : vivo);
  }
  return [...porFecha.values()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
}

/** El resumen de un día: el guardado, el de su ruta, o los dos sumados. */
export async function leerResumenDia(fecha: string): Promise<ResumenDia | null> {
  const [guardado, ruta, pedidos] = await Promise.all([
    leerDiaGuardado(fecha),
    leerRuta(fecha),
    leerPedidos(fecha),
  ]);
  const vivo = ruta ? resumirDia(ruta, pedidos) : null;
  if (guardado && vivo) return sumarResumenes(guardado, vivo);
  return vivo ?? guardado;
}

/** Las cifras de un día a partir de su ruta y sus pedidos. */
export function resumirDia(ruta: Ruta, pedidos: Pedido[]): ResumenDia {
  return cifrasDelDia(ruta.fecha, ruta, pedidos);
}

/** Cifras de una fecha. `pedidos` puede traer otros días: se filtran. */
export function cifrasDelDia(fecha: string, ruta: Ruta | null, pedidos: Pedido[]): ResumenDia {
  const delDia = pedidos.filter((p) => p.fecha === fecha);
  const entregadas = delDia.filter((p) => p.resultado === "entregado").length;
  const cerrado = ruta?.cierre != null;
  // Cobros: un POR PAGAR sin monto leído suma 0, nunca se supone (spec 005 FR-015).
  const porPagar = delDia.filter((p) => p.porPagar === true);
  const monto = (ps: Pedido[]) => ps.reduce((suma, p) => suma + (p.montoPorPagar ?? 0), 0);
  const porOrigen: ResumenDia["porOrigen"] = {};
  for (const p of delDia) porOrigen[p.origenCarga] = (porOrigen[p.origenCarga] ?? 0) + 1;
  return {
    fecha,
    asignados: delDia.length,
    paradas: pedidosEnOrden(ruta, delDia).length,
    entregadas,
    // Con el día abierto, lo pendiente todavía puede entregarse; cerrado, vuelve.
    noEntregadas: cerrado
      ? delDia.length - entregadas
      : delDia.filter((p) => p.resultado === "no_entregado").length,
    contactados: delDia.filter((p) => p.llamada === "contesto" || p.aviso.estado === "respondido").length,
    porPagar: porPagar.length,
    aCobrar: monto(porPagar),
    cobrado: monto(porPagar.filter((p) => p.resultado === "entregado")),
    porOrigen,
    inicio: ruta?.inicio ?? null,
    cierre: ruta?.cierre ?? null,
  };
}

function sumarConteos(a: ResumenDia["porOrigen"], b: ResumenDia["porOrigen"]): ResumenDia["porOrigen"] {
  const suma = { ...a };
  for (const [origen, n] of Object.entries(b) as [keyof typeof b, number][]) suma[origen] = (suma[origen] ?? 0) + n;
  return suma;
}

/** Un día que se borró y después se volvió a abrir (entró un pedido tarde): las
 *  cifras se suman, el inicio es el primero y el estado es el de ahora. */
export function sumarResumenes(antes: ResumenDia, ahora: ResumenDia): ResumenDia {
  return {
    fecha: antes.fecha,
    asignados: antes.asignados + ahora.asignados,
    paradas: antes.paradas + ahora.paradas,
    entregadas: antes.entregadas + ahora.entregadas,
    noEntregadas: antes.noEntregadas + ahora.noEntregadas,
    contactados: antes.contactados == null || ahora.contactados == null ? null : antes.contactados + ahora.contactados,
    porPagar: antes.porPagar + ahora.porPagar,
    aCobrar: antes.aCobrar + ahora.aCobrar,
    cobrado: antes.cobrado + ahora.cobrado,
    porOrigen: sumarConteos(antes.porOrigen, ahora.porOrigen),
    inicio: antes.inicio ?? ahora.inicio,
    cierre: ahora.cierre,
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
    const [anterior, pedidos, borrado] = await Promise.all([
      leerRuta(entrada.fecha),
      leerPedidos(entrada.fecha),
      leerDiaGuardado(entrada.fecha),
    ]);
    const cerrados = pedidosEnOrden(anterior, pedidos)
      .filter((p) => resultadoCerrado(p.resultado))
      .map((p) => p.id);
    const yaCerrado = new Set(cerrados);

    const ruta: Ruta = {
      fecha: entrada.fecha,
      orden: [...cerrados, ...entrada.pedidoIdsEnOrden.filter((id) => !yaCerrado.has(id))],
      // Si el servicio de rutas no respondió, conservar el trazado anterior le
      // sirve más al conductor que un mapa en blanco (mismo criterio que hoy tiene
      // generarRuta en el servidor).
      trazado: entrada.trazado ?? anterior?.trazado ?? null,
      distanciaM: entrada.distanciaM ?? anterior?.distanciaM ?? null,
      duracionS: entrada.duracionS ?? anterior?.duracionS ?? null,
      // La primera generación del día manda: es el comienzo del día. Si
      // se pisara en cada rehacer, agregar un pedido a media tarde diría que el
      // conductor empezó a esa hora.
      // Un día ya borrado que se reabre conserva su inicio (spec 007).
      inicio: anterior?.inicio ?? borrado?.inicio ?? new Date().toISOString(),
      // Rehacer la ruta REABRE el día: si entraron paradas nuevas, el día
      // no estaba terminada. El servidor la vuelve a valorar cuando se cierre
      // otra vez (0032).
      cierre: null,
      // Las advertencias son de ESTE cálculo y reemplazan a las anteriores: una
      // dirección que el conductor ya corrigió no puede seguir avisando.
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
