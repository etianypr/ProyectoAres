// El paquete de cada pedido en el almacén (spec 003): OF, referencia y foto.
// Todo en el teléfono; las fotos se van al cerrarse el pedido y con el día.

import { uuidv7 } from "@/lib/comun/uuid";
import { ofValida } from "@/lib/encomiendas/paquete";
import { STORES, clavesFotosDe, escribir, leerUno } from "../idb";
import { enFila } from "./fila";
import { leerPedido, leerPedidos } from "./lecturas";
import type { Foto, Pedido, ReferenciaPaquete } from "./tipos";

/** Si otro pedido del día ya tiene esa OF: posible doble carga. Avisa, no frena. */
export async function ofRepetida(fecha: string, of: string | null, exceptoId?: string): Promise<boolean> {
  if (!of) return false;
  return (await leerPedidos(fecha)).some((p) => p.id !== exceptoId && p.of === of);
}

/** Cambia la OF o la referencia de un pedido sin tocar lo demás (la 005 la usa al
 *  escanear la etiqueta). Una OF inválida (ver ofValida) no se guarda. */
export function guardarPaquete(
  pedidoId: string,
  cambios: { of?: string | null; referencia?: ReferenciaPaquete | null },
): Promise<{ ofRepetida: boolean }> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    if (!pedido) throw new Error("Ese pedido ya no existe en este teléfono.");
    let of = pedido.of;
    if (cambios.of !== undefined) {
      of = cambios.of === null ? null : ofValida(cambios.of);
      if (cambios.of !== null && of === null) throw new Error("La OF lleva solo números.");
    }
    const actualizado: Pedido = {
      ...pedido,
      of,
      referencia: cambios.referencia !== undefined ? cambios.referencia : pedido.referencia,
    };
    await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, actualizado));
    return { ofRepetida: await ofRepetida(pedido.fecha, of, pedido.id) };
  });
}

/** Guarda la foto (ya comprimida) y la deja en el pedido; la anterior se borra. */
export function guardarFoto(pedidoId: string, blob: Blob): Promise<string> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    if (!pedido) throw new Error("Ese pedido ya no existe en este teléfono.");
    const foto: Foto = { id: uuidv7(), pedidoId, fecha: pedido.fecha, blob };
    await escribir([STORES.fotos, STORES.pedidos], ({ guardar, borrar }) => {
      if (pedido.fotoId) borrar(STORES.fotos, pedido.fotoId);
      guardar(STORES.fotos, foto);
      guardar(STORES.pedidos, { ...pedido, fotoId: foto.id });
    });
    return foto.id;
  });
}

export async function leerFoto(fotoId: string): Promise<Blob | null> {
  return (await leerUno(STORES.fotos, fotoId))?.blob ?? null;
}

/** Quita la foto del pedido. */
export function borrarFoto(pedidoId: string): Promise<void> {
  return enFila(async () => {
    const pedido = await leerPedido(pedidoId);
    if (!pedido?.fotoId) return;
    const fotoId = pedido.fotoId;
    await escribir([STORES.fotos, STORES.pedidos], ({ guardar, borrar }) => {
      borrar(STORES.fotos, fotoId);
      guardar(STORES.pedidos, { ...pedido, fotoId: null });
    });
  });
}

/** Borra las fotos del día que ya no hacen falta: las de pedidos cerrados
 *  (entregado o no) y las que quedaron sin pedido. Se llama cuando vence la
 *  ventana para deshacer, así deshacer una entrega no pierde la foto. Devuelve
 *  cuántas borró. */
export function purgarFotosCerradas(fecha: string): Promise<number> {
  return enFila(async () => {
    const [claves, pedidos] = await Promise.all([clavesFotosDe(fecha), leerPedidos(fecha)]);
    const vivas = new Set(pedidos.filter((p) => p.resultado === "pendiente").map((p) => p.fotoId));
    const sobran = claves.filter((id) => !vivas.has(id));
    const conFotoCerrada = pedidos.filter((p) => p.fotoId != null && p.resultado !== "pendiente");
    if (sobran.length === 0 && conFotoCerrada.length === 0) return 0;
    await escribir([STORES.fotos, STORES.pedidos], ({ guardar, borrar }) => {
      for (const id of sobran) borrar(STORES.fotos, id);
      for (const p of conFotoCerrada) guardar(STORES.pedidos, { ...p, fotoId: null });
    });
    return sobran.length;
  });
}
