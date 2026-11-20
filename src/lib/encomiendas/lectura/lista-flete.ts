// La lista de la app de Starken en el teléfono del conductor («Ruta» → «Lista de Ordenes de
// Flete»), barrida con la cámara en vivo como la boleta de papel (spec 045; dueño, 2026-11-19:
// «se deberían usar las dos»). Puro. Una tarjeta por encargo:
//
//   282000001                 ← la OF, sola en su renglón (igual que en la boleta)
//   PxP                       ← ícono; verde es «por pagar», pero la cámara no ve colores
//   <nombre>                  ← el destinatario: NO se lee (sale de la etiqueta, spec 021)
//   CALLE 123 ARICA COD       ← la dirección con la comuna, y el ícono COD en el mismo renglón
//   27000001                  ← el número del conductor, igual en todas: se ignora
//   Hoy
//
// Medido con la lista real (Diagnóstico → «Copiar anonimizado», 2026-11-19): ML Kit entrega
// cada cosa en su renglón. Va aparte de nomina.ts para que las reglas de uno no lean el otro: un
// cuadro con algo de la boleta no se lee aquí, y la boleta no trae la OF sola seguida de un nombre
// y de una dirección que termina en «ARICA».

import { LARGO_OF, ofValida } from "../paquete";
import { limpiarDestino } from "./guia";

/** La OF sola en su renglón, a lo más con la casilla «-» de la tarjeta antes. Con sus 9 dígitos,
 *  como en la boleta (dueño, 2026-11-19): en la lista real una OF salió con 7 en un cuadro (la
 *  cámara se comió dos), y esa lectura armaba una OF fantasma. Otro cuadro la trae entera. */
const RENGLON_OF = new RegExp(String.raw`^\s*[-–]?\s*(\d{${LARGO_OF}})\s*$`);
/** La dirección termina en la comuna; después puede venir el ícono «COD» (o lo que ML Kit leyó
 *  de él: 1 a 4 letras). */
const DIRECCION_CON_COMUNA = /^(.*\p{L}.*?)\s+ARICA(?:\s+\S{1,4})?\s*$/iu;
/** Un ícono o la casilla: «PxP», «COD», «-», «Hoy». */
const ICONO = /^\s*\S{1,4}\s*$/;
/** El nombre: letras y signos de nombre, sin dígitos. */
const NOMBRE = /^[\p{L}\s.'´-]+$/u;
/** Lo que es de la boleta de papel (sus títulos y su pie): ese cuadro no se lee aquí. */
const DE_LA_BOLETA = /D[I1L]RECC[I1L][O0Ó]N|VAL[O0]R\s*\$|F[O0]RMA\s+PAG|ENCARG|D[O0]CT[O0]S|BULT[O0]S|DESTINATAR|C[O0]MUNA/i;
/** Renglones entre la OF y la dirección: íconos y el nombre (que ML Kit puede partir en dos). */
const MAX_ENTRE = 4;

/** Una tarjeta entera: de la fila de su OF (`filaOf`) a la de su dirección (`hasta`). */
export type BloqueLista = { of: string; destino: string; filaOf: number; hasta: number };

/** Las tarjetas enteras de un cuadro de la lista. Una tarjeta cortada en el borde (sin su OF o
 *  sin su dirección) no se toma: otro cuadro la trae entera. */
export function bloquesListaFlete(renglones: string[]): BloqueLista[] {
  if (renglones.some((r) => DE_LA_BOLETA.test(r))) return [];
  // Un número que sale dos veces en el cuadro no es una OF: es el del conductor, que va en cada
  // tarjeta (dueño, 2026-11-19: «si es el de conductor se ignora»).
  const vecesEnElCuadro = new Map<string, number>();
  for (const r of renglones) {
    const n = r.match(RENGLON_OF)?.[1];
    if (n) vecesEnElCuadro.set(n, (vecesEnElCuadro.get(n) ?? 0) + 1);
  }
  const bloques: BloqueLista[] = [];
  for (let i = 0; i < renglones.length; i++) {
    const numero = renglones[i].match(RENGLON_OF)?.[1];
    if (!numero || (vecesEnElCuadro.get(numero) ?? 0) > 1) continue;
    let nombre = false;
    for (let j = i + 1; j < renglones.length && j <= i + 1 + MAX_ENTRE; j++) {
      const r = renglones[j];
      const direccion = r.match(DIRECCION_CON_COMUNA);
      // Sin el nombre antes no es una tarjeta: el renglón del número del conductor, o algo que no
      // es la lista, no se toma por la dirección de nadie.
      if (direccion && nombre) {
        const of = ofValida(numero);
        const destino = limpiarDestino(direccion[1]);
        if (of && destino) bloques.push({ of, destino, filaOf: i, hasta: j });
        i = j;
        break;
      }
      if (ICONO.test(r)) continue;
      if (!NOMBRE.test(r)) break;
      nombre = true;
    }
  }
  return bloques;
}
