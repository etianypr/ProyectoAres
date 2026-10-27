"use client";

// Lee en voz alta las indicaciones de manejo. Es la mejora más importante de
// todo el cambio a Mapbox: hasta ahora el conductor tenía que LEER el cartel
// mientras manejaba.
//
// Los textos no los armamos nosotros: vienen escritos en español desde la API
// de Mapbox, con la distancia ya calculada ("En 300 metros, gire a la derecha
// hacia Vicuña Mackenna"). Acá solo se decide CUÁNDO decir cada uno.
//
// Verificado contra la API real: de 9 pasos, 8 traen avisos, en español y con
// dos o tres anticipaciones cada uno. Así que cuando la voz no suena, el
// problema NO es que falten los textos — es el sintetizador del teléfono. Los
// tres motivos por los que se queda callado están tratados abajo.
//
// En la APK habla Android (spec 017, N1): el WebView no trae una síntesis de voz
// que suene, y la de Android además baja la música en vez de pisarla.

import { useCallback, useEffect, useRef, useState } from "react";
import { callarNativo, hablarNativo, hayVozNativa } from "@/lib/nativo/telefono";
import type { Navegacion } from "./use-navegacion";
import { elegirVoz } from "./voz";

const CLAVE_PREFERENCIA = "pucarani-voz-navegacion";

function haySintesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// ----------------------------------------------------------------------------
// 1. Qué voz usa
// ----------------------------------------------------------------------------
// Ver ./voz.ts: de las voces que el teléfono SÍ tiene, la mejor en español.
function vozDelSistema(): SpeechSynthesisVoice | null {
  return elegirVoz(window.speechSynthesis.getVoices());
}

// ----------------------------------------------------------------------------
// 2. El desbloqueo por gesto
// ----------------------------------------------------------------------------
// iOS (y Chrome con su política de reproducción automática) no deja hablar
// hasta que el usuario haya tocado la pantalla al menos una vez. El primer
// aviso se descarta en silencio y no hay forma de saber por qué. Se "despierta"
// el sintetizador con un texto vacío dentro de un toque, así el aviso de verdad
// ya lo encuentra habilitado.
let desbloqueado = false;

function desbloquear() {
  if (desbloqueado || !haySintesis()) return;
  desbloqueado = true;
  // Un espacio en vez de "" — algunos WebKit ignoran del todo el texto vacío
  // y entonces no se habilita nada.
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
}

/** Engancha el desbloqueo al primer toque. Devuelve cómo desengancharlo. */
function desbloquearConPrimerToque(): () => void {
  if (desbloqueado || !haySintesis()) return () => {};

  const alTocar = () => {
    desbloquear();
    quitar();
  };
  const quitar = () => {
    document.removeEventListener("touchend", alTocar);
    document.removeEventListener("click", alTocar);
  };

  document.addEventListener("touchend", alTocar);
  document.addEventListener("click", alTocar);
  return quitar;
}

// ----------------------------------------------------------------------------
// 3. Decir el texto
// ----------------------------------------------------------------------------
/** `urgente` = el aviso del giro que viene ya: corta lo que esté sonando. Los
 *  demás se encolan, para que el primer aviso del tramo siguiente no corte
 *  "gire a la derecha" a la mitad (spec 017, N3). */
function hablar(texto: string, urgente: boolean) {
  void hablarNativo(texto, urgente).then((dicho) => {
    if (!dicho) hablarEnNavegador(texto, urgente);
  });
}

function hablarEnNavegador(texto: string, urgente: boolean) {
  if (!haySintesis()) return;
  const sintetizador = window.speechSynthesis;

  // El giro de ahora reemplaza a lo que esté sonando: si el conductor llegó a la
  // esquina mientras todavía sonaba "en 300 metros", lo que importa es lo de ahora.
  //
  // Solo si hay algo sonando: un cancel() con la cola vacía deja a WebKit
  // trabado y el speak() que viene justo después se pierde sin avisar. Como la
  // mayoría de los avisos llegan con el sintetizador en silencio, ese cancel de
  // más se comía justamente los que importan.
  if (urgente && (sintetizador.speaking || sintetizador.pending)) sintetizador.cancel();

  const aviso = new SpeechSynthesisUtterance(texto);
  const voz = vozDelSistema();
  if (voz) aviso.voice = voz;
  // Si no hay ninguna voz en español instalada igual se intenta: algunos
  // sistemas resuelven por el lang aunque getVoices() venga vacío.
  aviso.lang = voz?.lang ?? "es-CL";
  sintetizador.speak(aviso);

  // Chrome deja el sintetizador en PAUSA al volver de segundo plano, y el
  // teléfono del conductor pasa medio día con la pantalla apagada. Cuando eso
  // pasa, speak() encola el aviso y no suena nada nunca más en todo el viaje;
  // resume() es lo único que lo destraba, y llamarlo de más no molesta.
  sintetizador.resume();
}

function leerPreferencia(): boolean {
  if (typeof window === "undefined") return true;
  // Por defecto ENCENDIDA: el conductor que no la quiera la apaga una vez y queda.
  return window.localStorage.getItem(CLAVE_PREFERENCIA) !== "off";
}

export type Voz = {
  activa: boolean;
  alternar: () => void;
  /** false si el navegador no puede hablar: la pantalla oculta el botón en vez
   *  de ofrecer algo que no hace nada. */
  disponible: boolean;
};

