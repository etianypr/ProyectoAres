// Lo barrido de la nómina → las líneas de «Cargar la guía» (spec 029; lo «a medias» y
// seguir la misma lectura, 034). Aparte de barrido-nomina.ts, que se reexporta, para no
// pasar de 400 líneas (A7).

import type { LineaGuia } from "./guia";
import type { ResultadoNomina, VotosNomina } from "./barrido-nomina";
import { ofValida } from "../paquete";

/** Los votos de un barrido, con las dos formas de juntar los renglones. Son OF y
 *  direcciones, sin nombres: el cuadro crudo no va aquí. */
export type VotosBarrido = { porFilas: VotosNomina; comoLlegan: VotosNomina };

/** El barrido que se guarda con el borrador de «Cargar la guía» para seguir la misma
 *  lectura si el celular se bloquea o Android cierra ARES (dueño, 2026-11-15).
 *  `entregadas`: las OF que ya pasaron a las líneas de la guía y si iban firmes; una que
 *  el conductor borró o corrigió en la revisión no vuelve con el barrido siguiente. */
export type BarridoGuardado = VotosBarrido & { entregadas: Record<string, boolean> };

/** Lo barrido → las líneas de «Cargar la guía». Las que no quedaron firmes, de número o
 *  de dirección, van por confirmar: el conductor las mira con el papel. Lo «a medias»
 *  entra con la dirección vacía y por confirmar (spec 034, decisión 1 del dueño): se
 *  completa con el papel o se borra, y «Crear N pedidos» espera.
 *
 *  Con `entregadas` (se sigue una lectura que ya pasó líneas a la guía) entran solo las
 *  OF nuevas y las que estaban por confirmar y ahora quedaron firmes. `sobran`: las que
 *  se entregaron por confirmar y ya no existen (eran una mala lectura de otra OF). */
export function lineasDelBarrido(
  r: ResultadoNomina,
  entregadas: Record<string, boolean> = {},
): {
  /** `bultos`: la columna BULTOS de la nómina, si se leyó (spec 036; va al pedido).
   *  `porPagar`: su ícono de la lista de Starken salió verde (spec 045; va al pedido). */
  lineas: { of: string; destino: string; bultos?: number; porPagar?: boolean }[];
  porConfirmar: Set<string>;
  total: number | null;
  entregadas: Record<string, boolean>;
  sobran: string[];
  /** Todas las OF de la lectura, en el orden de la hoja. */
  orden: string[];
} {
  const nuevas = r.lista.filter((l) => !(l.of in entregadas) || (!entregadas[l.of] && l.estado === "firme"));
  const vistas = new Set(r.lista.map((l) => l.of));
  // Sobra solo la que ahora es parte de otra OF. Una que ya no está en la lectura porque
  // se empezó otra pasada (votosDeLoLeido) no sobra: su línea sigue en la guía, por confirmar.
  const absorbida = (of: string) => r.deLectura[of] != null && r.deLectura[of] !== of;
  const sobran = Object.keys(entregadas).filter((of) => !entregadas[of] && !vistas.has(of) && absorbida(of));
  const ahora = Object.fromEntries(Object.entries(entregadas).filter(([of]) => !sobran.includes(of)));
  for (const l of r.lista) ahora[l.of] = ahora[l.of] === true || l.estado === "firme";
  return {
    lineas: nuevas.map((l) => ({
      of: l.of,
      destino: l.destino ?? "",
      ...(l.bultos != null ? { bultos: l.bultos } : {}),
      ...(l.porPagar ? { porPagar: true } : {}),
    })),
    porConfirmar: new Set(nuevas.filter((l) => l.estado !== "firme").map((l) => l.of)),
    total: r.total,
    entregadas: ahora,
    sobran,
    orden: r.lista.map((l) => l.of),
  };
}

/** Las líneas de «Cargar la guía» después de juntar lo que había (`antes`) con lo nuevo
 *  (`nuevas`, de fotos o de un barrido) en `unidas` (armarGuia, que no sabe de esto). Una
 *  OF queda por confirmar si ya lo estaba y lo nuevo no la trajo firme, o si llega por
 *  confirmar (`porConfirmar`) y antes no estaba firme. */
export function conPorConfirmar(
  unidas: LineaGuia[],
  antes: LineaGuia[],
  nuevas: { of: string }[],
  porConfirmar: Set<string> = new Set(),
): LineaGuia[] {
  const clave = (of: string) => ofValida(of) ?? of;
  const firmesAntes = new Set(antes.filter((l) => !l.porConfirmar).map((l) => clave(l.of)));
  const pendientesAntes = new Set(antes.filter((l) => l.porConfirmar).map((l) => clave(l.of)));
  const firmesNuevas = new Set(nuevas.map((l) => clave(l.of)).filter((of) => !porConfirmar.has(of)));
  return unidas.map((l) => {
    const of = clave(l.of);
    const pendiente = (pendientesAntes.has(of) && !firmesNuevas.has(of)) || (porConfirmar.has(of) && !firmesAntes.has(of));
    return pendiente ? { ...l, porConfirmar: true } : l;
  });
}

/** Las líneas de la guía con las del barrido en el orden de la hoja (dueño, 2026-11-15: la
 *  primera de la boleta, primera en el informe de lo leído, para comparar con el papel). Las
 *  que no son del barrido (fotos, texto pegado, escritas a mano) quedan antes, como estaban. */
export function enOrdenDeLaNomina(lineas: LineaGuia[], orden: string[]): LineaGuia[] {
  const clave = (of: string) => ofValida(of) ?? of;
  const lugar = new Map(orden.map((of, i) => [clave(of), i]));
  const delBarrido = lineas.filter((l) => lugar.has(clave(l.of)));
  return [
    ...lineas.filter((l) => !lugar.has(clave(l.of))),
    ...delBarrido.sort((a, b) => lugar.get(clave(a.of))! - lugar.get(clave(b.of))!),
  ];
}
