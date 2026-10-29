// Volver a ubicar, antes de armar la ruta, los pedidos que quedaron sin punto.

import { ubicarDireccion } from "@/lib/geo/geocoding";
import { puntoDeAcceso, type Acceso } from "@/lib/geo/mapbox/acceso";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import { fijarCoordenadas, type Pedido } from "../almacen";
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
): Promise<{ pendientes: Pedido[]; advertencias: string[] }> {
  const sinUbicar = pendientes.filter((p) => !tieneCoordenadas(p));
  if (sinUbicar.length === 0) return { pendientes, advertencias: [] };

  const encontradas: { id: string; lat: number; lng: number }[] = [];
  const advertencias: string[] = [];
  const aIntentar = sinUbicar.slice(0, MAX_REINTENTOS_UBICAR);

  // Secuencial a propósito: en paralelo se pasaría del límite de consultas por
  // segundo de OpenStreetMap. El espaciado ya no se hace acá — lo garantiza el
  // propio geocodificador (ver la fila de turnos en lib/geo/geocoding), y así una
  // dirección que Mapbox resuelve sola no paga ninguna espera.
  for (const pedido of aIntentar) {
    const r = await ubicarDireccion(pedido.direccion);
    if (r.elegida) {
      encontradas.push({ id: pedido.id, lat: r.elegida.lat, lng: r.elegida.lng });
      // Entró a la ruta, pero puede haber entrado con la puerta interpolada
      // (tipo "aproximada"): se avisa igual. Un pedido que entra con una
      // coordenada aproximada y sin decirlo es el conductor buscando el número a
      // pie en la cuadra, sin saber por qué.
      if (r.advertencia) advertencias.push(`${nombreVisible(pedido)}: ${r.advertencia}`);
      continue;
    }
    // Sin ubicación confirmada. La advertencia nombra al destinatario porque es
    // así como el conductor sabe de qué paquete se trata; el texto no sale del
    // teléfono.
    if (r.advertencia) advertencias.push(`${nombreVisible(pedido)}: ${r.advertencia}`);
  }

  // Los que no entraron en este intento no son un problema silencioso: se
  // reintentan en la próxima generación, y mientras tanto hay que decirlo.
  const sinIntentar = sinUbicar.length - aIntentar.length;
  if (sinIntentar > 0) {
    advertencias.push(
      `Quedaron ${sinIntentar} pedido(s) sin intentar ubicar en esta pasada. Vuelve a armar la ruta para seguir.`,
    );
  }

  await fijarCoordenadas(encontradas);

  const porId = new Map(encontradas.map((c) => [c.id, c] as const));
  return {
    pendientes: pendientes.map((p) => {
      const coord = porId.get(p.id);
      return coord ? { ...p, lat: coord.lat, lng: coord.lng } : p;
    }),
    advertencias,
  };
}

// ---------------------------------------------------------------------------
// Paradas pegadas a una carretera (terreno 2026-10-29, ver geo/mapbox/acceso.ts)
// ---------------------------------------------------------------------------

/** Lo ya revisado en esta sesión, por punto: regenerar no vuelve a preguntar. */
const accesosRevisados = new Map<string, Acceso | null>();
/** Consultas a la vez. */
const EN_PARALELO = 6;

/** Corre a la calle local las paradas que Mapbox engancharía a una carretera que
 *  no es su calle, y lo guarda en el pedido. Devuelve los pedidos con el punto
 *  nuevo y un aviso por cada uno que se movió. */
export async function corregirAccesos(
  ubicados: PedidoUbicado[],
): Promise<{ ubicados: PedidoUbicado[]; advertencias: string[] }> {
  const accesos: (Acceso | null)[] = new Array(ubicados.length).fill(null);
  for (let i = 0; i < ubicados.length; i += EN_PARALELO) {
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
        `"${nombreVisible(pedido)}" quedaba pegado a ${acceso.carretera ?? "la carretera"}: se ubicó en ${acceso.calle ?? "la calle de al lado"}, por donde se llega.`,
    ),
  };
}
