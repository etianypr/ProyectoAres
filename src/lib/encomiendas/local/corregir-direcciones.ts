// Los pedidos del día sin ubicar, corregidos con IA (spec 018).
//
// La IA PROPONE y el conductor CONFIRMA cada una (terreno 2026-10-27: "necesito
// que el conductor tenga que confirmar las que no se ubican y la IA corrige").
// Nada se aplica solo. Se proponen solo las que tienen un punto de calle (la
// puerta o la cuadra); un barrio no sirve para entregar y queda sin arreglo.
// Al confirmar, el texto original queda en las notas del pedido.

import { nombreVisible } from "@/lib/encomiendas/paquete";
import { corregirConIA, IANoDisponible } from "@/lib/geo/direccion-ia/cliente";
import { MAX_DIRECCIONES_POR_TANDA, type ResultadoIA } from "@/lib/geo/direccion-ia/contrato";
import { cambiarDireccion, leerPedidos, type Pedido } from "./almacen";

/** Una corrección a confirmar. */
export type PropuestaCorreccion = {
  pedidoId: string;
  nombre: string;
  /** Lo que decía la guía o la etiqueta. */
  original: string;
  /** Lo que propone la IA. */
  direccion: string;
  lat: number;
  lng: number;
  /** El buscador dio la cuadra y no la puerta. */
  enLaCuadra: boolean;
  /** La puerta, o la cuadra con el número dentro: lo que el buscador de siempre
   *  aceptaría solo. Las demás se marcan como dudosas. */
  segura: boolean;
  motivo: string;
};

export type ResumenCorreccion = {
  propuestas: PropuestaCorreccion[];
  /** Las que la IA no pudo arreglar: quedan para corregir a mano. */
  sinArreglo: number;
  /** Sin IA en el servidor: no se intentó nada. */
  sinIA: boolean;
};

const sinUbicar = (p: Pedido) => p.resultado === "pendiente" && (p.lat == null || p.lng == null) && p.direccion.trim() !== "";

/** La puerta, o la cuadra con el número dentro. */
export function esSegura(r: Extract<ResultadoIA, { tipo: "propuesta" }>): boolean {
  if (r.confianza === "alta") return true;
  return r.confianza === "media" && r.candidato.confianza === "aproximada" && r.candidato.coincideNumero !== false;
}

/** Le pide a la IA una corrección para cada pedido sin ubicar. No cambia nada. */
export async function corregirSinUbicar(
  fecha: string,
  {
    alAvanzar,
    corregir = corregirConIA,
  }: {
    /** (hechos, total) para la barra de avance. */
    alAvanzar?: (hechos: number, total: number) => void;
    corregir?: (direccion: string) => Promise<ResultadoIA>;
  } = {},
): Promise<ResumenCorreccion> {
  const pendientes = (await leerPedidos(fecha)).filter(sinUbicar).slice(0, MAX_DIRECCIONES_POR_TANDA);
  const resumen: ResumenCorreccion = { propuestas: [], sinArreglo: 0, sinIA: false };

  for (const [i, p] of pendientes.entries()) {
    alAvanzar?.(i, pendientes.length);
    let r: ResultadoIA;
    try {
      r = await corregir(p.direccion);
    } catch (e) {
      if (e instanceof IANoDisponible) return { ...resumen, sinIA: true };
      r = { tipo: "error", mensaje: "La IA no respondió." };
    }
    if (r.tipo === "propuesta" && r.candidato.confianza !== "baja") {
      resumen.propuestas.push({
        pedidoId: p.id,
        nombre: nombreVisible(p),
        original: p.direccion,
        direccion: r.direccion,
        lat: r.candidato.lat,
        lng: r.candidato.lng,
        enLaCuadra: r.candidato.confianza === "aproximada",
        segura: esSegura(r),
        motivo: r.motivo,
      });
    } else {
      resumen.sinArreglo++;
    }
  }
  alAvanzar?.(pendientes.length, pendientes.length);
  return resumen;
}

/** El conductor confirmó la corrección: el pedido queda con la dirección y el
 *  punto propuestos, y lo que decía antes en las notas. */
export async function aplicarCorreccion(p: PropuestaCorreccion): Promise<void> {
  const cuadra = p.enLaCuadra ? " (punto aproximado en la cuadra)" : "";
  await cambiarDireccion(
    p.pedidoId,
    p.direccion,
    { lat: p.lat, lng: p.lng },
    `Dirección corregida con IA y confirmada${cuadra}; decía «${p.original}»`,
  );
}
