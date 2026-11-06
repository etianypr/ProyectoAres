// La carga del día desde la guía y el escaneo de cada etiqueta (spec 005).
//
// La OF es la llave: une la línea de la guía, el pedido, su parada y la etiqueta.
// La guía trae solo OF y destino; nombre, teléfono y pago llegan al escanear.

import { uuidv7 } from "@/lib/comun/uuid";
import { STORES, escribir } from "../idb";
import { enFila } from "./fila";
import { leerPedidos, leerRuta, pedidosEnOrden } from "./lecturas";
import { avisoVacio } from "./migrar";
import type { OrigenCarga, Pedido, ReferenciaPaquete } from "./tipos";

export type LineaParaCrear = { of: string; destino: string };

/** Un pedido por línea de la guía, sin ubicar (la ubicación sigue el flujo de
 *  siempre). Una OF que ya está en el día no se duplica: cargar la guía dos
 *  veces, o una foto que se superpone, no crea pedidos de más. */
export function crearDesdeGuia(
  lineas: LineaParaCrear[],
  fecha: string,
  { folio, origen }: { folio: string | null; origen: Extract<OrigenCarga, "guia_ia" | "guia_foto" | "guia_pegada"> },
): Promise<{ creados: Pedido[]; yaEstaban: number }> {
  return enFila(async () => {
    const existentes = new Set((await leerPedidos(fecha)).map((p) => p.of).filter(Boolean));
    const ahora = new Date().toISOString();
    const creados: Pedido[] = [];
    let yaEstaban = 0;
    for (const { of, destino } of lineas) {
      if (existentes.has(of)) {
        yaEstaban++;
        continue;
      }
      existentes.add(of);
      creados.push({
        id: uuidv7(),
        fecha,
        // Los completa el escaneo de la etiqueta.
        nombre: "",
        telefono: "",
        direccion: destino,
        lat: null,
        lng: null,
        notas: null,
        disponibilidad: "pendiente_respuesta",
        bloqueHorarioId: null,
        aviso: avisoVacio(),
        llamada: "pendiente",
        resultado: "pendiente",
        horaLlamada: null,
        horaResultado: null,
        cargadoEn: ahora,
        of,
        referencia: null,
        fotoId: null,
        bultos: null,
        bultosEscaneados: [],
        porPagar: null,
        montoPorPagar: null,
        folioGuia: folio,
        origenCarga: origen,
      });
    }
    await escribir([STORES.pedidos], ({ guardar }) => {
      for (const p of creados) guardar(STORES.pedidos, p);
    });
    return { creados, yaEstaban };
  });
}

/** Lo que se sabe de una etiqueta escaneada. Solo `of` es obligatorio: sin IA
 *  y sin texto pegado, el código de barras ya alcanza para saber la parada. */
export type LecturaParaAplicar = {
  of: string;
  bulto: number | null;
  /** Es un escaneo nuevo (el código leído o la OF escrita) y no un volver a
   *  leer el pedido. Una OF escrita no trae número de bulto: igual suma uno, con
   *  el primer número libre (spec 027). */
  escaneo?: boolean;
  /** El número provisorio que tomó la OF escrita: la etiqueta de esa misma caja
   *  (foto o texto) trae el de verdad en `bulto` y lo reemplaza, sin contar dos. */
  reemplazaBulto?: number | null;
  /** La etiqueta leída trae impresa la misma OF del código: es de ESTE paquete
   *  y lo que dice corrige lo leído antes (spec 017, E4). */
  ofConfirmada?: boolean;
  bultosTotal?: number | null;
  destinatario?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  porPagar?: boolean | null;
  montoPorPagar?: number | null;
  referencia?: ReferenciaPaquete | null;
};

export type ResultadoEscaneo = {
  pedido: Pedido;
  /** Posición en la ruta vigente ("PARADA n de N"); null si no está en la ruta. */
  parada: { n: number; total: number } | null;
  /** La dirección de la etiqueta, si no coincide con la del pedido (FR-014). */
  direccionDistinta: string | null;
  /** El número provisorio que tomó esta OF escrita a mano; null si no hubo. */
  bultoAMano: number | null;
};

