// El escáner en vivo de etiquetas (spec 028), cuadro a cuadro: qué hacer con cada uno. Puro.
// Salió de use-escaner-vivo.ts (fotos del dueño, 2026-11-25) para probarlo con cuadros
// inventados; el hook guarda, suena y muestra.
//
//   · Una etiqueta es su OF y su bulto: el bulto 2 de la misma OF es otra caja y se cuenta
//     (antes se tomaba por la misma etiqueta y nunca sumaba).
//   · Con dos cajas en el cuadro, se sigue con la que ya se estaba leyendo.
//   · El texto de un cuadro con dos OF distintas no cuenta: no se sabe de cuál es.
//   · Un cuadro sin código cuenta para la etiqueta si su código se vio hace menos de
//     CONTINUIDAD_MS (ML Kit no lee el código en todos los cuadros); sin verlo SALIDA_MS,
//     salió de la cámara. Los dos se miden con el reloj de la cámara (avanzarReloj), que no
//     cuenta las trabas: con el reloj de verdad, una traba de 2 s y un cuadro sin código
//     cerraban a medias la etiqueta que seguía en la mano.
//   · Una etiqueta cerrada a medias (salió o llegó otra) se sigue leyendo si su código
//     vuelve, hasta quedar completa. Antes quedaba en «Solo el código» para siempre.
//   · Etiqueta girada: el código se lee en cualquier sentido, pero el texto al revés sale
//     ilegible (6 de las 20 fotos estaban de costado o al revés). Si en varios cuadros con
//     código hay texto sin ninguna palabra de la etiqueta, se prueba el texto girado.

import { codigosEnLaFoto, type CodigoEtiqueta } from "../codigo-barras";
import { leerEtiqueta, type LecturaEtiqueta } from "./index";
import { comparable, palabra } from "./normalizar";
import { resultadoVotos, sumarCuadro, type ResultadoVotos, type Votos } from "./votos";

/** Un cuadro sin código sigue contando para la etiqueta si su código se vio hace menos de
 *  esto. */
export const CONTINUIDAD_MS = 700;
/** Sin ver el código de la etiqueta este tiempo, salió de la cámara: se cierra. */
export const SALIDA_MS = 1500;
/** Entre dos cuadros, el reloj de la cámara avanza a lo más esto. Un cuadro normal llega
 *  cada 120 a 320 ms (specs 029 y 034); una traba deja 1 a 5 s sin cuadros (spec 028). */
export const TOPE_HUECO_MS = 500;

/** `real`: cuándo llegó el último cuadro (0: recién prendida o tras una pausa); `camara`:
 *  el tiempo con cuadros llegando, que es lo que miden CONTINUIDAD_MS y SALIDA_MS. */
export type RelojCamara = { real: number; camara: number };
export const RELOJ_INICIAL: RelojCamara = { real: 0, camara: 0 };

/** El reloj con un cuadro más: el hueco desde el anterior cuenta hasta TOPE_HUECO_MS. Si la
 *  cámara se trabó, la etiqueta no estuvo fuera de ella: estuvo sin cuadros. */
export function avanzarReloj(r: RelojCamara, ahora: number): RelojCamara {
  const hueco = r.real ? Math.min(Math.max(ahora - r.real, 0), TOPE_HUECO_MS) : 0;
  return { real: ahora, camara: r.camara + hueco };
}

export type EtiquetaEnCurso = {
  codigo: CodigoEtiqueta;
  votos: Votos | null;
  /** Cuándo se vio su código por última vez (reloj de la cámara). */
  ultimoCodigo: number;
  /** Quedó completa: no se lee más. */
  leida: boolean;
  /** Se cerró con lo firme sin quedar completa: si su código vuelve, se sigue leyendo. */
  aMedias?: boolean;
};

export type Paso =
  | { tipo: "nada" }
  /** La etiqueta en curso salió de la cámara sin quedar leída: se cierra con lo firme. */
  | { tipo: "salio" }
  /** Otra etiqueta: la anterior, si no quedó leída, se cierra con lo firme. */
  | { tipo: "nueva"; codigo: CodigoEtiqueta; votos: Votos | null }
  /** Un cuadro más de la etiqueta en curso; `listo`: todo firme, se cierra completa. */
  | { tipo: "sumar"; votos: Votos | null; conCodigo: boolean; listo: boolean };

/** ¿La misma caja? Misma OF y mismo bulto; la OF escrita a mano no trae bulto y vale por
 *  cualquiera. */
export function mismaEtiqueta(a: CodigoEtiqueta, b: CodigoEtiqueta): boolean {
  return a.of === b.of && (a.bulto == null || b.bulto == null || a.bulto === b.bulto);
}

/** Qué hacer con un cuadro. `ofAMano`: la OF escrita (código dañado); un cuadro cuyo texto
 *  la trae impresa cuenta como su código. */
