// Los pedidos del día sin ubicar, corregidos con IA (spec 018).
//
// La IA PROPONE y el conductor CONFIRMA cada una (terreno 2026-10-27: "necesito
// que el conductor tenga que confirmar las que no se ubican y la IA corrige").
// Nada se aplica solo. Se proponen solo las que tienen un punto de calle (la
// puerta o la cuadra); un barrio no sirve para entregar y queda sin arreglo.
// Al confirmar, el texto original queda en las notas del pedido.

import { nombreVisible } from "@/lib/encomiendas/paquete";
import { distanciaMetros } from "@/lib/geo/coordenada";
import { corregirConIA, IANoDisponible } from "@/lib/geo/direccion-ia/cliente";
import { DIRECCIONES_A_LA_VEZ, MAX_DIRECCIONES_POR_TANDA, type ResultadoIA } from "@/lib/geo/direccion-ia/contrato";
import { telefonoParaGuardar } from "@/lib/comun/telefono";
import { cambiarDireccion, fijarTelefono, guardarPropuestaIA, leerPedidos, type Pedido } from "./almacen";
import { hastaAbortar, hayRed } from "./ubicar-carga";

/** Una corrección a confirmar. */
export type PropuestaCorreccion = {
  pedidoId: string;
  nombre: string;
  /** El teléfono que ya tiene el pedido ("" si ninguno): se ve con «Llamar». */
  telefono: string;
  /** Lo que decía la guía o la etiqueta. */
  original: string;
  /** Lo que propone la IA. */
  direccion: string;
  lat: number;
  lng: number;
  /** El buscador dio la cuadra y no la puerta. */
  enLaCuadra: boolean;
  /** El buscador dio solo la calle, sin el número: el punto puede estar a
   *  kilómetros. Nunca es segura. */
  soloCalle: boolean;
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
  /** Las que no se alcanzaron a preguntar por falta de señal (o la IA no
   *  contestó): no son «sin arreglo», se pueden volver a pedir (spec 033). */
  sinSenal: number;
};

/** Seguidas sin respuesta de la IA (vecinas en la tanda, spec 038): sin señal no se espera
 *  30 s por cada una. */
const FALLOS_PARA_PARAR = 2;

const conDireccion = (p: Pedido) => p.resultado === "pendiente" && p.direccion.trim() !== "";
const sinUbicar = (p: Pedido) => conDireccion(p) && (p.lat == null || p.lng == null);
/** Ubicado, pero solo con la calle (2026-11-16). Una calle repetida no va a la IA: no sabe dónde
 *  anda la ruta; sus lugares se eligen en «Por confirmar». */
const lugarEnDuda = (p: Pedido) => conDireccion(p) && p.problemas.some((x) => x.tipo === "solo_calle");

/** Lo que la IA revisa: los sin ubicar y los de lugar en duda del día; con `ids` (una carga),
 *  esos pedidos, también los que quedaron a mitad de cuadra (2026-11-16: antes solo los sin
 *  ubicar, y había que reescribir a mano los que entraban mal). */
export const porRevisar = (p: Pedido, ids?: ReadonlySet<string> | null) =>
  ids ? ids.has(p.id) && conDireccion(p) : sinUbicar(p) || lugarEnDuda(p);

/** La propuesta guardada sigue valiendo: el pedido sigue pendiente y con la
 *  misma dirección que se le preguntó a la IA. */
const conPropuestaVigente = (p: Pedido) => conDireccion(p) && p.propuestaIA != null && p.propuestaIA.original === p.direccion;

/** Una propuesta a menos de esto del punto que ya tiene el pedido no cambia nada: no se muestra. */
const METROS_SIN_CAMBIO = 60;

function propuestaDe(p: Pedido, guardada: NonNullable<Pedido["propuestaIA"]>): PropuestaCorreccion {
  return { pedidoId: p.id, nombre: nombreVisible(p), telefono: p.telefono, ...guardada };
}

/** Las propuestas de la IA guardadas y sin confirmar (dueño, 2026-11-13): al
 *  volver a la app se muestran de nuevo sin preguntarle otra vez. */
export async function propuestasGuardadas(fecha: string, ids?: string[]): Promise<PropuestaCorreccion[]> {
  const soloEstos = ids ? new Set(ids) : null;
  return (await leerPedidos(fecha))
    .filter((p) => conPropuestaVigente(p) && (!soloEstos || soloEstos.has(p.id)))
    .map((p) => propuestaDe(p, p.propuestaIA!));
}

/** La puerta, o la cuadra con el número dentro. La calle entera, nunca: su
 *  punto es la mitad de la calle (terreno 2026-10-28). */
export function esSegura(r: Extract<ResultadoIA, { tipo: "propuesta" }>): boolean {
  if (r.candidato.soloCalle) return false;
  if (r.confianza === "alta") return true;
  return r.confianza === "media" && r.candidato.confianza === "aproximada" && r.candidato.coincideNumero !== false;
}

/** Una pregunta a la IA: la dirección escrita y los pedidos de la tanda que la llevan. El mismo
 *  destino (recortado y en minúsculas) se pregunta una sola vez y cada pedido se queda con la
 *  respuesta (spec 038). */
