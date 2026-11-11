"use client";

// Barrer la nómina de reparto con la cámara en vivo (dueño, 2026-11-11: la nómina es
// larga para sacarle fotos). La cámara de ARES queda abierta debajo de la pantalla y
// cada cuadro se lee con ML Kit, en el teléfono: sin red, sin IA, y la nómina (que trae
// el nombre del destinatario) no sale del teléfono. La usan «Cargar la guía» → «Barrer
// la nómina» y Diagnóstico → «Probar barrido de nómina».
//
// Los votos y la OF dígito por dígito están en lib/encomiendas/lectura/barrido-nomina.ts.
// Aquí va lo de la pantalla: la cámara, los recuadros sobre cada encargo (los dibuja
// Android, MarcasEscaner.java) y, una vez por segundo, qué OF quedaron confirmadas.

import { useEffect, useRef, useState } from "react";
import { prepararSonidos, sonarTic } from "@/lib/comun/sonidos-escaner";
import {
  cajasDelCuadro,
  confianzasDelCuadro,
  filasDe,
  mejorResultado,
  resultadoNomina,
  sumarCuadroNomina,
  votosNominaVacios,
  type VotosNomina,
} from "@/lib/encomiendas/lectura/barrido-nomina";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { alBotonAtras } from "@/lib/nativo/entorno";
import {
  avisarLectura,
  barridoDisponible,
  iniciarEscanerVivo,
  marcarEscanerVivo,
  type CuadroVivo,
  type MarcaViva,
} from "@/lib/nativo/escaner-vivo";
import type { EstadoBarrido, VistaBarrido } from "../_componentes/camara-barrido";

/** Cada cuánto se revisa lo leído. Con la cámara encendida, cada redibujo traba la
 *  pantalla del teléfono del conductor 1 a 5 s (spec 028): se redibuja a lo más una
 *  vez por revisión, y solo si algo cambió. */
const REVISAR_MS = 1000;
/** Cuadros sin texto (o sin un bloque entero) para avisar que no está leyendo: ~1 s. */
const CUADROS_SIN_LEER = 12;
/** La página transparente sobre la cámara (spec 028) y, solo al barrer, sin nada detrás:
 *  la pantalla del día invisible trababa cada redibujo (tema-dashund.css, camara-sola). */
const CLASES_CAMARA = ["camara-viva", "camara-sola"];
/** Cuánto dura el ✓ de una OF recién confirmada; después queda como «cargada». */
const RECIEN_MS = 2000;

/** Lo leído en un barrido. */
export type Barrido = {
  inicio: number;
  msTotal: number;
  conTexto: number;
  /** Las dos formas de juntar los renglones de un cuadro (por filas o como los entrega
   *  ML Kit): todavía se mide cuál arma mejor los encargos. */
  porFilas: VotosNomina;
  comoLlegan: VotosNomina;
  /** El cuadro con más renglones, por filas: la muestra de «Copiar anonimizado». */
  muestra: { texto: string; renglones: number };
};

/** Lo que necesitan los recuadros de cada cuadro; se actualiza una vez por segundo.
 *  `confirmadaEn`: cuándo quedó confirmada cada OF. */
type Marcado = Pick<VistaBarrido, "deLectura"> & { confirmadaEn: Map<string, number> };

const nuevo = (): Barrido => ({
  inicio: Date.now(),
  msTotal: 0,
  conTexto: 0,
  porFilas: votosNominaVacios(),
  comoLlegan: votosNominaVacios(),
  muestra: { texto: "", renglones: 0 },
});

/** El resultado de un barrido, con la forma de juntar los renglones que confirmó más. */
export function resultadoDelBarrido(b: Barrido) {
  return mejorResultado(resultadoNomina(b.porFilas), resultadoNomina(b.comoLlegan));
}

function vistaDe(b: Barrido): VistaBarrido {
  const r = resultadoDelBarrido(b);
  const ultimo = b.porFilas.cuadros - 1;
  const conLineas = Math.max(b.porFilas.ultimoConLineas, b.comoLlegan.ultimoConLineas);
  const estado: EstadoBarrido =
    ultimo - b.porFilas.ultimoConTexto > CUADROS_SIN_LEER
      ? "sinTexto"
      : ultimo - conLineas > CUADROS_SIN_LEER
        ? "sinBloques"
        : "leyendo";
  // Se barre de arriba abajo: la última confirmada es la más abajo en la nómina.
  const ultima = r.lineas.findLast((l) => l.firme) ?? null;
  return {
    estado,
    firmes: r.firmes,
    porConfirmar: r.porConfirmar,
    total: r.total,
    ultima: ultima ? { of: ultima.of, destino: ultima.destino } : null,
    confirmadas: new Set(r.lineas.filter((l) => l.firme).map((l) => l.of)),
    deLectura: r.deLectura,
  };
}

/** Los recuadros de un cuadro: uno por encargo, con su OF escrita arriba (dueño,
 *  2026-11-11: «si me marcas con rectángulos pequeños no entiendo qué estoy leyendo»).
 *  Punteado con «…» si se está leyendo; verde con ✓ solo al confirmarse (RECIEN_MS), y
 *  después una línea fina sin etiqueta: una OF ya cargada no vuelve a salir con ✓ al
 *  pasar de nuevo por ella («me confundo del progreso de la boleta»). Un cuadro que
 *  leyó mal un dígito de una OF confirmada la marca igual (`deLectura`). */
