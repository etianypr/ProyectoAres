"use client";

// El escáner en vivo al cargar el auto (spec 028): la cámara queda abierta y cada
// etiqueta se lee sola. Aquí viven el estado, el guardado y los sonidos; qué hacer con
// cada cuadro lo decide sesion-viva.ts (puro y probado) y la pantalla es escaner-vivo.tsx.
//
//   · Al ver el código de una etiqueta nueva (su OF y su bulto): la parada de inmediato,
//     y el bulto queda contado (como el escáner de siempre).
//   · Los cuadros se juntan (votos.ts). Cuando todo queda firme se saca la foto del
//     paquete, se guarda SOLO lo firme y se avisa con vibración y pitido. No hay apuro: el
//     dueño quiere los datos bien antes que rápido (2026-11-08). Si la etiqueta sale de la
//     cámara o aparece otra, se cierra con lo firme que tenga; si su código vuelve, se
//     sigue leyendo hasta quedar completa.
//   · La traba (fotos del dueño, 2026-11-25: «la cámara se congelaba a ratos», desde la
//     segunda etiqueta): con la cámara encendida cada redibujo de ARES espera a la GPU 1 a
//     5 s en el teléfono del conductor. Por eso la pantalla del día se quita del todo
//     (`camara-sola`, como el barrido de la nómina: medido el 2026-11-11), se redibuja solo
//     lo que cambió a la vista, el día se recarga a lo más cada AVISAR_CAMBIO_MS y la foto
//     sale del cuadro que se está leyendo (APK 1.13.0; con una anterior, la foto en alta).
//   · Un ⚠ (no está en el día, otra dirección) pausa la lectura hasta resolverlo. La que
//     no está en el día se sigue leyendo, sin pasar a otra caja, y «Agregar como pedido»
//     se lleva lo leído y la foto (dueño, 2026-11-25: «debería escanear todo»).
//   · Suena (sonidos-escaner.ts, «Marimba», elegida por el dueño): un tic que sube
//     por cada dato que queda firme, el de pedido leído cuando la etiqueta queda
//     completa, y dos notas que bajan con un ⚠. Cerrada a medias, no suena.
//   · Ni los cuadros ni la foto salen del teléfono. Diagnóstico «Tiempos» anota solo cifras.

import { useCallback, useEffect, useRef, useState } from "react";
import { anotarTiempo, desde } from "@/lib/comun/cronometro";
import { leerCodigoEtiqueta } from "@/lib/encomiendas/lectura/codigo-barras";
import { GIRO_INICIAL, RELOJ_INICIAL, avanzarReloj, pasoDelCuadro, siguienteGiro, type EstadoGiro, type EtiquetaEnCurso, type RelojCamara } from "@/lib/encomiendas/lectura/etiqueta/sesion-viva";
import { datosFirmes, resultadoVotos, type ResultadoVotos } from "@/lib/encomiendas/lectura/etiqueta/votos";
import { prepararSonidos, sonarLeida, sonarPausa, sonarTic } from "@/lib/comun/sonidos-escaner";
import { aplicarLecturaEtiqueta, fijarTelefono, quitarBulto, sePuedeQuitarBulto, type ResultadoEscaneo } from "@/lib/encomiendas/local/almacen";
import { usarDireccionDeEtiqueta } from "@/lib/encomiendas/local/direccion-etiqueta";
import { avisarLectura, girarTextoVivo, type CamaraViva, type CuadroVivo } from "@/lib/nativo/escaner-vivo";
import { etiquetaParaPedido, fotoConTope, guardarEtiquetaLeida, type EtiquetaParaPedido, type Foto } from "./guardar-etiqueta-viva";
import { useCamaraViva } from "./use-camara-viva";

/** Recargar el día redibuja toda la pantalla de atrás: a lo más una vez cada esto mientras
 *  se lee, y al cerrar el escáner. */
const AVISAR_CAMBIO_MS = 1500;