type Consulta = {
  direccion: string;
  /** Posiciones en `pendientes`. */
  pedidos: number[];
  /** Su lugar entre las consultas: dos errores vecinos son «sin conexión». */
  orden: number;
  estado: "por_preguntar" | "preguntando" | "bien" | "error";
  /** Ya se volvió a preguntar tras un 429. */
  reintentada: boolean;
};

function agruparPorDestino(pendientes: Pedido[]): Consulta[] {
  const porTexto = new Map<string, Consulta>();
  for (const [i, p] of pendientes.entries()) {
    const clave = p.direccion.trim().toLowerCase();
    const ya = porTexto.get(clave);
    if (ya) ya.pedidos.push(i);
    else porTexto.set(clave, { direccion: p.direccion, pedidos: [i], orden: porTexto.size, estado: "por_preguntar", reintentada: false });
  }
  return [...porTexto.values()];
}

/** Le pide a la IA una corrección para cada pedido por revisar. No cambia nada.
 *
 *  Spec 038: varias direcciones a la vez (`DIRECCIONES_A_LA_VEZ`), con las mismas propuestas que
 *  en serie (pruebas/038-ia.test.mjs). Mientras no llegue una respuesta buena, o si la última fue
 *  un error, va de a una: sin conexión, «2 errores paran» sigue preguntando exactamente 2 veces.
 *  Las propuestas salen en el orden de los pedidos y `alAvanzar` cuenta las terminadas. */
export async function corregirDirecciones(
  fecha: string,
  {
    alAvanzar,
    corregir = corregirConIA,
    ids,
    excluir = [],
    senal,
    enLinea = hayRed,
  }: {
    /** (hechos, total) para la barra de avance. */
    alAvanzar?: (hechos: number, total: number) => void;
    corregir?: (direccion: string, opciones?: { senal?: AbortSignal }) => Promise<ResultadoIA>;
    /** Solo estos pedidos (los de la carga recién hecha), no todo el día. */
    ids?: string[];
    /** Los que ya tienen una propuesta a la vista: no se vuelve a pagar por ellos. */
    excluir?: string[];
    /** «Dejar de ubicar»: corta sin esperar las respuestas en curso. */
    senal?: AbortSignal;
    enLinea?: () => boolean;
  } = {},
): Promise<ResumenCorreccion> {
  const soloEstos = ids ? new Set(ids) : null;
  const pendientes = (await leerPedidos(fecha))
    // Los que ya tienen una propuesta guardada no se vuelven a pagar.
    .filter((p) => porRevisar(p, soloEstos) && !conPropuestaVigente(p) && !excluir.includes(p.id))
    .slice(0, MAX_DIRECCIONES_POR_TANDA);
  const resumen: ResumenCorreccion = { propuestas: [], sinArreglo: 0, sinIA: false, sinSenal: 0 };
  if (!enLinea()) return { ...resumen, sinSenal: pendientes.length };

  const total = pendientes.length;
  const consultas = agruparPorDestino(pendientes);
  const cola = [...consultas];
  const propuestas: { i: number; propuesta: PropuestaCorreccion }[] = [];
  let terminadas = 0;
  let ultimoAvance = -1;
  const avanzar = (hechos: number) => {
    if (hechos === ultimoAvance) return;
    ultimoAvance = hechos;
    alAvanzar?.(hechos, total);
  };
  /** Baja a 1 con un 429: Anthropic pidió menos a la vez. */
  let maximo = DIRECCIONES_A_LA_VEZ;
  let hayBuena = false;
  let ultimaFueError = false;
  let parar = false;
  let sinIA = false;
  let enVuelo = 0;

  /** Errores vecinos alrededor de `c`, en el orden de la tanda (como los «seguidos» en serie). */
  const erroresVecinos = (c: Consulta) => {
    let n = 1;
    for (let k = c.orden - 1; k >= 0 && consultas[k].estado === "error"; k--) n++;
    for (let k = c.orden + 1; k < consultas.length && consultas[k].estado === "error"; k++) n++;
    return n;
  };

  async function aplicar(c: Consulta, r: Exclude<ResultadoIA, { tipo: "error" }>): Promise<void> {
    for (const i of c.pedidos) {
      const p = pendientes[i];
      // Cada pedido con SU punto: el mismo destino puede estar ya bien puesto en uno solo.
      const yaEstaba =
        r.tipo === "propuesta" && p.lat != null && p.lng != null && distanciaMetros(r.candidato, { lat: p.lat, lng: p.lng }) < METROS_SIN_CAMBIO;
      if (yaEstaba) continue;
      if (r.tipo === "propuesta" && r.candidato.confianza !== "baja") {
        const guardada = {
          original: p.direccion,
          direccion: r.direccion,
          lat: r.candidato.lat,
          lng: r.candidato.lng,
          enLaCuadra: r.candidato.confianza === "aproximada" && !r.candidato.soloCalle,
          soloCalle: r.candidato.soloCalle,
          segura: esSegura(r),
          motivo: r.motivo,
        };
        // Se guarda apenas llega: cerrar la app a mitad de la tanda no pierde lo pagado.
        // Si no se puede guardar, la propuesta se muestra igual.
        await guardarPropuestaIA(p.id, guardada).catch(() => null);
        propuestas.push({ i, propuesta: propuestaDe(p, guardada) });
      } else {
        resumen.sinArreglo++;
      }
    }
  }

  async function preguntar(c: Consulta): Promise<void> {
    let r: ResultadoIA | null;
    try {
      // A la IA va solo la dirección (guia-telefono.test.mjs); la señal no es un dato y va
      // solo cuando hay una, para cortar la conversación al detener.
      r = await hastaAbortar(senal ? corregir(c.direccion, { senal }) : corregir(c.direccion), senal);
    } catch (e) {
      if (e instanceof IANoDisponible) {
        sinIA = true;
        parar = true;
        return;
      }
      r = { tipo: "error", mensaje: "La IA no respondió." };
    }
    // Detenida: lo que llegue después no cuenta (la conversación ya no pide más idas).
    if (r == null || senal?.aborted) return;
    if (r.tipo === "error" && r.ocupada && !c.reintentada) {
      // 429 (spec 038): la IA existe y hay conexión. La tanda sigue de a una y esta dirección
      // se vuelve a preguntar primero, sola.
      c.reintentada = true;
      c.estado = "por_preguntar";
      maximo = 1;
      cola.unshift(c);
      return;
    }
    if (r.tipo === "error") {
      c.estado = "error";
      ultimaFueError = true;
      resumen.sinSenal += c.pedidos.length;
      if (erroresVecinos(c) >= FALLOS_PARA_PARAR) parar = true;
    } else {
      c.estado = "bien";
      hayBuena = true;
      ultimaFueError = false;
      await aplicar(c, r);
    }
    terminadas += c.pedidos.length;
    avanzar(terminadas);
  }

  // Al parar (2 errores o sin IA) se espera a las que están en vuelo y se cuentan las que
  // lleguen; al detener, cada una suelta su espera apenas se aborta la señal.
  let fallo: unknown = null;
  await new Promise<void>((listo) => {
    const seguir = () => {
      const tope = !hayBuena || ultimaFueError ? 1 : maximo;
      while (!parar && !senal?.aborted && enVuelo < tope && cola.length > 0) {
        const c = cola.shift()!;
        c.estado = "preguntando";
        enVuelo++;
        avanzar(terminadas);
        void preguntar(c)
          .catch((e: unknown) => {
            // Lo que antes salía de la función sigue saliendo, sin dejar nada colgado.
            fallo ??= e;
            parar = true;
          })
          .finally(() => {
            enVuelo--;
            seguir();
          });
      }
      if (enVuelo === 0) listo();
    };
    seguir();
  });
  if (fallo) throw fallo;

  const enOrden = propuestas.sort((a, b) => a.i - b.i).map((x) => x.propuesta);
  if (sinIA) return { ...resumen, propuestas: enOrden, sinIA: true };
  if (parar) resumen.sinSenal += cola.reduce((s, c) => s + c.pedidos.length, 0);
  avanzar(total);
  return { ...resumen, propuestas: enOrden };
}

