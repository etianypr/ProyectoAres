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
//
// Spec 034 (dueño, 2026-11-15): con `seguir`, barrer otra vez continúa la misma lectura,
// y los votos se entregan cada pocos segundos y al bloquearse el celular (`alGuardar`)
// para que nada se pierda si Android cierra ARES.

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
import type { VotosBarrido } from "@/lib/encomiendas/lectura/barrido-a-guia";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { alBotonAtras } from "@/lib/nativo/entorno";
import {
  avisarLectura,
  barridoDisponible,
  exposicionDelBarrido,
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
/** Cuadros sin texto (o sin ninguna OF) para avisar que no está leyendo: ~1 s. */
const CUADROS_SIN_LEER = 12;
/** La página transparente sobre la cámara (spec 028) y, solo al barrer, sin nada detrás:
 *  la pantalla del día invisible trababa cada redibujo (tema-dashund.css, camara-sola). */
const CLASES_CAMARA = ["camara-viva", "camara-sola"];
/** Cada cuánto se entregan los votos para guardarlos, si hubo cuadros nuevos. */
const GUARDAR_MS = 3000;
/** Al volver de un bloqueo, cuánto se espera un cuadro antes de prender la cámara de nuevo. */
const ESPERA_CAMARA_MS = 2000;

/** Lo leído en un barrido. */
export type Barrido = VotosBarrido & {
  inicio: number;
  msTotal: number;
  conTexto: number;
  /** Cuadros de esta pasada (los votos pueden venir de una anterior). */
  cuadros: number;
  /** Los cuadros por segundo fijos que puso la cámara (0: exposición automática). */
  cuadrosFijos: number;
  /** Solo en Diagnóstico: los mismos cuadros contando también las piezas (las OF que
   *  entran al cuadro sin su dirección; apagadas, spec 034), para seguir midiéndolas. */
  conPiezas: VotosNomina | null;
  /** El cuadro con más renglones, por filas: la muestra de «Copiar anonimizado». */
  muestra: { texto: string; renglones: number };
};

export type OpcionesBarrido = {
  /** Atrás de Android termina el barrido (por defecto). «Cargar la guía» lo atiende ella. */
  conAtras?: boolean;
  /** Barrer otra vez sigue la misma lectura en vez de partir de cero. */
  seguir?: boolean;
  /** Los votos guardados de antes (el borrador), si esta lectura todavía no tiene. */
  previo?: () => VotosBarrido | null;
  /** Los votos para guardar. `urgente`: el celular se está bloqueando. */
  alGuardar?: (votos: VotosBarrido, urgente: boolean) => void;
  comparar?: boolean;
};

/** Lo que necesitan los recuadros de cada cuadro; se actualiza una vez por segundo. */
type Marcado = Pick<VistaBarrido, "deLectura" | "confirmadas"> & { aMedias: Set<string> };

const marcadoVacio = (): Marcado => ({ confirmadas: new Set(), aMedias: new Set(), deLectura: {} });

const nuevo = (votos: VotosBarrido | null = null, comparar = false): Barrido => ({
  inicio: Date.now(),
  msTotal: 0,
  conTexto: 0,
  cuadros: 0,
  cuadrosFijos: 0,
  porFilas: votos?.porFilas ?? votosNominaVacios(),
  comoLlegan: votos?.comoLlegan ?? votosNominaVacios(),
  conPiezas: comparar ? votosNominaVacios() : null,
  muestra: { texto: "", renglones: 0 },
});

const votosDe = (b: Barrido): VotosBarrido => ({ porFilas: b.porFilas, comoLlegan: b.comoLlegan });

/** El resultado de un barrido, con la forma de juntar los renglones que confirmó más. */
export function resultadoDelBarrido(b: VotosBarrido) {
  return mejorResultado(resultadoNomina(b.porFilas), resultadoNomina(b.comoLlegan));
}

function leerBarrido(b: Barrido): { vista: VistaBarrido; marcado: Marcado } {
  const r = resultadoDelBarrido(b);
  const ultimo = b.porFilas.cuadros - 1;
  const conLineas = Math.max(b.porFilas.ultimoConLineas, b.comoLlegan.ultimoConLineas);
  const estado: EstadoBarrido =
    b.cuadros === 0 || ultimo - b.porFilas.ultimoConTexto > CUADROS_SIN_LEER
      ? "sinTexto"
      : ultimo - conLineas > CUADROS_SIN_LEER
        ? "sinBloques"
        : "leyendo";
  // Leída = número firme y con dirección. Se barre de arriba abajo: la última
  // confirmada es la más abajo en la nómina.
  const leidas = r.lineas.filter((l) => l.firme && l.destino);
  const ultima = leidas.at(-1) ?? null;
  const enMedias = r.lista.filter((l) => l.estado === "aMedias").map((l) => l.of);
  const vista: VistaBarrido = {
    estado,
    firmes: r.firmes,
    porConfirmar: r.porConfirmar,
    total: r.total,
    ultima: ultima ? { of: ultima.of, destino: ultima.destino } : null,
    confirmadas: new Set(leidas.map((l) => l.of)),
    deLectura: r.deLectura,
    // Lo que hay que volver a pasar: el número sin firmar o el encargo a medias. Una
    // dirección dudosa con el número firme no: se confirma en la revisión, con el papel.
    faltan: r.lista.filter((l) => l.estado === "aMedias" || !l.ofFirme).map((l) => l.of),
    aMedias: enMedias.length,
  };
  return { vista, marcado: { confirmadas: vista.confirmadas, aMedias: new Set(enMedias), deLectura: r.deLectura } };
}

/** Los recuadros de un cuadro: uno por encargo, con su OF escrita arriba (dueño,
 *  2026-11-11: «si me marcas con rectángulos pequeños no entiendo qué estoy leyendo»).
 *  Verde con ✓ **mientras la OF esté confirmada** (dueño, 2026-11-14, spec 034: se saltó
 *  una OF y tuvo que recorrer la nómina de nuevo; lo que no está verde es lo que falta).
 *  Punteado con «…» si se está leyendo, y con ⚠ si quedó a medias (sin dirección o vista
 *  una vez): nunca depende solo del color. Un cuadro que leyó mal un dígito de una OF
 *  confirmada la marca igual (`deLectura`). */
function marcasDe(c: CuadroVivo, filas: ReturnType<typeof filasDe>, marcado: Marcado): MarcaViva[] {
  return cajasDelCuadro(c.renglones, filas).map((e): MarcaViva => {
    const of = marcado.deLectura[e.of] ?? e.of;
    const caja = { x: e.x, y: e.y, ancho: e.ancho, alto: e.alto };
    if (marcado.confirmadas.has(of)) return { ...caja, tipo: "confirmada", etiqueta: `✓ ${formatoOf(of)}` };
    const marca = marcado.aMedias.has(of) ? "⚠" : "…";
    return { ...caja, tipo: "leyendo", etiqueta: `${marca} ${formatoOf(of)}` };
  });
}

// Las confirmadas no se comparan: crecen solo cuando crece `firmes`.
const igual = (a: VistaBarrido | null, b: VistaBarrido) =>
  a != null &&
  a.estado === b.estado &&
  a.firmes === b.firmes &&
  a.porConfirmar === b.porConfirmar &&
  a.aMedias === b.aMedias &&
  a.faltan.join() === b.faltan.join() &&
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

/** La cámara del barrido. `alTerminar` recibe lo leído cuando se termina con el botón
 *  (o con atrás de Android, salvo `conAtras: false`: «Cargar la guía» lo atiende ella y
 *  pregunta antes de descartar, spec 033). `descartar` apaga la cámara y deja la lectura
 *  como estaba al prenderla. */
export function useBarridoNomina(alTerminar: (b: Barrido) => void, opciones: OpcionesBarrido = {}) {
  const { conAtras = true } = opciones;
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conLinterna, setConLinterna] = useState(false);
  const [vista, setVista] = useState<VistaBarrido | null>(null);
  const apagar = useRef<(() => Promise<void>) | null>(null);
  const barrido = useRef<Barrido>(nuevo());
  /** Los votos al prender la cámara: a eso vuelve «Descartar». */
  const alPrender = useRef<VotosBarrido | null>(null);
  const sonadas = useRef(0);
  const marcado = useRef<Marcado>(marcadoVacio());
  const ultimoCuadro = useRef(0);
  const guardado = useRef({ cuadros: 0, en: 0 });
  const terminarCon = useRef(alTerminar);
  const con = useRef(opciones);
  useEffect(() => {
    terminarCon.current = alTerminar;
    con.current = opciones;
  });

  function alCuadro(c: CuadroVivo) {
    const b = barrido.current;
    ultimoCuadro.current = Date.now();
    b.cuadros += 1;
    b.msTotal += c.ms;
    if (c.renglones.length) b.conTexto += 1;
    const filas = filasDe(c.renglones);
    const porFilas = filas.map((f) => f.texto).join("\n");
    const confianzas = confianzasDelCuadro(c.renglones);
    b.porFilas = sumarCuadroNomina(b.porFilas, porFilas, confianzas);
    b.comoLlegan = sumarCuadroNomina(b.comoLlegan, c.renglones.map((r) => r.texto).join("\n"), confianzas);
    if (b.conPiezas) b.conPiezas = sumarCuadroNomina(b.conPiezas, porFilas, confianzas, { piezas: true });
    if (c.renglones.length > b.muestra.renglones) b.muestra = { texto: porFilas, renglones: c.renglones.length };
    marcarEscanerVivo(marcasDe(c, filas, marcado.current));
  }

  function guardar(urgente: boolean) {
    const b = barrido.current;
    guardado.current = { cuadros: b.porFilas.cuadros, en: Date.now() };
    con.current.alGuardar?.(votosDe(b), urgente);
  }

  /** Sin la foto en alta (cuadros de 1080×1920 en vez de 720×960), sin buscar códigos de
   *  barras (la nómina no trae) y con la exposición elegida (spec 034). */
  async function prender() {
    const { camara, apagar: apagarCamara } = await iniciarEscanerVivo(alCuadro, {
      captura: false,
      codigos: false,
      exposicion: exposicionDelBarrido(),
    });
    apagar.current = apagarCamara;
    barrido.current.cuadrosFijos = camara.cuadrosFijos;
    setConLinterna(camara.linterna);
  }

  async function iniciar() {
    setError(null);
    // La misma lectura: lo que ya hay en memoria o, recién abierta la app, lo guardado.
    const antes = con.current.seguir
      ? barrido.current.porFilas.cuadros > 0
        ? votosDe(barrido.current)
        : (con.current.previo?.() ?? null)
      : null;
    alPrender.current = antes;
    barrido.current = nuevo(antes, con.current.comparar);
    guardado.current = { cuadros: barrido.current.porFilas.cuadros, en: Date.now() };
    const inicial = leerBarrido(barrido.current);
    // Lo ya confirmado sale verde desde el primer cuadro y no vuelve a sonar.
    sonadas.current = inicial.vista.firmes;
    marcado.current = antes ? inicial.marcado : marcadoVacio();
    setVista(null);
    prepararSonidos();
    document.documentElement.classList.add(...CLASES_CAMARA);
    setActivo(true);
    try {
      await prender();
      barrido.current.inicio = Date.now();
      setVista(inicial.vista);
    } catch (e) {
      document.documentElement.classList.remove(...CLASES_CAMARA);
      setActivo(false);
      setError(e instanceof Error && /permiso/.test(e.message) ? "Sin permiso de cámara." : "La cámara no abrió.");
    }
  }

  async function cerrarCamara() {
    await apagar.current?.();
    apagar.current = null;
    document.documentElement.classList.remove(...CLASES_CAMARA);
    setActivo(false);
  }

  async function terminar() {
    await cerrarCamara();
    terminarCon.current(barrido.current);
  }

  /** Cierra sin sumar esta pasada (spec 033, barrido-descartar): la lectura vuelve a como
   *  estaba al prender la cámara. */
  async function descartar() {
    await cerrarCamara();
    barrido.current = nuevo(alPrender.current);
    guardar(false);
  }

  /** La lectura parte de cero (se crearon los pedidos o se descartó la guía). */
  function olvidar() {
    barrido.current = nuevo();
    alPrender.current = null;
  }

  // Una vez por segundo: se decide qué OF quedaron firmes (dígito por dígito), suena
  // un tic y vibra si se confirmó alguna, y se redibuja solo si cambió algo (las marcas
  // de Android se mandan en cada cuadro con lo último que se decidió aquí).
  useEffect(() => {
    if (!activo) return;
    const reloj = setInterval(() => {
      const b = barrido.current;
      if (b.cuadros === 0) return;
      const { vista: nueva, marcado: marcas } = leerBarrido(b);
      marcado.current = marcas;
      if (nueva.firmes > sonadas.current) {
        sonadas.current = nueva.firmes;
        sonarTic(0);
        void avisarLectura();
      }
      if (b.porFilas.cuadros !== guardado.current.cuadros && Date.now() - guardado.current.en >= GUARDAR_MS) guardar(false);
      setVista((antes) => (igual(antes, nueva) ? antes : nueva));
    }, REVISAR_MS);
    return () => clearInterval(reloj);
  }, [activo]);

  // El celular se bloquea o ARES pasa atrás: los votos se guardan al tiro. Al volver, si
  // la cámara no manda cuadros, se prende de nuevo sin perder la lectura.
  useEffect(() => {
    if (!activo) return;
    let espera: ReturnType<typeof setTimeout> | undefined;
    const alCambiar = () => {
      clearTimeout(espera);
      if (document.visibilityState === "hidden") return guardar(true);
      const visto = ultimoCuadro.current;
      espera = setTimeout(() => {
        if (!apagar.current || ultimoCuadro.current !== visto) return;
        void (async () => {
          await apagar.current?.();
          apagar.current = null;
          try {
            await prender();
          } catch {
            await cerrarCamara();
            setError("La cámara no volvió. Lo barrido quedó guardado.");
          }
        })();
      }, ESPERA_CAMARA_MS);
    };
    const alSalir = () => guardar(true);
    document.addEventListener("visibilitychange", alCambiar);
    window.addEventListener("pagehide", alSalir);
    return () => {
      clearTimeout(espera);
      document.removeEventListener("visibilitychange", alCambiar);
      window.removeEventListener("pagehide", alSalir);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- todo se lee por referencias
  }, [activo]);

  // Atrás de Android termina igual que el botón: lo leído no se pierde.
  useEffect(() => {
    if (!activo || !conAtras) return;
    // `terminar` lee todo por referencias: basta con engancharlo al prender.
    const soltar = alBotonAtras(() => void terminar());
    return () => soltar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `terminar` lee por referencias (ver arriba)
  }, [activo, conAtras]);
  // Salir de la pantalla con la cámara prendida la apaga, sin aplicar lo leído.
  useEffect(
    () => () => {
      void apagar.current?.();
      document.documentElement.classList.remove(...CLASES_CAMARA);
    },
    [],
  );

  return { activo, error, vista, conLinterna, iniciar, terminar, descartar, olvidar };
}
