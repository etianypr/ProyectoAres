// Volver a ubicar, antes de armar la ruta, los pedidos que quedaron sin punto.

import { desde } from "@/lib/comun/cronometro";
import { hastaAbortar } from "@/lib/comun/hasta-abortar";
import { elegirConLaRuta, ubicarDireccion, type ResultadoUbicacion } from "@/lib/geo/geocoding";
import { puntoDeAcceso, type Acceso } from "@/lib/geo/acceso";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { lugarProvisorio, type ProblemaGuardado } from "@/lib/encomiendas/problemas";
import { fijarCoordenadas, ubicarConDuda, type Pedido } from "../almacen";
import { FALLOS_PARA_PARAR } from "../ubicar-carga";
import type { PedidoUbicado } from "./tipos";

// Las direcciones se ubican al CARGAR cada pedido, una por una, así que acá
// solo se reintentan las que fallaron. Se limita cuántas para no dejar al
// conductor treinta segundos mirando una pantalla trabada; las que no entren en
// este intento se reintentan en la próxima generación.
const MAX_REINTENTOS_UBICAR = 5;

export function tieneCoordenadas(p: Pedido): p is PedidoUbicado {
  return p.lat != null && p.lng != null;
}

// Reintenta ubicar en el mapa los pedidos que quedaron sin coordenadas y guarda
// las que se consigan.
//
// LO QUE CAMBIÓ Y POR QUÉ: antes esto usaba geocodificarDireccion(), que se
// queda con la mejor coincidencia y no dice que había otra. Un pedido con una
// dirección ambigua entraba a la ruta con coordenadas que nadie había
// confirmado, y el conductor se enteraba al llegar a la casa equivocada. Ahora se
// usa ubicarDireccion(), que devuelve `elegida` SOLO cuando no hay dudas: si hay
// dos lugares con el mismo nombre, o solo se encontró la calle, el pedido se
// queda fuera con una advertencia y el conductor decide.
//
// No se pierde nada: el pedido sigue pendiente en la lista del día y la
// advertencia le dice qué corregir. Es el cumplimiento de SC-009 —ningún pedido
// entra a una ruta sin ubicación confirmada o advertencia visible— y del
// principio IV de la constitución.
export async function reintentarUbicar(
  pendientes: Pedido[],
  /** «Cancelar» mientras se optimiza (spec 033): deja de ubicar al tiro, sin esperar la
   *  consulta en curso. Lo encontrado hasta ahí se guarda igual. */
  senal?: AbortSignal,
): Promise<{ pendientes: Pedido[]; advertencias: string[] }> {
  const sinUbicar = pendientes.filter((p) => !tieneCoordenadas(p));
  if (sinUbicar.length === 0) return { pendientes, advertencias: [] };

  const encontradas: { id: string; lat: number; lng: number }[] = [];
  const enDuda: { id: string; punto: { lat: number; lng: number }; problema: ProblemaGuardado }[] = [];
  const advertencias: string[] = [];
  const aIntentar = sinUbicar.slice(0, MAX_REINTENTOS_UBICAR);

  // Secuencial a propósito: en paralelo se pasaría del límite de consultas por
  // segundo de OpenStreetMap. El espaciado ya no se hace acá — lo garantiza el
  // propio geocodificador (ver la fila de turnos en lib/geo/geocoding), y así una
  // dirección que Google resuelve sola no paga ninguna espera.
  // Los puntos del día: una calle repetida se queda con el lugar de la zona de la ruta (spec 035).
  const puntosDelDia = pendientes.filter(tieneCoordenadas).map((p) => ({ lat: p.lat, lng: p.lng }));
  const anotar = (pedido: Pedido, r: ResultadoUbicacion) => {
    if (r.elegida) {
      encontradas.push({ id: pedido.id, lat: r.elegida.lat, lng: r.elegida.lng });
      // Entró a la ruta, pero puede haber entrado con la puerta interpolada
      // (tipo "aproximada"): se avisa igual. Un pedido que entra con una
      // coordenada aproximada y sin decirlo es el conductor buscando el número a
      // pie en la cuadra, sin saber por qué.
      if (r.advertencia) advertencias.push(`${nombreVisible(pedido)}: ${r.advertencia}`);
      return;
    }
    // En duda pero con opciones (calle en varios lugares, o solo la calle):
    // entra con la primera y un ⚠ con todas, para elegir después sin volver a
    // buscar (spec 022, US1).
    const provisorio = lugarProvisorio(r);
    if (provisorio) {
      enDuda.push({ id: pedido.id, ...provisorio });
      advertencias.push(`${nombreVisible(pedido)}: con dudas, se incluye con la primera opción (⚠).`);
      return;
    }
    // Sin ubicación confirmada. La advertencia nombra al destinatario porque es
    // así como el conductor sabe de qué paquete se trata; el texto no sale del
    // teléfono.
    if (r.advertencia) advertencias.push(`${nombreVisible(pedido)}: ${r.advertencia}`);
  };

  // Sin conexión cada dirección esperaba a los buscadores (~24 s con la conexión
  // colgada) y «Optimizar ruta» pagaba las cinco. Con 2 seguidas sin respuesta se para,
  // con la misma regla que ubicarCarga (spec 033; spec 038, autorizado por el dueño):
  // las que quedan se reintentan en la próxima, como las que pasan del máximo.
  let intentados = 0;
  let seguidas = 0;
  for (const pedido of aIntentar) {
    if (senal?.aborted) break;
    let r: ResultadoUbicacion | null;
    try {
      r = await hastaAbortar(ubicarDireccion(pedido.direccion, senal), senal);
    } catch {
      r = null;
    }
    if (senal?.aborted) break;
    intentados++;
    if (r) anotar(pedido, elegirConLaRuta(r, puntosDelDia));
    if (!r || r.sinRespuesta) {
      if (++seguidas >= FALLOS_PARA_PARAR) break;
    } else {
      seguidas = 0;
    }
  }

  // Los que no entraron en este intento no son un problema silencioso: se
  // reintentan en la próxima generación, y mientras tanto hay que decirlo.
  const sinIntentar = sinUbicar.length - intentados;
  if (sinIntentar > 0) {
    advertencias.push(
      `Quedaron ${sinIntentar} pedido(s) sin intentar ubicar. Vuelve a optimizar la ruta para continuar.`,
    );
  }

  await fijarCoordenadas(encontradas);
  await ubicarConDuda(enDuda);

  const porId = new Map([
    ...encontradas.map((c) => [c.id, c] as const),
    ...enDuda.map((d) => [d.id, { id: d.id, ...d.punto }] as const),
  ]);
  return {
    pendientes: pendientes.map((p) => {
      const coord = porId.get(p.id);
      return coord ? { ...p, lat: coord.lat, lng: coord.lng } : p;
    }),
    advertencias,
  };
}

