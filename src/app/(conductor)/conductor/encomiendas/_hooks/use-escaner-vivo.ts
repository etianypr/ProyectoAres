"use client";

// El escáner en vivo al cargar el auto (spec 028): la cámara queda abierta y cada
// etiqueta se lee sola. Aquí vive el estado; la pantalla es escaner-vivo.tsx.
//
//   · Al ver el código de una etiqueta nueva: la parada de inmediato, y el bulto
//     queda contado (como el escáner de siempre).
//   · Los cuadros se juntan (votos.ts). Cuando todo queda firme se saca la
//     captura en alta (otra lectura y la foto del paquete), se guarda SOLO lo
//     firme y se avisa con vibración y pitido. No hay apuro: el dueño quiere los
//     datos bien antes que rápido (2026-11-08). Si la etiqueta sale de la cámara
//     o aparece otra, se cierra con lo firme que tenga.
//   · Un cuadro con dos códigos de Starken distintos no cuenta (la caja del
//     lado). Uno sin código cuenta si el de esta etiqueta se vio hace menos de
//     CONTINUIDAD_MS (ML Kit no lee el código en todos los cuadros).
//   · Un ⚠ (no está en el día, otra dirección) pausa la lectura hasta resolverlo.
//   · Suena (sonidos-escaner.ts, «Marimba», elegida por el dueño): un tic que sube
//     por cada dato que queda firme, el de pedido leído cuando la etiqueta queda
//     completa, y dos notas que bajan con un ⚠. Cerrada a medias, no suena.
//   · Ni los cuadros ni la captura salen del teléfono.

