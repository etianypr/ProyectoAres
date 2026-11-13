// Borrado de los datos de destinatarios (spec 007, Ley 21.719). El teléfono se
// queda solo con las cifras de cada día (store `dias`); los nombres, teléfonos,
// direcciones y rutas se van al cerrar el día o la sesión. La cola de eventos
// no se toca: no tiene datos de personas y sin ella el conductor no cobra.

import { hoyChile, sumarDias } from "@/lib/comun/fechas";
import { olvidarConsultasGoogle } from "@/lib/geo/geocoding/google";
import { olvidarMatriz } from "@/lib/geo/matriz";
import { STORES, STORES_DEL_DIA, clavesFotosDe, escribir, fechasDeFotos, leerTodos, leerUno } from "../idb";
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

/** Fotos y propuestas de días anteriores que ya no tienen pedidos ni ruta (spec
 *  033, G5): ningún cierre las alcanzaba y quedaban para siempre. Se borran sin
 *  mostrar nada: no son un día trabajado. Devuelve cuántas fechas limpió. */
export function borrarSueltos(hoy: string): Promise<number> {
  return enFila(async () => {
    const [rutas, pedidos, fotos, propuestas] = await Promise.all([
      leerTodos(STORES.rutas),
      leerTodosLosPedidos(),
      fechasDeFotos(),
      leerTodos(STORES.propuestas),
    ]);
    const conDatos = new Set([...rutas.map((r) => r.fecha), ...pedidos.map((p) => p.fecha)]);
    const sueltas = [...new Set([...fotos, ...propuestas.map((p) => p.fecha)])].filter((f) => f < hoy && !conDatos.has(f));
    if (sueltas.length === 0) return 0;
    const claves = (await Promise.all(sueltas.map(clavesFotosDe))).flat();
    const conPropuesta = new Set(propuestas.map((p) => p.fecha));
    await escribir([STORES.fotos, STORES.propuestas], ({ borrar }) => {
      for (const id of claves) borrar(STORES.fotos, id);
      for (const f of sueltas) if (conPropuesta.has(f)) borrar(STORES.propuestas, f);
    });
    return sueltas.length;
  });
}

/** Cuántos días de resúmenes quedan en el teléfono (spec 033, G5): «Tus días»
 *  muestra unos pocos y el panel tiene el historial. Un resumen por día, solo
 *  cifras, pero sin tope crecían para siempre. */
export const DIAS_DE_RESUMEN = 60;

/** Los resúmenes que ya sobran: más viejos que DIAS_DE_RESUMEN y sin eventos en
 *  la cola (su día todavía tiene que salir al servidor con ellos). Pura. */
export function resumenesQueSobran(fechas: string[], conCola: Set<string>, hoy: string): string[] {
  const desde = sumarDias(hoy, -DIAS_DE_RESUMEN);
  return fechas.filter((f) => f < desde && !conCola.has(f));
}

/** Escribe el resumen del día y borra sus pedidos y su ruta, todo en una
 *  transacción: o queda el resumen sin los datos, o queda todo como estaba. */
export function cerrarYBorrarDia(fecha: string): Promise<ResumenDia | null> {
  return enFila(async () => {
    const [ruta, pedidos, guardado, fotos, propuesta, dias, cola] = await Promise.all([
      leerRuta(fecha),
      leerPedidos(fecha),
      leerDiaGuardado(fecha),
      clavesFotosDe(fecha),
      leerUno(STORES.propuestas, fecha),
      leerTodos(STORES.dias),
      leerTodos(STORES.cola),
    ]);
    if (!ruta && pedidos.length === 0) {
      // Una propuesta o unas fotos sueltas no son un día trabajado: se borran sin
      // dejar resumen.
      if (propuesta || fotos.length > 0) {
        await escribir([STORES.propuestas, STORES.fotos], ({ borrar }) => {
          for (const id of fotos) borrar(STORES.fotos, id);
          if (propuesta) borrar(STORES.propuestas, fecha);
        });
      }
      return guardado;
    }

    const resumen = resumenAlBorrar(fecha, ruta, pedidos, guardado);
    const sobran = resumenesQueSobran(
      dias.map((d) => d.fecha).filter((f) => f !== fecha),
      new Set(cola.map((e) => e.fecha)),
      hoyChile(),
    );
    await escribir([STORES.dias, ...STORES_DEL_DIA], ({ guardar, borrar }) => {
      guardar(STORES.dias, resumen);
      for (const f of sobran) borrar(STORES.dias, f);
      for (const p of pedidos) borrar(STORES.pedidos, p.id);
      for (const id of fotos) borrar(STORES.fotos, id);
      if (ruta) borrar(STORES.rutas, fecha);
      if (propuesta) borrar(STORES.propuestas, fecha);
    });
    // Las distancias y las respuestas de Google guardan puntos y direcciones de
    // destinatarios (en memoria).
    olvidarMatriz();
    olvidarConsultasGoogle();
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
    olvidarMatriz();
    olvidarConsultasGoogle();
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