export function pasoDelCuadro(
  actual: EtiquetaEnCurso | null,
  cuadro: { codigos: string[]; texto: string },
  ahora: number,
  ofAMano: string | null = null,
): { paso: Paso; lectura: LecturaEtiqueta | null; conCodigo: boolean } {
  const enCuadro = codigosEnLaFoto(cuadro.codigos);
  const ofs = new Set(enCuadro.map((c) => c.of));
  const lectura = cuadro.texto.trim() && ofs.size <= 1 ? leerEtiqueta(cuadro.texto) : null;
  const manual = ofAMano && lectura?.ofImpresa === ofAMano ? { of: ofAMano, bulto: null } : null;
  const codigo = (actual && enCuadro.find((c) => mismaEtiqueta(c, actual.codigo))) ?? enCuadro[0] ?? manual;
  const conCodigo = enCuadro.length > 0;
  const nada = { paso: { tipo: "nada" } as Paso, lectura, conCodigo };

  if (!codigo) {
    if (!actual || actual.leida || actual.aMedias) return nada;
    if (ahora - actual.ultimoCodigo < CONTINUIDAD_MS) {
      return { paso: { tipo: "sumar", votos: sumarCuadro(actual.votos, actual.codigo, lectura), conCodigo: false, listo: false }, lectura, conCodigo };
    }
    return ahora - actual.ultimoCodigo > SALIDA_MS ? { paso: { tipo: "salio" }, lectura, conCodigo } : nada;
  }
  if (!actual || !mismaEtiqueta(actual.codigo, codigo)) {
    return { paso: { tipo: "nueva", codigo, votos: sumarCuadro(null, codigo, lectura) }, lectura, conCodigo };
  }
  const votos = sumarCuadro(actual.votos, codigo, lectura);
  const listo = !actual.leida && votos !== null && resultadoVotos(votos).listo;
  return { paso: { tipo: "sumar", votos, conCodigo: true, listo }, lectura, conCodigo };
}

/** Solo lo firme va al pedido: lo visto una vez o empatado queda sin leer. */
export function soloLoFirme(v: ResultadoVotos): LecturaEtiqueta {
  const l = v.lectura;
  const firme = (dudoso: string) => !l.dudosos.includes(dudoso);
  return {
    ...l,
    destinatario: firme("destinatario") ? l.destinatario : null,
    telefono: firme("telefono") ? l.telefono : null,
    direccion: firme("direccion") ? l.direccion : null,
    porPagar: firme("pago") ? l.porPagar : null,
    montoPorPagar: firme("montoPorPagar") ? l.montoPorPagar : null,
  };
}

/** ¿La foto que se sacó al cerrar es de esta etiqueta? Su código de Starken (y ningún otro)
 *  o, sin código, su OF impresa. Antes se guardaba cualquiera: si el conductor ya había
 *  pasado a otra caja, el pedido quedaba con la etiqueta de otra persona. */
export function fotoEsDe(foto: { codigos: string[]; texto: string }, of: string): boolean {
  const codigos = codigosEnLaFoto(foto.codigos);
  if (codigos.length) return codigos.every((c) => c.of === of);
  return Boolean(foto.texto.trim()) && leerEtiqueta(foto.texto).ofImpresa === of;
}

// ------------------------------------------------------------------ etiqueta girada

/** En qué orden se prueba el giro del texto: al revés es lo más común en el auto. */
export const GIROS = [0, 180, 90, 270] as const;
export type Giro = (typeof GIROS)[number];
/** Cuadros seguidos con código y texto sin ninguna palabra de la etiqueta antes de girar. */
export const CUADROS_PARA_GIRAR = 3;
/** Con menos letras, la etiqueta está lejos o movida: no dice nada del giro. */
const LETRAS_MINIMAS = 30;
/** Lo que se lee hasta de lejos en toda etiqueta derecha (la letra grande de abajo dice
 *  «R15 ARICA DOMICILIO» o «HUB ARICA»). */
const ANCLAS = palabra("ARICA", "STARKEN", "RAMPA", "DESTINATARIO", "DIRECCION", "BULTO", "DOMICILIO", "HUB");

export type EstadoGiro = { giro: Giro; sinAncla: number };

export const GIRO_INICIAL: EstadoGiro = { giro: 0, sinAncla: 0 };

/** El giro con que se lee el texto de los cuadros siguientes. Se queda con el que sirvió
 *  (las cajas de una pila suelen venir igual) y prueba el siguiente tras
 *  CUADROS_PARA_GIRAR cuadros con código y texto ilegible. */
export function siguienteGiro(e: EstadoGiro, conCodigo: boolean, texto: string): EstadoGiro {
  if (!conCodigo) return e;
  if (ANCLAS.test(comparable(texto))) return e.sinAncla ? { giro: e.giro, sinAncla: 0 } : e;
  if ((texto.match(/\p{L}/gu)?.length ?? 0) < LETRAS_MINIMAS) return e;
  if (e.sinAncla + 1 < CUADROS_PARA_GIRAR) return { giro: e.giro, sinAncla: e.sinAncla + 1 };
  return { giro: GIROS[(GIROS.indexOf(e.giro) + 1) % GIROS.length], sinAncla: 0 };
}
