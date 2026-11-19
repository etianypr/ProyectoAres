// Los pedidos del día que no quedaron en la puerta, corregidos con IA (spec 018; en lote desde la
// spec 040).
//
// La IA PROPONE y el conductor CONFIRMA cada una (terreno 2026-10-27: "necesito
// que el conductor tenga que confirmar las que no se ubican y la IA corrige").
// Nada se aplica solo. Se proponen solo las que tienen un punto de calle (la
// puerta o la cuadra); un barrio no sirve para entregar y queda sin arreglo.
// Al confirmar, el texto original queda en las notas del pedido.
//
// Spec 040: todas las direcciones van en un lote (o varios de LOTE_MAXIMO), con los candidatos que
// ya tenían, en vez de una conversación por dirección. La IA ve además la zona del día.

import { nombreVisible } from "@/lib/encomiendas/paquete";
import { distanciaMetros } from "@/lib/geo/coordenada";
import { sectorDe } from "@/lib/geo/sectores-arica";
import { corregirEnLote, entradasDelLote, IANoDisponible, IAOcupada } from "@/lib/geo/direccion-ia/cliente";
import { LOTE_MAXIMO, MAX_DIRECCIONES_POR_TANDA, type ResultadoIA, type ZonaDelDia } from "@/lib/geo/direccion-ia/contrato";
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

/** Espera antes de reintentar un lote al que Anthropic le limitó la tasa (429). */
const MS_ANTES_DE_REINTENTAR = 3_000;

const conDireccion = (p: Pedido) => p.resultado === "pendiente" && p.direccion.trim() !== "";
const sinUbicar = (p: Pedido) => conDireccion(p) && (p.lat == null || p.lng == null);
/** Con punto, pero no en la puerta (spec 040): solo la calle, una calle repetida o la cuadra. */
const noEnLaPuerta = (p: Pedido) =>
  conDireccion(p) && (p.aproximada === true || p.problemas.some((x) => x.tipo === "solo_calle" || x.tipo === "calle_repetida"));

/** Lo que la IA revisa: los sin ubicar y los que no quedaron en la puerta (spec 040: también la
 *  calle repetida y la cuadra); con `ids` (una carga), esos pedidos. */
export const porRevisar = (p: Pedido, ids?: ReadonlySet<string> | null) =>
  ids ? ids.has(p.id) && conDireccion(p) : sinUbicar(p) || noEnLaPuerta(p);

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

/** La zona del día para la IA: cuántos pedidos con punto (y fuera del lote) hay en cada sector.
 *  Solo nombres de sector y cifras. Pura. */
export function zonaDelDia(pedidos: Pedido[], enElLote: ReadonlySet<string>): ZonaDelDia {
  const porSector = new Map<string, number>();
  for (const p of pedidos) {
    if (enElLote.has(p.id) || p.lat == null || p.lng == null) continue;
    const sector = sectorDe({ lat: p.lat, lng: p.lng });
    porSector.set(sector, (porSector.get(sector) ?? 0) + 1);
  }
  return [...porSector].map(([sector, n]) => ({ sector, pedidos: n })).sort((a, b) => b.pedidos - a.pedidos);
}

/** Una pregunta del lote: la dirección escrita y los pedidos que la llevan. El mismo destino
 *  (recortado y en minúsculas) se pregunta una sola vez y cada pedido se queda con la respuesta. */
type Consulta = { direccion: string; pedidos: Pedido[] };

function agruparPorDestino(pendientes: Pedido[]): Consulta[] {
  const porTexto = new Map<string, Consulta>();
  for (const p of pendientes) {
    const clave = p.direccion.trim().toLowerCase();
    const ya = porTexto.get(clave);
    if (ya) ya.pedidos.push(p);
    else porTexto.set(clave, { direccion: p.direccion, pedidos: [p] });
  }
  return [...porTexto.values()];
}

/** Lo que pregunta la IA por un grupo de direcciones: un resultado por dirección, en el mismo
 *  orden. Lanza IANoDisponible, IAOcupada o un error de conexión. Se reemplaza en las pruebas. */
export type Corregir = (direcciones: string[], contexto: { zona: ZonaDelDia; senal?: AbortSignal }) => Promise<ResultadoIA[]>;

const corregirConLaIA: Corregir = async (direcciones, { zona, senal }) =>
  corregirEnLote(await entradasDelLote(direcciones, senal), { zona, senal });

const esperar = (ms: number, senal?: AbortSignal) =>
  new Promise<void>((listo) => {
    const reloj = setTimeout(listo, ms);
    senal?.addEventListener("abort", () => (clearTimeout(reloj), listo()), { once: true });
  });