/** El nombre de antes, para las pantallas y las pruebas que ya lo usan. */
export const corregirSinUbicar = corregirDirecciones;

/** Lo que el conductor eligió de la lista después de tocar el lápiz. */
export type CorreccionEditada = { direccion: string; lat: number; lng: number };

/** El conductor confirmó la corrección: el pedido queda con la dirección y el
 *  punto propuestos, y lo que decía antes en las notas. Si la corrigió con el
 *  lápiz (dueño, 2026-11-11), queda la que eligió él. */
export async function aplicarCorreccion(
  p: PropuestaCorreccion,
  editada?: CorreccionEditada,
  /** El teléfono anotado en la tarjeta (dueño, 2026-11-13): se guarda en el
   *  pedido como en el formulario. Solo en el teléfono; la IA ya contestó. */
  telefono?: string,
): Promise<void> {
  const escrito = telefono?.trim() ? telefonoParaGuardar(telefono) : null;
  if (escrito && escrito !== p.telefono) await fijarTelefono(p.pedidoId, escrito);
  const otra =
    editada != null && (editada.direccion !== p.direccion || editada.lat !== p.lat || editada.lng !== p.lng);
  if (otra) {
    await cambiarDireccion(
      p.pedidoId,
      editada.direccion,
      { lat: editada.lat, lng: editada.lng },
      `Dirección corregida manualmente sobre la de la IA; decía «${p.original}»`,
    );
    return;
  }
  const cuadra = p.soloCalle
    ? " (solo la calle, sin el número)"
    : p.enLaCuadra
      ? " (punto aproximado en la cuadra)"
      : "";
  await cambiarDireccion(
    p.pedidoId,
    p.direccion,
    { lat: p.lat, lng: p.lng },
    `Dirección corregida con IA y confirmada${cuadra}; decía «${p.original}»`,
  );
}