type EstadoVivo =
  | { tipo: "prendiendo" }
  | { tipo: "sinCamara"; motivo: string }
  | { tipo: "buscando" }
  // conDato: quedó algún dato firme; escrita: la OF se escribió a mano (spec 033:
  // sin dato firme no dice «Leída»).
  // telefonoAMano: corregido con ✎; se ve el del pedido, no lo que se va leyendo.
  | { tipo: "etiqueta"; r: ResultadoEscaneo; votos: ResultadoVotos | null; leida: boolean; conDato: boolean; escrita: boolean; telefonoAMano: boolean }
  | { tipo: "noEsta"; of: string; votos: ResultadoVotos | null; leida: boolean }
  | { tipo: "otraDireccion"; r: ResultadoEscaneo; direccion: string; votos: ResultadoVotos | null };

type EnCurso = EtiquetaEnCurso & {
  r: ResultadoEscaneo | null;
  inicio: number;
  /** Cuántos tics ya sonaron (datos firmes). */
  tics: number;
  conDato?: boolean;
  escrita?: boolean;
  /** La mayor pausa entre dos cuadros con esta etiqueta en cámara; -1 ya anotada. */
  mayorHueco: number;
  /** El último guardado: cerrada a medias y después completa, se guardan en orden. */
  guardado?: Promise<unknown>;
  /** Su OF no está en el día: se lee igual y lo leído espera a «Agregar como pedido». */
  fuera?: boolean;
  foto?: Foto;
  /** El teléfono se corrigió con ✎: lo que se lea después no lo pisa. */
  telefonoAMano?: boolean;
};

/** La pausa más larga entre cuadros mientras la etiqueta estuvo en cámara, una vez. */
function anotarHueco(e: EnCurso | null) {
  if (!e || e.mayorHueco <= 0) return;
  anotarTiempo("vivo.hueco", e.mayorHueco);
  e.mayorHueco = -1;
}

