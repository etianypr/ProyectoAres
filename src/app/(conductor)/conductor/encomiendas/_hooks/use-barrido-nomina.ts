"use client";

// Barrer la nómina de reparto con la cámara en vivo (dueño, 2026-11-11: la nómina es
// larga para sacarle fotos). La cámara de ARES queda abierta debajo de la pantalla y
// cada cuadro se lee con ML Kit, en el teléfono: sin red, sin IA, y la nómina (que trae
// el nombre del destinatario) no sale del teléfono. La usan «Cargar la guía» → «Barrer
// la nómina» y Diagnóstico → «Probar barrido de nómina».
//
// Los votos y la OF dígito por dígito están en lib/encomiendas/lectura/ (barrido-nomina.ts
// y votos-barrido.ts). Aquí va lo de la pantalla: la cámara, los recuadros sobre cada
// encargo (los dibuja Android, MarcasEscaner.java; ver barrido-en-vivo.ts) y qué OF
// quedaron confirmadas.
//
// Spec 034 (dueño, 2026-11-15): con `seguir`, barrer otra vez continúa la misma lectura,
// y los votos se entregan cada pocos segundos y al bloquearse el celular (`alGuardar`)
// para que nada se pierda si Android cierra ARES.
//
// Spec 036 (dueño, 2026-11-16: «no es lo suficientemente rápido»): se decide con los
// cuadros, cada ≥ 400 ms, y no una vez por segundo; se decide una sola forma de juntar los
// renglones, y lo ya decidido de cada encargo se guarda. Cada cuadro lleva el reloj del
// barrido, con el que vence lo que falta confirmar.

import { useEffect, useRef, useState } from "react";
import { prepararSonidos, sonarTic } from "@/lib/comun/sonidos-escaner";
import { ajusteDelBarrido } from "@/lib/encomiendas/lectura/ajustes-barrido";
import type { VotosBarrido } from "@/lib/encomiendas/lectura/barrido-a-guia";
import { cajasDelCuadro, confianzasDelCuadro, filasDe, sumarCuadroNomina, votosDeLoLeido } from "@/lib/encomiendas/lectura/barrido-nomina";
import { anotarReglas } from "@/lib/encomiendas/lectura/reglas-nomina";
import { elegirVotosDelBarrido, relojDelCuadro, sumarCuadroAlBarrido } from "@/lib/encomiendas/lectura/votos-barrido";
import { alBotonAtras } from "@/lib/nativo/entorno";
import {
  avisarLectura,
  barridoDisponible,
  cuadrosALaVez,
  exposicionDelBarrido,
  iniciarEscanerVivo,
  marcarEscanerVivo,
  pantallaDelCuadro,
  type CuadroVivo,
  type ZonaViva,
} from "@/lib/nativo/escaner-vivo";
import type { VistaBarrido } from "../_componentes/camara-barrido";
import {
  anotarNativo,
  anotarTiempo,
  barridoNuevo as nuevo,
  cronometro,
  dentroDeLaZona,
  flechasEnVivo,
  horaMs,
  igual,
  leerBarrido,
  marcadoVacio,
  marcasDe,
  memoriaFlechasVacia,
  votosDe,
  type Barrido,
  type Marcado,
  type MemoriaFlechas,
} from "./barrido-en-vivo";

/** Sin decidir en este tiempo (sin cuadros, o con «decidir con cada cuadro» apagado), la
 *  revisión de siempre decide: dice si la cámara dejó de leer. Con la cámara encendida,
 *  cada redibujo traba la pantalla del teléfono del conductor 1 a 5 s (spec 028): se
 *  redibuja a lo más una vez por decisión, y solo si algo cambió. */
const REVISAR_MS = 1000;
/** Con los cuadros se decide cada ≥ 400 ms y, si decidir cuesta, cada ≥ 3 veces lo que
 *  tardó la última: nunca más de un cuarto del tiempo (spec 036). */
const DECIDIR_CADA_MS = 400;
const VECES_LO_QUE_TARDA = 3;
/** La página transparente sobre la cámara (spec 028) y, solo al barrer, sin nada detrás:
 *  la pantalla del día invisible trababa cada redibujo (tema-dashund.css, camara-sola). */
const CLASES_CAMARA = ["camara-viva", "camara-sola"];
/** Cada cuánto se entregan los votos para guardarlos, si hubo cuadros nuevos. */
const GUARDAR_MS = 3000;
/** Al volver de un bloqueo, cuánto se espera un cuadro antes de prender la cámara de nuevo. */
const ESPERA_CAMARA_MS = 2000;