// ---------------------------------------------------------------------------
// Paradas pegadas a una carretera (terreno 2026-10-29, ver geo/acceso.ts)
// ---------------------------------------------------------------------------

/** Lo ya revisado en esta sesión, por punto: regenerar no vuelve a preguntar. */
const accesosRevisados = new Map<string, Acceso | null>();

/** Olvida lo revisado: son puntos de destinatarios (al borrar el día, spec 033 G5). */
export function olvidarAccesos(): void {
  accesosRevisados.clear();
}
/** Consultas a la vez. */
const EN_PARALELO = 6;
/** Tope de la revisión entera: con mala señal no puede demorar el armado. */
const MS_REVISION = 10_000;

/** Corre a la calle local las paradas que el ruteo engancharía a una carretera que
 *  no es su calle, y lo guarda en el pedido. Devuelve los pedidos con el punto
 *  nuevo y un aviso por cada uno que se movió. */
export async function corregirAccesos(
  ubicados: PedidoUbicado[],
): Promise<{ ubicados: PedidoUbicado[]; advertencias: string[] }> {
  const accesos: (Acceso | null)[] = new Array(ubicados.length).fill(null);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ubicados, advertencias: [] };
  const hasta = Date.now() + MS_REVISION;
  for (let i = 0; i < ubicados.length && Date.now() < hasta; i += EN_PARALELO) {
    await Promise.all(
      ubicados.slice(i, i + EN_PARALELO).map(async (p, k) => {
        const clave = `${p.lat},${p.lng}`;
        if (!accesosRevisados.has(clave)) accesosRevisados.set(clave, await puntoDeAcceso(p, p.direccion));
        accesos[i + k] = accesosRevisados.get(clave) ?? null;
      }),
    );
  }

  const movidos = ubicados.flatMap((p, i) => {
    const a = accesos[i];
    return a ? [{ pedido: p, acceso: a }] : [];
  });
  if (movidos.length === 0) return { ubicados, advertencias: [] };

  await fijarCoordenadas(movidos.map(({ pedido, acceso }) => ({ id: pedido.id, ...acceso.punto })));
  const nuevos = new Map(movidos.map(({ pedido, acceso }) => [pedido.id, acceso.punto]));
  return {
    ubicados: ubicados.map((p) => {
      const punto = nuevos.get(p.id);
      return punto ? { ...p, lat: punto.lat, lng: punto.lng } : p;
    }),
    advertencias: movidos.map(
      ({ pedido, acceso }) =>
        `"${nombreVisible(pedido)}" quedaba junto a ${acceso.carretera ?? "la carretera"}: se ubicó en ${acceso.calle ?? "la calle de al lado"}, por donde se accede.`,
    ),
  };
}

/** reintentarUbicar y después corregirAccesos de los que quedan con punto, en ese orden, como antes de la
 *  spec 038. La 038 los corría a la vez y la revisión de accesos alcanzaba a casi todas las paradas (sin
 *  el tope de tiempo por tandas ni lo recordado de lo que no se pudo leer): movía más paradas y la ruta
 *  cambiaba (dueño, 2026-11-18: «va y vuelve»; volver a como era). `ubicadoEn`: cuándo terminó de ubicar
 *  (desde ahí cuenta el armado, como antes). */
export async function ubicarYCorregirAccesos(
  pendientes: Pedido[],
  senal?: AbortSignal,
): Promise<{ pendientes: Pedido[]; ubicados: PedidoUbicado[]; advertencias: string[]; ubicadoEn: number }> {
  const medido = desde("ruta.preparar");
  const reintento = await reintentarUbicar(pendientes, senal);
  const ubicadoEn = Date.now();
  senal?.throwIfAborted();
  const conPunto = reintento.pendientes.filter(tieneCoordenadas);
  // Si la revisión de calles falla, se sigue con los puntos como estaban.
  const accesos = await corregirAccesos(conPunto).catch(() => ({ ubicados: conPunto, advertencias: [] as string[] }));
  medido();
  return {
    pendientes: reintento.pendientes,
    ubicados: accesos.ubicados,
    advertencias: [...reintento.advertencias, ...accesos.advertencias],
    ubicadoEn,
  };
}