/** Le pide a la IA una corrección para cada pedido por revisar, en lotes. No cambia nada: guarda
 *  las propuestas para que el conductor las confirme.
 *
 *  Un lote que falla por conexión deja ese y los siguientes como «sin señal» (se pueden volver a
 *  pedir). Un 429 se reintenta una vez. Sin IA en el servidor no se sigue. */
export async function corregirDirecciones(
  fecha: string,
  {
    alAvanzar,
    corregir = corregirConLaIA,
    ids,
    excluir = [],
    senal,
    enLinea = hayRed,
  }: {
    /** (hechos, total) para la barra de avance. */
    alAvanzar?: (hechos: number, total: number) => void;
    corregir?: Corregir;
    /** Solo estos pedidos (los de la carga recién hecha), no todo el día. */
    ids?: string[];
    /** Los que ya tienen una propuesta a la vista: no se vuelve a pagar por ellos. */
    excluir?: string[];
    /** «Detener ubicación»: corta sin esperar la respuesta en curso. */
    senal?: AbortSignal;
    enLinea?: () => boolean;
  } = {},
): Promise<ResumenCorreccion> {
  const soloEstos = ids ? new Set(ids) : null;
  const delDia = await leerPedidos(fecha);
  const pendientes = delDia
    // Los que ya tienen una propuesta guardada no se vuelven a pagar.
    .filter((p) => porRevisar(p, soloEstos) && !conPropuestaVigente(p) && !excluir.includes(p.id))
    .slice(0, MAX_DIRECCIONES_POR_TANDA);
  const resumen: ResumenCorreccion = { propuestas: [], sinArreglo: 0, sinIA: false, sinSenal: 0 };
  if (pendientes.length === 0) return resumen;
  if (!enLinea()) return { ...resumen, sinSenal: pendientes.length };

  const total = pendientes.length;
  const orden = new Map(pendientes.map((p, i) => [p.id, i]));
  const zona = zonaDelDia(delDia, new Set(orden.keys()));
  const consultas = agruparPorDestino(pendientes);
  const propuestas: { i: number; propuesta: PropuestaCorreccion }[] = [];
  let hechos = 0;
  alAvanzar?.(0, total);

  async function aplicar(c: Consulta, r: Exclude<ResultadoIA, { tipo: "error" }>): Promise<void> {
    for (const p of c.pedidos) {
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
        propuestas.push({ i: orden.get(p.id)!, propuesta: propuestaDe(p, guardada) });
      } else {
        resumen.sinArreglo++;
      }
    }
  }

  const contar = (cs: Consulta[]) => cs.reduce((s, c) => s + c.pedidos.length, 0);
  for (let desde = 0; desde < consultas.length; desde += LOTE_MAXIMO) {
    if (senal?.aborted) break;
    const lote = consultas.slice(desde, desde + LOTE_MAXIMO);
    let resultados: ResultadoIA[] | null = null;
    let reintentado = false;
    try {
      for (;;) {
        try {
          resultados = await hastaAbortar(corregir(lote.map((c) => c.direccion), { zona, senal }), senal);
          break;
        } catch (e) {
          // 429 (spec 038): la IA existe y hay conexión; se espera un poco y se pide una vez más.
          if (e instanceof IAOcupada && !reintentado) {
            reintentado = true;
            await esperar(MS_ANTES_DE_REINTENTAR, senal);
            if (senal?.aborted) break;
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      if (e instanceof IANoDisponible) return { ...resumen, propuestas: enOrden(propuestas), sinIA: true };
      // Sin conexión (o la IA no contestó): este lote y los que faltan quedan para después.
      resumen.sinSenal += contar(consultas.slice(desde));
      break;
    }
    if (resultados == null || senal?.aborted) break;
    for (const [k, c] of lote.entries()) {
      const r = resultados[k] ?? { tipo: "sin_arreglo", motivo: "La IA no la contestó." };
      if (r.tipo === "error") resumen.sinSenal += c.pedidos.length;
      else await aplicar(c, r);
    }
    hechos += contar(lote);
    alAvanzar?.(hechos, total);
  }

  return { ...resumen, propuestas: enOrden(propuestas) };
}

const enOrden = (xs: { i: number; propuesta: PropuestaCorreccion }[]) => [...xs].sort((a, b) => a.i - b.i).map((x) => x.propuesta);

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
    // La eligió el conductor de la lista: no queda «aproximada».
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
    // Spec 040: la cuadra o la calle siguen siendo «Aproximada» en pantalla.
    p.soloCalle || p.enLaCuadra,
  );
}