export type { Barrido } from "./barrido-en-vivo";

type OpcionesBarrido = {
  /** Atrás de Android termina el barrido (por defecto). «Cargar la guía» lo atiende ella. */
  conAtras?: boolean;
  /** Barrer otra vez sigue la misma lectura en vez de partir de cero. */
  seguir?: boolean;
  /** Los votos guardados de antes (el borrador), si esta lectura todavía no tiene. */
  previo?: () => VotosBarrido | null;
  /** Los votos para guardar. `urgente`: el celular se está bloqueando. */
  alGuardar?: (votos: VotosBarrido, urgente: boolean) => void;
  comparar?: boolean;
  /** La parte del recuadro por la que se ve la cámara sin que la tape la pantalla, en
   *  fracciones de la pantalla: ahí van las flechas, y lo que se ve ahí es dónde está la
   *  cámara (spec 036). Sin ella, la pantalla entera. */
  zona?: () => ZonaViva | null;
};

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
  /** La última decisión: cuándo fue y cuánto tardó. */
  const decision = useRef({ en: 0, ms: 0 });
  /** Los interruptores de Diagnóstico, leídos al prender la cámara: decidir con cada
   *  cuadro, flechas a los huecos y botar fantasmas (spec 036). */
  const ajustes = useRef({ conCadaCuadro: true, huecos: false, fantasmas: false });
  /** La APK dibuja las flechas (desde la de la spec 036). */
  const conFlechas = useRef(false);
  const memoria = useRef<MemoriaFlechas>(memoriaFlechasVacia());
  /** El número del último cuadro que marcó: con dos a la vez, uno atrasado no marca. */
  const ultimoN = useRef(0);
  const terminarCon = useRef(alTerminar);
  const con = useRef(opciones);
  useEffect(() => {
    terminarCon.current = alTerminar;
    con.current = opciones;
  });

  /** Decide qué OF quedaron firmes (dígito por dígito): suena un tic y vibra si se
   *  confirmó alguna, y se redibuja solo si cambió algo. Las marcas de Android van en cada
   *  cuadro con lo último que se decidió aquí. */
  function decidir() {
    const b = barrido.current;
    if (b.cuadros === 0) return;
    const tardo = cronometro();
    const { vista: nueva, marcado: marcas } = leerBarrido(b, ajustes.current);
    marcado.current = marcas;
    // Diagnóstico: lo que decidiría cada regla que se compara (no cuenta en lo que tarda).
    const conReglas = b.reglas;
    if (nueva.firmes > sonadas.current) {
      sonadas.current = nueva.firmes;
      sonarTic(0);
      void avisarLectura();
    }
    setVista((antes) => (igual(antes, nueva) ? antes : nueva));
    const ms = tardo();
    decision.current = { en: horaMs(), ms };
    anotarTiempo(b.tiempos.decidir, ms);
    if (conReglas) anotarReglas(conReglas, elegirVotosDelBarrido(b));
  }

  function alCuadro(c: CuadroVivo) {
    const tardo = cronometro();
    const b = barrido.current;
    const ahora = horaMs();
    // El reloj del barrido: lo que pasó desde el cuadro anterior, con tope (un bloqueo no
    // cuenta para vencer lo que falta confirmar).
    const reloj = relojDelCuadro(b.porFilas.reloj, ultimoCuadro.current ? ahora - ultimoCuadro.current : 0);
    ultimoCuadro.current = ahora;
    b.cuadros += 1;
    b.msTotal += c.ms;
    if (c.renglones.length) b.conTexto += 1;
    anotarNativo(b, c, ultimoN.current);
    const filas = filasDe(c.renglones);
    const cajas = cajasDelCuadro(c.renglones, filas);
    const votos = sumarCuadroAlBarrido(b, c.renglones, { filas, cajas, reloj, reglas: b.reglas != null });
    b.porFilas = votos.porFilas;
    b.comoLlegan = votos.comoLlegan;
    if (b.conPiezas || c.renglones.length > b.muestra.renglones) {
      const porFilas = filas.map((f) => f.texto).join("\n");
      if (b.conPiezas) b.conPiezas = sumarCuadroNomina(b.conPiezas, porFilas, confianzasDelCuadro(c.renglones), { piezas: true, reloj });
      if (c.renglones.length > b.muestra.renglones) b.muestra = { texto: porFilas, renglones: c.renglones.length };
    }
    if (ajustes.current.conCadaCuadro && ahora - decision.current.en >= Math.max(DECIDIR_CADA_MS, VECES_LO_QUE_TARDA * decision.current.ms)) decidir();
    // Con dos cuadros a la vez pueden llegar desordenados: el atrasado vota, pero no marca
    // (lo que se ve es lo del último).
    if (c.n == null || c.n >= ultimoN.current) {
      ultimoN.current = c.n ?? ultimoN.current;
      const marcas = marcasDe(cajas, marcado.current);
      if (conFlechas.current) {
        // Spec 036: las flechas a lo que falta, en la parte del recuadro que se ve.
        const zona = con.current.zona?.() ?? null;
        const { flechas, huecos } = flechasEnVivo(cajas, marcado.current, b.cuadros, dentroDeLaZona(c, pantallaDelCuadro(), zona), memoria.current);
        marcarEscanerVivo([...marcas, ...huecos], { zona, flechas });
      } else marcarEscanerVivo(marcas);
    }
    anotarTiempo(b.tiempos.cuadro, tardo());
  }

  function guardar(urgente: boolean) {
    const b = barrido.current;
    guardado.current = { cuadros: b.porFilas.cuadros, en: Date.now() };
    con.current.alGuardar?.(votosDe(b), urgente);
  }

  /** Sin la foto en alta (cuadros de 1080×1920 en vez de 720×960), sin buscar códigos de
   *  barras (la nómina no trae) y con la exposición elegida (spec 034); con los cuadros a
   *  la vez que diga Diagnóstico (spec 036). */
  async function prender() {
    const { camara, apagar: apagarCamara } = await iniciarEscanerVivo(alCuadro, {
      captura: false,
      codigos: false,
      exposicion: exposicionDelBarrido(),
      enVuelo: cuadrosALaVez(),
    });
    apagar.current = apagarCamara;
    barrido.current.cuadrosFijos = camara.cuadrosFijos;
    barrido.current.nativo.enVuelo = camara.enVuelo;
    conFlechas.current = camara.flechas;
    // Al prender de nuevo (tras un bloqueo), los cuadros vuelven a contar desde 1.
    ultimoN.current = 0;
    setConLinterna(camara.linterna);
  }

  async function iniciar() {
    setError(null);
    // La misma lectura: lo que ya hay en memoria o, recién abierta la app, lo guardado.
    const guardada = con.current.seguir
      ? barrido.current.porFilas.cuadros > 0
        ? votosDe(barrido.current)
        : (con.current.previo?.() ?? null)
      : null;
    // De la pasada anterior sigue solo lo ya leído; lo que faltaba confirmar parte de cero
    // (dueño, 2026-11-15: no debe perdurar al salir del barrido y volver a entrar).
    const antes = guardada && { porFilas: votosDeLoLeido(guardada.porFilas), comoLlegan: votosDeLoLeido(guardada.comoLlegan) };
    alPrender.current = antes;
    barrido.current = nuevo(antes, con.current.comparar);
    guardado.current = { cuadros: barrido.current.porFilas.cuadros, en: Date.now() };
    decision.current = { en: 0, ms: 0 };
    ajustes.current = {
      conCadaCuadro: ajusteDelBarrido("decidirConCadaCuadro"),
      huecos: ajusteDelBarrido("flechasAHuecos"),
      fantasmas: ajusteDelBarrido("botarFantasmas"),
    };
    memoria.current = memoriaFlechasVacia();
    const inicial = leerBarrido(barrido.current, ajustes.current);
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
      setError(e instanceof Error && /permiso/.test(e.message) ? "Sin permiso de cámara." : "No se pudo abrir la cámara.");
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

  // Una vez por segundo: decide si no se decidió con los cuadros (la cámara no manda, o
  // «decidir con cada cuadro» está apagado) y entrega los votos para guardarlos.
  useEffect(() => {
    if (!activo) return;
    const reloj = setInterval(() => {
      const b = barrido.current;
      if (b.cuadros === 0) return;
      if (Date.now() - decision.current.en >= REVISAR_MS) decidir();
      if (b.porFilas.cuadros !== guardado.current.cuadros && Date.now() - guardado.current.en >= GUARDAR_MS) guardar(false);
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
            setError("No se pudo reanudar la cámara. Lo escaneado quedó guardado.");
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