/** Al recalcular, el primer aviso del tramo nuevo suele ser el mismo que se
 *  acaba de decir ("Siga por Santa María"): dentro de este plazo no se repite. */
const MS_SIN_REPETIR_AL_RECALCULAR = 20_000;

/** Un aviso a menos de esto de la maniobra es el del giro (ver hablar). */
const METROS_AVISO_DEL_GIRO = 200;

// Dice el aviso que corresponda según lo que falta para la maniobra. Mapbox
// entrega varios por maniobra (por ejemplo a 2 km, a 300 m y justo al llegar) y
// acá se elige el más cercano de los que ya se alcanzaron, marcando los más
// lejanos como dichos para no decir "en 300 metros" cuando ya faltan 50.
export function useVozNavegacion(
  activo: boolean,
  { paso, metrosAManiobra, tramoId, indicePaso }: Pick<Navegacion, "paso" | "metrosAManiobra" | "tramoId" | "indicePaso">,
): Voz {
  const [activa, setActiva] = useState(leerPreferencia);
  /** Avisos dichos en el tramo en curso, por maniobra (ver la clave abajo). */
  const dichosRef = useRef<{ tramoId: number | null; claves: Set<string> }>({ tramoId: null, claves: new Set() });
  const ultimoRef = useRef<{ texto: string; en: number } | null>(null);
  const disponible = hayVozNativa() || haySintesis();

  // La lista de voces llega ASÍNCRONA en Chrome: la primera llamada a
  // getVoices() devuelve [] y recién después se dispara "voiceschanged". Pedirla
  // al montar es lo que arranca esa carga, así que para el primer aviso del día
  // ya está lista y no sale con la voz equivocada.
  useEffect(() => {
    if (!haySintesis()) return;
    const refrescar = () => void window.speechSynthesis.getVoices();
    refrescar();
    window.speechSynthesis.addEventListener("voiceschanged", refrescar);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", refrescar);
  }, []);

  // El desbloqueo se engancha SIEMPRE que la voz esté encendida, sin mirar
  // "activo". Antes dependía de él, y "activo" es false mientras se muestra la
  // ruta propuesta — o sea, justo al abrir la app, que es cuando el conductor
  // toca la pantalla. El toque en "Usar esta ruta", el gesto ideal para
  // desbloquear, pasaba sin que nadie lo escuchara; después el conductor arrancaba
  // a manejar sin volver a tocar nada y la voz no se habilitaba nunca.
  useEffect(() => {
    if (!activa) return;
    return desbloquearConPrimerToque();
  }, [activa]);

  useEffect(() => {
    if (!activo || !activa || !paso || metrosAManiobra == null) return;

    // La memoria es POR TRAMO: antes era una sola para todo el día y el mismo
    // giro, a la vuelta por la misma esquina horas después, ya no se decía.
    const dichos = dichosRef.current;
    const tramoNuevo = dichos.tramoId !== tramoId;
    if (tramoNuevo) {
      dichos.tramoId = tramoId;
      dichos.claves.clear();
    }

    // avisos viene del más lejano al más cercano (ver obtenerNavegacion).
    const alcanzados = paso.avisos.filter((a) => metrosAManiobra <= a.aMetros);
    if (alcanzados.length === 0) return;

    const aDecir = alcanzados[alcanzados.length - 1];
    // El número de maniobra entra en la clave para que el mismo texto en una
    // maniobra distinta sí se diga (dos giros seguidos a la derecha).
    const clave = (texto: string) => `${indicePaso}|${texto}`;
    if (dichos.claves.has(clave(aDecir.texto))) return;
    for (const a of alcanzados) dichos.claves.add(clave(a.texto));

    const ultimo = ultimoRef.current;
    if (tramoNuevo && ultimo?.texto === aDecir.texto && Date.now() - ultimo.en < MS_SIN_REPETIR_AL_RECALCULAR) return;
    ultimoRef.current = { texto: aDecir.texto, en: Date.now() };
    // El último aviso de la maniobra, ya encima de ella, es el del giro: ese no
    // espera a nadie. Un aviso lejano ("siga 1 km") se encola aunque sea el único.
    const delGiro = aDecir === paso.avisos[paso.avisos.length - 1] && aDecir.aMetros <= METROS_AVISO_DEL_GIRO;
    hablar(aDecir.texto, delGiro);
  }, [activo, activa, paso, metrosAManiobra, tramoId, indicePaso]);

  const alternar = useCallback(() => {
    const ahora = !activa;
    setActiva(ahora);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLAVE_PREFERENCIA, ahora ? "on" : "off");

    if (!ahora) {
      // Al apagar se corta lo que esté sonando; si no, el conductor aprieta el
      // botón y la frase sigue hasta el final.
      void callarNativo();
      if (haySintesis()) window.speechSynthesis.cancel();
      return;
    }

    // Encenderla CONFIRMA en voz alta, y eso hace dos cosas a la vez:
    //
    //  · Es la prueba de la voz. Si el conductor aprieta el botón y no escucha
    //    nada, ya sabe que en ese teléfono la voz no funciona — se entera
    //    parado en el galpón y no a mitad de una avenida.
    //  · Ocurre DENTRO de un toque suyo, que es lo único que desbloquea el
    //    sintetizador en iOS.
    desbloquear();
    hablar("Indicaciones por voz activadas.", true);
  }, [activa]);

  return { activa, alternar, disponible };
}