import { useCallback, useEffect, useRef, useState } from "react";
import { codigoEnLaFoto, leerCodigoEtiqueta, type CodigoEtiqueta } from "@/lib/encomiendas/lectura/codigo-barras";
import { leerEtiqueta, type LecturaEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import { datosFirmes, resultadoVotos, sumarCuadro, type ResultadoVotos, type Votos } from "@/lib/encomiendas/lectura/etiqueta/votos";
import { prepararSonidos, sonarLeida, sonarPausa, sonarTic } from "@/lib/comun/sonidos-escaner";
import { aplicarLecturaEtiqueta, guardarFoto, quitarBulto, sePuedeQuitarBulto, type ResultadoEscaneo } from "@/lib/encomiendas/local/almacen";
import { usarDireccionDeEtiqueta } from "@/lib/encomiendas/local/direccion-etiqueta";
import { comprimirFoto } from "@/lib/encomiendas/local/foto";
import {
  avisarLectura,
  capturarViva,
  iniciarEscanerVivo,
  linternaViva,
  type CamaraViva,
  type CuadroVivo,
} from "@/lib/nativo/escaner-vivo";

/** Un cuadro sin código sigue contando para la etiqueta si su código se vio
 *  hace menos de esto. También es el plazo para sacar la captura. */
const CONTINUIDAD_MS = 700;
/** Sin ver el código de la etiqueta este tiempo, salió de la cámara: se cierra. */
const SALIDA_MS = 1500;
/** Después de escribir la OF, la cámara vuelve cuando el teclado ya bajó. */
const ESPERA_TECLADO_MS = 800;

export type EstadoVivo =
  | { tipo: "prendiendo" }
  | { tipo: "sinCamara"; motivo: string }
  | { tipo: "buscando" }
  // conDato: quedó algún dato firme; escrita: la OF se escribió a mano (spec 033:
  // sin dato firme no dice «Leída»).
  | { tipo: "etiqueta"; r: ResultadoEscaneo; votos: ResultadoVotos | null; leida: boolean; conDato: boolean; escrita: boolean }
  | { tipo: "noEsta"; of: string }
  | { tipo: "otraDireccion"; r: ResultadoEscaneo; direccion: string; votos: ResultadoVotos | null };

type EnCurso = {
  codigo: CodigoEtiqueta;
  votos: Votos | null;
  r: ResultadoEscaneo | null;
  inicio: number;
  ultimoCodigo: number;
  leida: boolean;
  /** Cuántos tics ya sonaron (datos firmes). */
  tics: number;
  conDato?: boolean;
  escrita?: boolean;
};

/** Al guardar lo leído, el bulto que sumó la etiqueta sigue siendo el de «−1
 *  bulto» (spec 033): la lectura de cierre no suma ninguno. */
const conSuma = (nuevo: ResultadoEscaneo, de: ResultadoEscaneo): ResultadoEscaneo => ({
  ...nuevo,
  bultoAMano: de.bultoAMano,
  bultoSumado: de.bultoSumado,
  bultosAntes: de.bultosAntes,
});

/** Solo lo firme va al pedido: lo visto una vez o empatado queda sin leer. */
function soloFirme(v: ResultadoVotos): LecturaEtiqueta {
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
  const [camara, setCamara] = useState<CamaraViva | null>(null);
  /** La cámara está prendida: el teclado se abre recién cuando se apagó. */
  const [enVivo, setEnVivo] = useState(false);
  const [linterna, setLinterna] = useState(false);
  /** Lo que pasó con «Usar la dirección de la etiqueta» (spec 033). */
  const [avisoDireccion, setAvisoDireccion] = useState<string | null>(null);
  const enCurso = useRef<EnCurso | null>(null);
  const pausa = useRef(false);
  const leidas = useRef(new Set<string>());
  /** La OF escrita a mano (código dañado): su texto cuenta si trae esa OF impresa. */
  const ofAMano = useRef<string | null>(null);
  const captura = useRef(false);

  const clave = (c: CodigoEtiqueta) => `${c.of}-${c.bulto ?? "?"}`;

  const mostrar = useCallback((e: EnCurso) => {
    const votos = e.votos ? resultadoVotos(e.votos) : null;
    // Un tic por cada dato que quedó firme desde el cuadro anterior; si quedan dos
    // a la vez, suenan seguidos y siempre subiendo.
    if (votos && !e.leida) {
      const firmes = datosFirmes(votos);
      for (let i = e.tics; i < firmes; i++) setTimeout(() => sonarTic(i), (i - e.tics) * 90);
      e.tics = Math.max(e.tics, firmes);
    }
    if (!e.r) return;
    setEstado({ tipo: "etiqueta", r: e.r, votos, leida: e.leida, conDato: Boolean(e.conDato), escrita: Boolean(e.escrita) });
  }, []);

  /** La etiqueta queda leída: guarda lo firme. Completa (todo firme), además la
   *  captura, la foto, la vibración y el sonido de pedido leído. */
  const cerrar = useCallback(
    async (e: EnCurso, completa: boolean) => {
      if (e.leida || !e.r) return;
      e.leida = true;
      if (completa) {
        void avisarLectura();
        sonarLeida();
      }
      let votos = e.votos;
      const foto = completa && captura.current ? await capturarViva() : null;
      if (foto && codigoEnLaFoto(foto.codigos)?.of === e.codigo.of) {
        votos = sumarCuadro(votos, e.codigo, foto.texto.trim() ? leerEtiqueta(foto.texto) : null);
      }
      const resultado = votos ? resultadoVotos(votos) : null;
      const firmes = resultado ? soloFirme(resultado) : null;
      e.conDato = Boolean(firmes && (firmes.destinatario || firmes.telefono || firmes.porPagar != null));
      let r = e.r;
      try {
        if (resultado) {
          const nuevo = await aplicarLecturaEtiqueta(fecha, {
            ...soloFirme(resultado),
            of: e.codigo.of,
            bulto: null,
            ofConfirmada: resultado.ofConfirmada,
          });
          if (nuevo) r = conSuma(nuevo, r);
        }
        if (foto && !r.pedido.fotoId) {
          await guardarFoto(r.pedido.id, await comprimirFoto(foto.imagen));
          const conFoto = await aplicarLecturaEtiqueta(fecha, { of: e.codigo.of, bulto: null });
          if (conFoto) r = conSuma(conFoto, r);
        }
      } catch {
        // Si falla el guardado local, la parada ya quedó contada: sigue.
      }
      leidas.current.add(clave(e.codigo));
      onCambio();
      // Solo si sigue siendo la etiqueta en cámara: si ya pasó a otra, no se tapa.
      if (enCurso.current !== e) return;
      const distinta = r.direccionDistinta;
      if (distinta) {
        pausa.current = true;
        sonarPausa();
        setEstado({ tipo: "otraDireccion", r, direccion: distinta, votos: resultado });
        return;
      }
      e.r = r;
      mostrar(e);
    },
    [fecha, onCambio, mostrar],
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
        pausa.current = true;
        sonarPausa();
        setEstado({ tipo: "noEsta", of: e.codigo.of });
        return;
      }
      onCambio();
      setAvisoDireccion(null);
      e.r = r;
      e.leida = leidas.current.has(clave(e.codigo));
      mostrar(e);
    },
    [fecha, onCambio, mostrar],
  );

  const alCuadro = useCallback(
    (c: CuadroVivo) => {
      if (pausa.current) return;
      const ahora = Date.now();
      const texto = c.renglones.map((x) => x.texto).join("\n");
      // Dos etiquetas de Starken en el cuadro: no se sabe de cuál es el texto.
      const ofsEnCuadro = new Set(c.codigos.map((x) => codigoEnLaFoto([x])?.of).filter(Boolean));
      const lectura = texto.trim() && ofsEnCuadro.size <= 1 ? leerEtiqueta(texto) : null;
      const manual = ofAMano.current && lectura?.ofImpresa === ofAMano.current ? { of: ofAMano.current, bulto: null } : null;
      const codigo = codigoEnLaFoto(c.codigos) ?? manual;
      const actual = enCurso.current;

      if (!codigo) {
        if (!actual || actual.leida) return;
        // ML Kit no leyó el código en este cuadro: si se vio recién, es la misma
        // etiqueta; si hace rato que no se ve, salió de la cámara.
        if (ahora - actual.ultimoCodigo < CONTINUIDAD_MS) {
          actual.votos = sumarCuadro(actual.votos, actual.codigo, lectura);
          mostrar(actual);
        } else if (ahora - actual.ultimoCodigo > SALIDA_MS) {
          void cerrar(actual, false);
        }
        return;
      }
      if (!actual || actual.codigo.of !== codigo.of) {
        if (actual && !actual.leida) void cerrar(actual, false);
        const nueva: EnCurso = { codigo, votos: null, r: null, inicio: ahora, ultimoCodigo: ahora, leida: false, tics: 0 };
        enCurso.current = nueva;
        nueva.votos = sumarCuadro(null, codigo, lectura);
        void abrir(nueva);
        return;
      }
      actual.ultimoCodigo = ahora;
      actual.votos = sumarCuadro(actual.votos, codigo, lectura);
      if (actual.leida) return;
      mostrar(actual);
      if (actual.r && actual.votos && resultadoVotos(actual.votos).listo) void cerrar(actual, true);
    },
    [abrir, cerrar, mostrar],
  );

  // La cámara se prende UNA vez al abrir: los cuadros llegan a la última versión
  // de alCuadro por una referencia, así un nuevo dibujo de la pantalla no la
  // reinicia.
  const ultimoAlCuadro = useRef(alCuadro);
  useEffect(() => {
    ultimoAlCuadro.current = alCuadro;
  }, [alCuadro]);

  // Prender la cámara al abrir y apagarla al salir. Mientras se escribe la OF queda
  // apagada: abrir o cerrar el teclado con la cámara viva traba la GPU de la WebView
  // varios segundos y Android cierra ARES por no responder (ANR medido en el teléfono
  // del conductor, 2026-11-09; con la cámara sola o el teclado solo, fluido).
  const yaPrendio = useRef(false);
  useEffect(() => {
    if (pausada) return;
    let vivo = true;
    let prendida: Promise<(() => Promise<void>) | null> = Promise.resolve(null);
    const prender = () => {
      document.documentElement.classList.add("camara-viva");
      prepararSonidos();
      prendida = iniciarEscanerVivo((c) => ultimoAlCuadro.current(c)).then(
        (r) => {
          if (vivo) {
            yaPrendio.current = true;
            captura.current = r.camara.captura;
            setCamara(r.camara);
            setEnVivo(true);
            // Al volver de escribir la OF se ve su parada: no se tapa.
            setEstado((e) => (e.tipo === "prendiendo" ? { tipo: "buscando" } : e));
          }
          return r.apagar;
        },
        (e: unknown) => {
          if (vivo) {
            document.documentElement.classList.remove("camara-viva");
            setEstado({ tipo: "sinCamara", motivo: e instanceof Error && /permiso/.test(e.message) ? "Sin permiso de cámara." : "La cámara no abrió." });
          }
          return null;
        },
      );
    };
    const espera = yaPrendio.current ? setTimeout(prender, ESPERA_TECLADO_MS) : null;
    if (!espera) prender();
    return () => {
      vivo = false;
      if (espera) clearTimeout(espera);
      document.documentElement.classList.remove("camara-viva");
      setLinterna(false);
      void prendida.then((apagar) => apagar?.()).finally(() => setEnVivo(false));
    };
  }, [pausada]);

  /** Después de un ⚠: la lectura sigue. */
  const seguir = useCallback(() => {
    pausa.current = false;
    const e = enCurso.current;
    if (e?.r) mostrar(e);
    else setEstado({ tipo: "buscando" });
  }, [mostrar]);

  // Lo que pasó con «Usar la dirección de la etiqueta», como en el escáner de
  // siempre (spec 033, vivo-limites): antes se tragaba el resultado.
  const usarDireccion = useCallback(async () => {
    if (estado.tipo !== "otraDireccion") return;
    const como = await usarDireccionDeEtiqueta(estado.r.pedido.id, estado.direccion).catch(() => null);
    setAvisoDireccion(
      como === "ubicada"
        ? "Dirección cambiada. Rehaz la ruta para que la parada quede en su orden."
        : como === "en_duda"
          ? "Dirección cambiada, en duda: quedó en la primera opción con ⚠."
          : como === "sin_ubicar"
            ? "Dirección cambiada, pero no se pudo ubicar."
            : "No se pudo cambiar la dirección.",
    );
    onCambio();
    seguir();
  }, [estado, onCambio, seguir]);

  /** «−1 bulto» (spec 033): deshace el bulto que sumó la etiqueta a la vista. */
  const quitarUno = useCallback(async () => {
    const e = enCurso.current;
    if (!e?.r || !sePuedeQuitarBulto(e.r)) return;
    const r = await quitarBulto(fecha, e.r).catch(() => null);
    if (!r || enCurso.current !== e) return;
    e.r = r;
    onCambio();
    mostrar(e);
  }, [fecha, onCambio, mostrar]);

  /** El código dañado: se escribe la OF (o el código) y sigue como si se leyera. */
  const escribir = useCallback(
    (texto: string) => {
      const codigo = leerCodigoEtiqueta(texto);
      if (!codigo) return false;
      if (codigo.bulto == null) ofAMano.current = codigo.of;
      pausa.current = false;
      const nueva: EnCurso = { codigo, votos: null, r: null, inicio: Date.now(), ultimoCodigo: 0, leida: false, tics: 0, escrita: true };
      enCurso.current = nueva;
      void abrir(nueva);
      return true;
    },
    [abrir],
  );

  const alternarLinterna = useCallback(async () => {
    if (await linternaViva(!linterna)) setLinterna(!linterna);
  }, [linterna]);

  return { estado, camara, enVivo, linterna, alternarLinterna, seguir, usarDireccion, avisoDireccion, quitarUno, escribir };
}