export function useEscanerVivo({
  fecha,
  onCambio,
  pausada = false,
}: {
  fecha: string;
  onCambio: () => void;
  /** Se está escribiendo la OF: la cámara se apaga mientras el teclado está arriba. */
  pausada?: boolean;
}) {
  const [estado, setEstado] = useState<EstadoVivo>({ tipo: "prendiendo" });
  /** Lo que pasó con «Usar la dirección de la etiqueta» (spec 033). */
  const [avisoDireccion, setAvisoDireccion] = useState<string | null>(null);
  const enCurso = useRef<EnCurso | null>(null);
  const pausa = useRef(false);
  /** Las etiquetas completas: no se vuelven a leer. Las cerradas a medias no van aquí. */
  const leidas = useRef(new Set<string>());
  /** La OF escrita a mano (código dañado): su texto cuenta si trae esa OF impresa. */
  const ofAMano = useRef<string | null>(null);
  /** Lo que da la cámara: foto (del cuadro o en alta) y texto girado. */
  const captura = useRef(false);
  const fotoDelCuadro = useRef(false);
  const puedeGirar = useRef(false);
  const giro = useRef<EstadoGiro>(GIRO_INICIAL);
  /** El reloj de la cámara (sesion-viva.ts): el tiempo con cuadros llegando, sin las trabas. */
  const reloj = useRef<RelojCamara>(RELOJ_INICIAL);
  /** Lo último que se mostró de la etiqueta: si un cuadro no cambia nada a la vista, no
   *  se redibuja (cada redibujo con la cámara encendida puede trabar 1 a 5 s). */
  const ultimoVisto = useRef<{ de: object; clave: string } | null>(null);
  const onCambioActual = useRef(onCambio);
  const cambioPendiente = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCambioActual.current = onCambio;
  }, [onCambio]);

  const clave = (c: { of: string; bulto: number | null }) => `${c.of}-${c.bulto ?? "?"}`;

  /** El día cambió (un bulto, un dato): se recarga agrupado, no en cada lectura. */
  const avisarCambio = useCallback(() => {
    if (cambioPendiente.current) return;
    cambioPendiente.current = setTimeout(() => {
      cambioPendiente.current = null;
      onCambioActual.current();
    }, AVISAR_CAMBIO_MS);
  }, []);

  // Al cerrar el escáner, lo pendiente se recarga al tiro y se anota la última pausa.
  useEffect(
    () => () => {
      anotarHueco(enCurso.current);
      if (!cambioPendiente.current) return;
      clearTimeout(cambioPendiente.current);
      cambioPendiente.current = null;
      onCambioActual.current();
    },
    [],
  );

  /** Otro estado que no es la etiqueta (un ⚠, buscando): la próxima etiqueta se redibuja. */
  const ver = useCallback((e: EstadoVivo) => {
    ultimoVisto.current = null;
    setEstado(e);
  }, []);

  const mostrar = useCallback((e: EnCurso) => {
    const votos = e.votos ? resultadoVotos(e.votos) : null;
    // Un tic por cada dato que quedó firme desde el cuadro anterior; si quedan dos
    // a la vez, suenan seguidos y siempre subiendo.
    if (votos && !e.leida) {
      const firmes = datosFirmes(votos);
      for (let i = e.tics; i < firmes; i++) setTimeout(() => sonarTic(i), (i - e.tics) * 90);
      e.tics = Math.max(e.tics, firmes);
    }
    if (!e.r && !e.fuera) return;
    // Cerrada a medias se ve cerrada («Solo el código» o lo firme), como antes.
    const cerrada = e.leida || Boolean(e.aMedias);
    const l = votos?.lectura;
    const visto = JSON.stringify([cerrada, e.conDato, e.escrita, e.telefonoAMano, l?.destinatario, l?.telefono, l?.direccion, l?.porPagar, l?.montoPorPagar, l?.dudosos]);
    const de = e.r ?? e;
    if (ultimoVisto.current?.de === de && ultimoVisto.current.clave === visto) return;
    ultimoVisto.current = { de, clave: visto };
    if (!e.r) setEstado({ tipo: "noEsta", of: e.codigo.of, votos, leida: e.leida });
    else setEstado({ tipo: "etiqueta", r: e.r, votos, leida: cerrada, conDato: Boolean(e.conDato), escrita: Boolean(e.escrita), telefonoAMano: Boolean(e.telefonoAMano) });
  }, []);

  /** La etiqueta se cierra: guarda lo firme. Completa (todo firme), además la foto, la
   *  vibración y el sonido de pedido leído; a medias, se sigue leyendo si vuelve. */
  const cerrar = useCallback(
    async (e: EnCurso, completa: boolean) => {
      // Fuera del día no hay pedido donde guardar a medias.
      if (e.leida || e.aMedias || !(e.r || (e.fuera && completa))) return;
      if (completa) e.leida = true;
      else e.aMedias = true;
      const fin = completa ? desde("vivo.cierre") : null;
      if (completa) {
        anotarTiempo("vivo.leer", Date.now() - e.inicio);
        void avisarLectura();
        sonarLeida();
      }
      const foto = completa && captura.current ? await fotoConTope() : null;
      if (!e.r) {
        // Lo leído y la foto esperan a «Agregar como pedido».
        e.foto = foto;
        fin?.();
        if (enCurso.current === e) mostrar(e);
        return;
      }
      const anterior = e.guardado;
      const r0 = e.r;
      const guardado = (async () => {
        await anterior;
        return guardarEtiquetaLeida(fecha, { codigo: e.codigo, votos: e.votos, r: e.r ?? r0 }, foto, fotoDelCuadro.current, e.telefonoAMano);
      })();
      e.guardado = guardado;
      const { r, resultado, conDato } = await guardado;
      e.conDato = conDato;
      fin?.();
      if (completa) leidas.current.add(clave(e.codigo));
      avisarCambio();
      // Solo si sigue siendo la etiqueta en cámara: si ya pasó a otra, no se tapa.
      if (enCurso.current !== e) return;
      const distinta = r.direccionDistinta;
      if (distinta) {
        pausa.current = true;
        sonarPausa();
        ver({ tipo: "otraDireccion", r, direccion: distinta, votos: resultado });
        return;
      }
      e.r = r;
      mostrar(e);
    },
    [fecha, avisarCambio, mostrar, ver],
  );

  /** Una etiqueta nueva en cámara: se cuenta el bulto y se busca su parada. */
  const abrir = useCallback(
    async (e: EnCurso) => {
      let r: ResultadoEscaneo | null = null;
      try {
        r = await aplicarLecturaEtiqueta(fecha, { ...e.codigo, escaneo: true });
      } catch {
        r = null;
      }
      if (enCurso.current !== e) return;
      if (!r) {
        e.fuera = true;
        pausa.current = true;
        sonarPausa();
        mostrar(e);
        return;
      }
      avisarCambio();
      setAvisoDireccion(null);
      e.r = r;
      e.leida = leidas.current.has(clave(e.codigo));
      mostrar(e);
    },
    [fecha, avisarCambio, mostrar],
  );

  const alCuadro = useCallback(
    (c: CuadroVivo) => {
      const real = Date.now();
      const actual = enCurso.current;
      // Con un ⚠ no se pasa a otra caja; la que no está en el día se sigue leyendo.
      const soloEsta = pausa.current && Boolean(actual?.fuera);
      if (pausa.current && !soloEsta) {
        // La pausa no cuenta en el reloj de la cámara.
        reloj.current = { ...reloj.current, real: 0 };
        return;
      }
      if (actual && reloj.current.real && actual.mayorHueco >= 0) {
        actual.mayorHueco = Math.max(actual.mayorHueco, real - reloj.current.real);
      }
      reloj.current = avanzarReloj(reloj.current, real);
      const ahora = reloj.current.camara;
      const texto = c.renglones.map((x) => x.texto).join("\n");
      const { paso, conCodigo } = pasoDelCuadro(actual, { codigos: c.codigos, texto }, ahora, ofAMano.current);
      if (puedeGirar.current) {
        const siguiente = siguienteGiro(giro.current, conCodigo, texto);
        if (siguiente.giro !== giro.current.giro) girarTextoVivo(siguiente.giro);
        giro.current = siguiente;
      }
      if (soloEsta && paso.tipo !== "sumar") return;
      if (paso.tipo === "salio" && actual) {
        void cerrar(actual, false);
      } else if (paso.tipo === "nueva") {
        if (actual && !actual.leida) void cerrar(actual, false);
        anotarHueco(actual);
        const nueva: EnCurso = { codigo: paso.codigo, votos: paso.votos, r: null, inicio: real, ultimoCodigo: ahora, leida: false, tics: 0, mayorHueco: 0 };
        enCurso.current = nueva;
        void abrir(nueva);
      } else if (paso.tipo === "sumar" && actual) {
        actual.votos = paso.votos;
        if (paso.conCodigo) {
          actual.ultimoCodigo = ahora;
          // Volvió la cerrada a medias: se sigue leyendo hasta quedar completa.
          actual.aMedias = false;
        }
        if (actual.leida) return;
        mostrar(actual);
        if ((actual.r || actual.fuera) && paso.listo) void cerrar(actual, true);
      }
    },
    [abrir, cerrar, mostrar],
  );

  const { camara, enVivo, linterna, alternarLinterna } = useCamaraViva({
    pausada,
    alCuadro,
    alEmpezar: useCallback(() => {
      prepararSonidos();
      reloj.current = { ...reloj.current, real: 0 };
      // Una cámara nueva lee el texto derecho: el giro empieza de nuevo.
      giro.current = GIRO_INICIAL;
    }, []),
    alPrender: useCallback((c: CamaraViva) => {
      captura.current = c.captura;
      fotoDelCuadro.current = c.fotoDelCuadro;
      puedeGirar.current = c.giro;
      // Al volver de escribir la OF se ve su parada: no se tapa.
      setEstado((e) => (e.tipo === "prendiendo" ? { tipo: "buscando" } : e));
    }, []),
    alFallar: useCallback((motivo: string) => ver({ tipo: "sinCamara", motivo }), [ver]),
  });

  /** Después de un ⚠: la lectura sigue. */
  const seguir = useCallback(() => {
    pausa.current = false;
    const e = enCurso.current;
    // «Seguir escaneando» sin agregarla: mientras siga en la cámara, no se vuelve a mostrar.
    if (e?.fuera) e.fuera = false;
    if (e?.r) mostrar(e);
    else ver({ tipo: "buscando" });
  }, [mostrar, ver]);

  /** «Agregar como pedido»: lo leído de la etiqueta fuera del día y su foto. Sin quedar
   *  completa, la foto se saca ahora: la etiqueta sigue en la cámara. */
  const paraPedido = useCallback(async (): Promise<EtiquetaParaPedido | null> => {
    const e = enCurso.current;
    if (!e?.fuera) return null;
    const foto = e.foto ?? (captura.current ? await fotoConTope() : null);
    return etiquetaParaPedido(e.codigo, e.votos, foto);
  }, []);

  // Lo que pasó con «Usar la dirección de la etiqueta», como en el escáner de
  // siempre (spec 033, vivo-limites): antes se tragaba el resultado.
  const usarDireccion = useCallback(async () => {
    if (estado.tipo !== "otraDireccion") return;
    const como = await usarDireccionDeEtiqueta(estado.r.pedido.id, estado.direccion).catch(() => null);
    setAvisoDireccion(
      como === "ubicada"
        ? "Dirección actualizada. Recalcula la ruta para reordenar la parada."
        : como === "en_duda"
          ? "Dirección actualizada con dudas: se usó la primera opción (⚠)."
          : como === "sin_ubicar"
            ? "Dirección actualizada, sin ubicar."
            : "No se pudo cambiar la dirección.",
    );
    avisarCambio();
    seguir();
  }, [estado, avisarCambio, seguir]);

  /** ✎ del teléfono (dueño, 2026-11-26: ML Kit confunde el 0 con el 9 o el 9 con el 3, como
   *  al escanear la nómina): el número escrito va al pedido y lo que esta etiqueta lea después
   *  ya no lo pisa. `telefono`: ya normalizado (+569…). */
  const corregirTelefono = useCallback(
    async (telefono: string) => {
      const e = enCurso.current;
      if (!e?.r) return false;
      const pedido = await fijarTelefono(e.r.pedido.id, telefono).catch(() => null);
      if (!pedido) return false;
      e.telefonoAMano = true;
      e.r = { ...e.r, pedido };
      if (enCurso.current === e) mostrar(e);
      avisarCambio();
      return true;
    },
    [avisarCambio, mostrar],
  );

  /** «−1 bulto» (spec 033): deshace el bulto que sumó la etiqueta a la vista. */
  const quitarUno = useCallback(async () => {
    const e = enCurso.current;
    if (!e?.r || !sePuedeQuitarBulto(e.r)) return;
    const r = await quitarBulto(fecha, e.r).catch(() => null);
    if (!r || enCurso.current !== e) return;
    e.r = r;
    avisarCambio();
    mostrar(e);
  }, [fecha, avisarCambio, mostrar]);

  /** El código dañado: se escribe la OF (o el código) y sigue como si se leyera. */
  const escribir = useCallback(
    (texto: string) => {
      const codigo = leerCodigoEtiqueta(texto);
      if (!codigo) return false;
      if (codigo.bulto == null) ofAMano.current = codigo.of;
      pausa.current = false;
      anotarHueco(enCurso.current);
      // Su «código» se vio ahora (reloj de la cámara): antes valía 0 y el primer cuadro sin
      // la OF impresa la daba por salida.
      const nueva: EnCurso = { codigo, votos: null, r: null, inicio: Date.now(), ultimoCodigo: reloj.current.camara, leida: false, tics: 0, escrita: true, mayorHueco: 0 };
      enCurso.current = nueva;
      void abrir(nueva);
      return true;
    },
    [abrir],
  );

  return { estado, camara, enVivo, linterna, alternarLinterna, seguir, usarDireccion, avisoDireccion, quitarUno, escribir, paraPedido, corregirTelefono };
}
