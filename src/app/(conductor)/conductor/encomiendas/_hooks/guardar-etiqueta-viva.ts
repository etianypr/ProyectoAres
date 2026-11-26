"use client";

// Guardar una etiqueta leída con el escáner en vivo (spec 028): solo lo firme y la foto del
// paquete, si es de esta etiqueta. Salió de use-escaner-vivo.ts (A7, 400 líneas).

import { leerEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import type { CodigoEtiqueta } from "@/lib/encomiendas/lectura/codigo-barras";
import { fotoEsDe, soloLoFirme } from "@/lib/encomiendas/lectura/etiqueta/sesion-viva";
import { resultadoVotos, sumarCuadro, type ResultadoVotos, type Votos } from "@/lib/encomiendas/lectura/etiqueta/votos";
import { aplicarLecturaEtiqueta, guardarFoto, type Pedido, type ResultadoEscaneo } from "@/lib/encomiendas/local/almacen";
import { comprimirFoto } from "@/lib/encomiendas/local/foto";
import { ofValida } from "@/lib/encomiendas/paquete";
import { capturarViva } from "@/lib/nativo/escaner-vivo";

export type Foto = Awaited<ReturnType<typeof capturarViva>>;

/** La foto del cuadro la entrega el próximo cuadro leído: si la cámara deja de mandar
 *  cuadros, la etiqueta se guarda sin foto en vez de quedar esperando. */
const TOPE_FOTO_MS = 4000;
export const fotoConTope = () =>
  Promise.race([capturarViva(), new Promise<null>((listo) => setTimeout(() => listo(null), TOPE_FOTO_MS))]);

/** Al guardar lo leído, el bulto que sumó la etiqueta sigue siendo el de «−1
 *  bulto» (spec 033): la lectura de cierre no suma ninguno. */
const conSuma = (nuevo: ResultadoEscaneo, de: ResultadoEscaneo): ResultadoEscaneo => ({
  ...nuevo,
  bultoAMano: de.bultoAMano,
  bultoSumado: de.bultoSumado,
  bultosAntes: de.bultosAntes,
  // La OF corregida por el código (spec 039) se sigue viendo después de guardar la foto.
  ofAntes: nuevo.ofAntes ?? de.ofAntes,
});

/** Guarda en el pedido lo firme de la etiqueta y su foto. `fotoDelCuadro`: la foto salió de
 *  un cuadro que ya se leyó como cuadro, así que su texto no vota otra vez (contaría doble).
 *  Si falla el guardado local, la parada ya quedó contada: devuelve lo que había. */
export async function guardarEtiquetaLeida(
  fecha: string,
  e: { codigo: CodigoEtiqueta; votos: Votos | null; r: ResultadoEscaneo },
  foto: Foto,
  fotoDelCuadro: boolean,
  /** El conductor corrigió el teléfono a mano (✎): lo leído no lo pisa. */
  telefonoAMano = false,
): Promise<{ r: ResultadoEscaneo; resultado: ResultadoVotos | null; conDato: boolean }> {
  // Solo la foto de esta etiqueta: si el conductor ya pasó a otra caja, es de otra persona.
  const suya = foto !== null && fotoEsDe(foto, e.codigo.of);
  let votos = e.votos;
  if (foto && suya && !fotoDelCuadro) votos = sumarCuadro(votos, e.codigo, foto.texto.trim() ? leerEtiqueta(foto.texto) : null);
  const resultado = votos ? resultadoVotos(votos) : null;
  const firmes = resultado ? soloLoFirme(resultado) : null;
  if (firmes && telefonoAMano) firmes.telefono = null;
  const conDato = Boolean(telefonoAMano || (firmes && (firmes.destinatario || firmes.telefono || firmes.porPagar != null)));
  let r = e.r;
  try {
    if (resultado && firmes) {
      const nuevo = await aplicarLecturaEtiqueta(fecha, { ...firmes, of: e.codigo.of, bulto: null, ofConfirmada: resultado.ofConfirmada });
      if (nuevo) r = conSuma(nuevo, r);
    }
    if (foto && suya && !r.pedido.fotoId) {
      await guardarFoto(r.pedido.id, await comprimirFoto(foto.imagen));
      const conFoto = await aplicarLecturaEtiqueta(fecha, { of: e.codigo.of, bulto: null });
      if (conFoto) r = conSuma(conFoto, r);
    }
  } catch {
    // La parada ya quedó contada: sigue con lo que había.
  }
  return { r, resultado, conDato };
}

// ------------------------------------------------------------ etiqueta que no está en el día

/** Lo leído de una etiqueta cuya OF no está en el día, para el pedido nuevo (dueño, 2026-11-25:
 *  «debería escanear todo y al crear el pedido se guarde todo lo ligado a esa parada»). Solo
 *  lo firme, como al leer una del día. La dirección viene solo si se leyó clara. */
export type EtiquetaParaPedido = {
  of: string;
  bulto: number | null;
  nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  porPagar: boolean | null;
  montoPorPagar: number | null;
  bultos: number | null;
  foto: Foto;
};

export function etiquetaParaPedido(codigo: CodigoEtiqueta, votos: Votos | null, foto: Foto): EtiquetaParaPedido {
  const firmes = votos ? soloLoFirme(resultadoVotos(votos)) : null;
  return {
    of: codigo.of,
    bulto: codigo.bulto,
    nombre: firmes?.destinatario ?? null,
    telefono: firmes?.telefono ?? null,
    direccion: firmes?.direccion ?? null,
    porPagar: firmes?.porPagar ?? null,
    montoPorPagar: firmes?.montoPorPagar ?? null,
    bultos: firmes?.bultosTotal ?? null,
    // Solo la foto de esta etiqueta: si ya había otra caja en la cámara, es de otra persona.
    foto: foto && fotoEsDe(foto, codigo.of) ? foto : null,
  };
}

/** Desde el escáner de Google (o sin lectura): solo la OF, como antes. */
export const soloLaOf = (of: string): EtiquetaParaPedido => etiquetaParaPedido({ of, bulto: null }, null, null);

/** El pedido nuevo de la etiqueta ya guardado (con nombre, teléfono y pago): se cuenta su
 *  bulto y se guarda la foto, como al leer una etiqueta del día. Si el conductor cambió la OF
 *  en el formulario, ya no es esta etiqueta. */
export async function completarPedidoDeEtiqueta(fecha: string, pedido: Pedido, e: EtiquetaParaPedido): Promise<void> {
  const of = ofValida(e.of);
  if (!of || pedido.of !== of) return;
  await aplicarLecturaEtiqueta(fecha, { of, bulto: e.bulto, escaneo: true });
  if (e.foto && !pedido.fotoId) await guardarFoto(pedido.id, await comprimirFoto(e.foto.imagen));
}