function marcasDe(c: CuadroVivo, filas: ReturnType<typeof filasDe>, marcado: Marcado): MarcaViva[] {
  const ahora = Date.now();
  return cajasDelCuadro(c.renglones, filas).map((e): MarcaViva => {
    const of = marcado.deLectura[e.of] ?? e.of;
    const confirmada = marcado.confirmadaEn.get(of);
    const caja = { x: e.x, y: e.y, ancho: e.ancho, alto: e.alto };
    if (confirmada == null) return { ...caja, tipo: "leyendo", etiqueta: `… ${formatoOf(of)}` };
    if (ahora - confirmada < RECIEN_MS) return { ...caja, tipo: "confirmada", etiqueta: `✓ ${formatoOf(of)}` };
    return { ...caja, tipo: "cargada" };
  });
}

// Las confirmadas no se comparan: crecen solo cuando crece `firmes`.
const igual = (a: VistaBarrido | null, b: VistaBarrido) =>
  a != null &&
  a.estado === b.estado &&
  a.firmes === b.firmes &&
  a.porConfirmar === b.porConfirmar &&
  a.total === b.total &&
  a.ultima?.of === b.ultima?.of &&
  a.ultima?.destino === b.ultima?.destino;

/** ¿Esta APK trae el barrido de la nómina? Se sabe después de abrir la pantalla. */
export function useBarridoDisponible(): boolean {
  const [disponible, setDisponible] = useState(false);
  useEffect(() => {
    let vivo = true;
    void barridoDisponible().then((si) => vivo && setDisponible(si));
    return () => {
      vivo = false;
    };
  }, []);
  return disponible;
}

/** La cámara del barrido. `alTerminar` recibe lo leído cuando se termina, con el botón
 *  o con atrás de Android. */
export function useBarridoNomina(alTerminar: (b: Barrido) => void) {
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conLinterna, setConLinterna] = useState(false);
  const [vista, setVista] = useState<VistaBarrido | null>(null);
  const apagar = useRef<(() => Promise<void>) | null>(null);
  const barrido = useRef<Barrido>(nuevo());
  const sonadas = useRef(0);
  const marcado = useRef<Marcado>({ confirmadaEn: new Map(), deLectura: {} });
  const terminarCon = useRef(alTerminar);
  useEffect(() => {
    terminarCon.current = alTerminar;
  }, [alTerminar]);

  function alCuadro(c: CuadroVivo) {
    const b = barrido.current;
    b.msTotal += c.ms;
    if (c.renglones.length) b.conTexto += 1;
    const filas = filasDe(c.renglones);
    const porFilas = filas.map((f) => f.texto).join("\n");
    const confianzas = confianzasDelCuadro(c.renglones);
    b.porFilas = sumarCuadroNomina(b.porFilas, porFilas, confianzas);
    b.comoLlegan = sumarCuadroNomina(b.comoLlegan, c.renglones.map((r) => r.texto).join("\n"), confianzas);
    if (c.renglones.length > b.muestra.renglones) b.muestra = { texto: porFilas, renglones: c.renglones.length };
    marcarEscanerVivo(marcasDe(c, filas, marcado.current));
  }

  async function iniciar() {
    setError(null);
    setVista(null);
    barrido.current = nuevo();
    sonadas.current = 0;
    marcado.current = { confirmadaEn: new Map(), deLectura: {} };
    prepararSonidos();
    document.documentElement.classList.add(...CLASES_CAMARA);
    setActivo(true);
    try {
      // Sin la foto en alta: la cámara da cuadros de 1080×1920 en vez de 720×960.
      const { camara, apagar: apagarCamara } = await iniciarEscanerVivo(alCuadro, { captura: false });
      apagar.current = apagarCamara;
      setConLinterna(camara.linterna);
      barrido.current.inicio = Date.now();
      setVista({ estado: "sinTexto", firmes: 0, porConfirmar: 0, total: null, ultima: null, confirmadas: new Set(), deLectura: {} });
    } catch (e) {
      document.documentElement.classList.remove(...CLASES_CAMARA);
      setActivo(false);
      setError(e instanceof Error && /permiso/.test(e.message) ? "Sin permiso de cámara." : "La cámara no abrió.");
    }
  }

  async function terminar() {
    await apagar.current?.();
    apagar.current = null;
    document.documentElement.classList.remove(...CLASES_CAMARA);
    setActivo(false);
    terminarCon.current(barrido.current);
  }

  // Una vez por segundo: se decide qué OF quedaron firmes (dígito por dígito), suena
  // un tic y vibra si se confirmó alguna, y se redibuja solo si cambió algo.
  useEffect(() => {
    if (!activo) return;
    const reloj = setInterval(() => {
      if (barrido.current.porFilas.cuadros === 0) return;
      const nueva = vistaDe(barrido.current);
      const confirmadaEn = marcado.current.confirmadaEn;
      for (const of of nueva.confirmadas) if (!confirmadaEn.has(of)) confirmadaEn.set(of, Date.now());
      marcado.current = { confirmadaEn, deLectura: nueva.deLectura };
      if (nueva.firmes > sonadas.current) {
        sonadas.current = nueva.firmes;
        sonarTic(0);
        void avisarLectura();
      }
      setVista((antes) => (igual(antes, nueva) ? antes : nueva));
    }, REVISAR_MS);
    return () => clearInterval(reloj);
  }, [activo]);

  // Atrás de Android termina igual que el botón: lo leído no se pierde.
  useEffect(() => {
    if (!activo) return;
    // `terminar` lee todo por referencias: basta con engancharlo al prender.
    const soltar = alBotonAtras(() => void terminar());
    return () => soltar();
  }, [activo]);
  // Salir de la pantalla con la cámara prendida la apaga, sin aplicar lo leído.
  useEffect(
    () => () => {
      void apagar.current?.();
      document.documentElement.classList.remove(...CLASES_CAMARA);
    },
    [],
  );

  return { activo, error, vista, conLinterna, iniciar, terminar };
}