/** Los bultos escaneados después de esta lectura (spec 027). El código trae el
 *  número de bulto: uno nuevo suma y la misma etiqueta leída otra vez no (es la
 *  misma caja). La OF escrita no lo trae: cada vez suma uno, con el primer
 *  número libre. */
function contarBulto(antes: number[], l: LecturaParaAplicar): { escaneados: number[]; aMano: number | null } {
  if (l.bulto != null) {
    const base = l.reemplazaBulto != null ? antes.filter((n) => n !== l.reemplazaBulto) : antes;
    return { escaneados: base.includes(l.bulto) ? base : [...base, l.bulto].sort((a, b) => a - b), aMano: null };
  }
  if (!l.escaneo) return { escaneados: antes, aMano: null };
  let libre = 1;
  while (antes.includes(libre)) libre++;
  return { escaneados: [...antes, libre].sort((a, b) => a - b), aMano: libre };
}

const comparable = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,?\s*ARICA\b.*$/i, "")
    .replace(/[^\w]/g, "")
    .toUpperCase();

/** Los pedidos de la guía cuya etiqueta todavía no se escaneó (spec 005, US5):
 *  si no están en el auto, faltan y hay que avisarle a Starken. Solo los que
 *  siguen por visitar; un pedido cargado a mano no tiene etiqueta que esperar. */
export function sinEtiquetaEscaneada(pedidos: Pedido[]): Pedido[] {
  return pedidos.filter(
    (p) => p.origenCarga.startsWith("guia") && p.bultosEscaneados.length === 0 && p.resultado === "pendiente",
  );
}

/** Enlaza la etiqueta con su pedido del día por la OF y completa lo que falte.
 *  Lo ya cargado no se pisa, salvo con una etiqueta de OF confirmada (es la
 *  fuente); la dirección distinta no se cambia sola (se avisa). null = la OF
 *  no está en el día. */
/** Paquetes de la guía escaneados sobre el total de los que siguen por visitar:
 *  el contador de "cargar el auto" (terreno 2026-10-27). */
export function avanceCarga(pedidos: Pedido[]): { escaneados: number; total: number } {
  const deLaGuia = pedidos.filter((p) => p.origenCarga.startsWith("guia") && p.resultado === "pendiente");
  return { escaneados: deLaGuia.filter((p) => p.bultosEscaneados.length > 0).length, total: deLaGuia.length };
}

export function aplicarLecturaEtiqueta(fecha: string, lectura: LecturaParaAplicar): Promise<ResultadoEscaneo | null> {
  return enFila(async () => {
    const [pedidos, ruta] = await Promise.all([leerPedidos(fecha), leerRuta(fecha)]);
    const pedido = pedidos.find((p) => p.of === lectura.of);
    if (!pedido) return null;

    const { escaneados, aMano } = contarBulto(pedido.bultosEscaneados, lectura);
    // Más bultos escaneados que los que se sabían: el envío tiene uno más.
    const conocidos = lectura.bultosTotal ?? pedido.bultos;
    const actualizado: Pedido = {
      ...pedido,
      nombre: (lectura.ofConfirmada && lectura.destinatario) || pedido.nombre || lectura.destinatario || "",
      telefono: (lectura.ofConfirmada && lectura.telefono) || pedido.telefono || lectura.telefono || "",
      bultos: escaneados.length > (conocidos ?? 1) ? escaneados.length : conocidos,
      bultosEscaneados: escaneados,
      porPagar: lectura.porPagar !== undefined && lectura.porPagar !== null ? lectura.porPagar : pedido.porPagar,
      montoPorPagar: lectura.montoPorPagar ?? pedido.montoPorPagar,
      referencia: lectura.referencia ?? pedido.referencia,
    };
    await escribir([STORES.pedidos], ({ guardar }) => guardar(STORES.pedidos, actualizado));

    const enRuta = pedidosEnOrden(ruta, pedidos);
    const indice = enRuta.findIndex((p) => p.id === pedido.id);
    const distinta =
      lectura.direccion && comparable(lectura.direccion) !== comparable(pedido.direccion) ? lectura.direccion : null;
    return {
      pedido: actualizado,
      parada: indice >= 0 ? { n: indice + 1, total: enRuta.length } : null,
      direccionDistinta: distinta,
      bultoAMano: aMano,
    };
  });
}
