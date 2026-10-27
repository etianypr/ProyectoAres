// Los pedidos del día sin ubicar, corregidos con IA (spec 018).
//
// Se aplica sola la corrección que el buscador de siempre también aceptaría solo
// (ver ubicarDireccion): la puerta exacta, o la cuadra con el número dentro
// ("aproximada", con aviso). Lo demás queda "Sin ubicar" con la sugerencia a la
// vista: ante la duda elige el conductor (constitución, principio IV). El texto
// original queda en las notas.

import { nombreVisible } from "@/lib/encomiendas/paquete";
import { corregirConIA, IANoDisponible } from "@/lib/geo/direccion-ia/cliente";
import { MAX_DIRECCIONES_POR_TANDA, type ResultadoIA } from "@/lib/geo/direccion-ia/contrato";
import { cambiarDireccion, leerPedidos, type Pedido } from "./almacen";

export type ResumenCorreccion = {
  /** Las que la IA corrigió y quedaron ubicadas. */
  corregidas: number;
  /** Las que tienen una sugerencia que el conductor tiene que confirmar. */
  sugerencias: string[];
  /** Las que siguen sin arreglo. */
  sinArreglo: number;
  /** Sin IA en el servidor: no se intentó nada. */
  sinIA: boolean;
};

const sinUbicar = (p: Pedido) => p.resultado === "pendiente" && (p.lat == null || p.lng == null) && p.direccion.trim() !== "";

/** La puerta, o la cuadra con el número dentro: lo mismo que el buscador de
 *  siempre acepta sin preguntar. */
export function seAplicaSola(r: Extract<ResultadoIA, { tipo: "propuesta" }>): boolean {
  if (r.confianza === "alta") return true;
  return r.confianza === "media" && r.candidato.confianza === "aproximada" && r.candidato.coincideNumero !== false;
}

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
  const resumen: ResumenCorreccion = { corregidas: 0, sugerencias: [], sinArreglo: 0, sinIA: false };

  for (const [i, p] of pendientes.entries()) {
    alAvanzar?.(i, pendientes.length);
    let r: ResultadoIA;
    try {
      r = await corregir(p.direccion);
    } catch (e) {
      if (e instanceof IANoDisponible) return { ...resumen, sinIA: true };
      r = { tipo: "error", mensaje: "La IA no respondió." };
    }
    if (r.tipo === "propuesta" && seAplicaSola(r)) {
      const { lat, lng } = r.candidato;
      const cuadra = r.candidato.confianza === "aproximada" ? " (punto aproximado en la cuadra)" : "";
      await cambiarDireccion(p.id, r.direccion, { lat, lng }, `Dirección corregida con IA${cuadra}; decía «${p.direccion}»`);
      resumen.corregidas++;
    } else if (r.tipo === "propuesta") {
      resumen.sugerencias.push(`${nombreVisible(p)}: ¿${r.direccion}? ${r.motivo}`);
    } else {
      resumen.sinArreglo++;
    }
  }
  alAvanzar?.(pendientes.length, pendientes.length);
  return resumen;
}
