// Borrado de los datos de destinatarios (spec 007, Ley 21.719). El teléfono se
// queda solo con las cifras de cada día (store `dias`); los nombres, teléfonos,
// direcciones y rutas se van al cerrar el día o la sesión. La cola de eventos
// no se toca: no tiene datos de personas y sin ella el conductor no cobra.

import { STORES, STORES_DEL_DIA, clavesFotosDe, escribir, leerTodos } from "../idb";
import { enFila } from "./fila";
import { leerDiaGuardado, leerPedidos, leerRuta, leerTodosLosPedidos, pedidosEnOrden } from "./lecturas";
import { rutaAlDia } from "./migrar";
import { cifrasDelDia, sumarResumenes } from "./ruta";
import type { Pedido, ResumenDia, Ruta } from "./tipos";

/** Lo que no se entregó ese día y vuelve a Starken: primero en el orden de la
 *  ruta, después lo que quedó fuera de ella. */
export async function noEntregadosDelDia(fecha: string): Promise<Pedido[]> {
  const [ruta, pedidos] = await Promise.all([leerRuta(fecha), leerPedidos(fecha)]);
  const enRuta = pedidosEnOrden(ruta, pedidos);
  const vistos = new Set(enRuta.map((p) => p.id));
  return [...enRuta, ...pedidos.filter((p) => !vistos.has(p.id))].filter(
    (p) => p.resultado !== "entregado",
  );
}

/** Días anteriores a `hoy` que todavía tienen datos de destinatarios, del más
 *  viejo al más nuevo. Se borran al abrir la app antes de mostrar el día nuevo. */
export async function diasPorBorrar(hoy: string): Promise<string[]> {
  const [rutas, pedidos] = await Promise.all([leerTodos(STORES.rutas), leerTodosLosPedidos()]);
  const fechas = new Set([...rutas.map((r) => r.fecha), ...pedidos.map((p) => p.fecha)]);
  return [...fechas].filter((f) => f < hoy).sort();
}

/** Escribe el resumen del día y borra sus pedidos y su ruta, todo en una
 *  transacción: o queda el resumen sin los datos, o queda todo como estaba. */
export function cerrarYBorrarDia(fecha: string): Promise<ResumenDia | null> {
  return enFila(async () => {
    const [ruta, pedidos, guardado, fotos] = await Promise.all([
      leerRuta(fecha),
      leerPedidos(fecha),
      leerDiaGuardado(fecha),
      clavesFotosDe(fecha),
    ]);
    if (!ruta && pedidos.length === 0 && fotos.length === 0) return guardado;

    const resumen = resumenAlBorrar(fecha, ruta, pedidos, guardado);
    await escribir([STORES.dias, ...STORES_DEL_DIA], ({ guardar, borrar }) => {
      guardar(STORES.dias, resumen);
      for (const p of pedidos) borrar(STORES.pedidos, p.id);
      for (const id of fotos) borrar(STORES.fotos, id);
      if (ruta) borrar(STORES.rutas, fecha);
    });
    return resumen;
  });
}

/** Al cerrar sesión o perder el acceso: resume cada día que quede y vacía los
 *  stores con datos de destinatarios. Conserva `cola` y `dias`. */
export function borrarDatosDestinatarios(): Promise<void> {
  return enFila(async () => {
    const [rutas, pedidos, guardados] = await Promise.all([
      leerTodos(STORES.rutas).then((r) => r.map(rutaAlDia)),
      leerTodosLosPedidos(),
      leerTodos(STORES.dias),
    ]);
    const fechas = [...new Set([...rutas.map((r) => r.fecha), ...pedidos.map((p) => p.fecha)])];
    const resumenes = fechas.map((f) =>
      resumenAlBorrar(
        f,
        rutas.find((r) => r.fecha === f) ?? null,
        pedidos.filter((p) => p.fecha === f),
        guardados.find((d) => d.fecha === f) ?? null,
      ),
    );
    await escribir([STORES.dias, ...STORES_DEL_DIA], ({ guardar, vaciar }) => {
      for (const r of resumenes) guardar(STORES.dias, r);
      for (const store of STORES_DEL_DIA) vaciar(store);
    });
  });
}

/** El resumen que queda: el día se da por cerrado (lo pendiente cuenta como no
 *  entregado) y se suma al de un borrado anterior de la misma fecha. */
function resumenAlBorrar(
  fecha: string,
  ruta: Ruta | null,
  pedidos: Pedido[],
  guardado: ResumenDia | null,
): ResumenDia {
  const ultimaHora = pedidos
    .flatMap((p) => [p.horaResultado, p.horaLlamada])
    .filter((h): h is string => h != null)
    .sort()
    .at(-1);
  const cierre = ruta?.cierre ?? ultimaHora ?? new Date().toISOString();
  const cifras = cifrasDelDia(fecha, ruta ? { ...ruta, cierre } : null, pedidos);
  const cerrado = { ...cifras, noEntregadas: cifras.asignados - cifras.entregadas, cierre };
  return guardado ? sumarResumenes(guardado, cerrado) : cerrado;
}
