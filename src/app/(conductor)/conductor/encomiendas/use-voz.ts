"use client";

// Lee en voz alta las indicaciones de manejo. Es la mejora más importante de
// todo el cambio a Mapbox: hasta ahora el chofer tenía que LEER el cartel
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

import { useCallback, useEffect, useRef, useState } from "react";
import type { PasoNavegacion } from "@/lib/rutas";

const CLAVE_PREFERENCIA = "pucarani-voz-navegacion";

function haySintesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// ----------------------------------------------------------------------------
// 1. Qué voz usa
// ----------------------------------------------------------------------------
// Poner solo `lang = "es-CL"` no alcanza, y era lo que se hacía. Casi ningún
// teléfono tiene instalada esa variante: Android trae es-ES o es-US, el iPhone
// es-MX o es-ES. Ante un idioma que no tiene, el navegador puede leer el texto
// con una voz en inglés (queda incomprensible) o directamente no decir nada,
// según el aparato. Hay que elegir a mano, de las voces que el teléfono SÍ
// tiene, la mejor en español.
//
// El orden es por cercanía al oído chileno: la de Chile, la latinoamericana
// genérica, después las de la región y por último la de España.
const PREFERENCIA_VOZ = ["es-cl", "es-419", "es-mx", "es-pe", "es-ar", "es-us", "es-es"];

function normalizar(lang: string): string {
  // Android reporta "es_CL" con guion bajo; el estándar es "es-CL".
  return lang.replace("_", "-").toLowerCase();
}

/** Elige la mejor voz en español de las que tenga el aparato. Exportada para
 *  poder probar el orden de preferencia sin un navegador. */
export function elegirVoz<T extends { lang: string }>(voces: T[]): T | null {
  const enEspanol = voces.filter((v) => normalizar(v.lang).startsWith("es"));
  if (enEspanol.length === 0) return null;

  for (const preferida of PREFERENCIA_VOZ) {
    const v = enEspanol.find((voz) => normalizar(voz.lang) === preferida);
    if (v) return v;
  }
  // Tiene español, pero de una variante que no está en la lista: sirve igual.
  return enEspanol[0];
}

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
function hablar(texto: string) {
  if (!haySintesis()) return;
  const sintetizador = window.speechSynthesis;

  // Una indicación nueva reemplaza a la anterior: si el chofer llegó al giro
  // mientras todavía sonaba "en 300 metros", lo que importa es lo de ahora.
  //
  // Solo si hay algo sonando: un cancel() con la cola vacía deja a WebKit
  // trabado y el speak() que viene justo después se pierde sin avisar. Como la
  // mayoría de los avisos llegan con el sintetizador en silencio, ese cancel de
  // más se comía justamente los que importan.
  if (sintetizador.speaking || sintetizador.pending) sintetizador.cancel();

  const aviso = new SpeechSynthesisUtterance(texto);
  const voz = vozDelSistema();
  if (voz) aviso.voice = voz;
  // Si no hay ninguna voz en español instalada igual se intenta: algunos
  // sistemas resuelven por el lang aunque getVoices() venga vacío.
  aviso.lang = voz?.lang ?? "es-CL";
  sintetizador.speak(aviso);

  // Chrome deja el sintetizador en PAUSA al volver de segundo plano, y el
  // teléfono del chofer pasa media jornada con la pantalla apagada. Cuando eso
  // pasa, speak() encola el aviso y no suena nada nunca más en todo el viaje;
  // resume() es lo único que lo destraba, y llamarlo de más no molesta.
  sintetizador.resume();
}

function leerPreferencia(): boolean {
  if (typeof window === "undefined") return true;
  // Por defecto ENCENDIDA: el chofer que no la quiera la apaga una vez y queda.
  return window.localStorage.getItem(CLAVE_PREFERENCIA) !== "off";
}

export type Voz = {
  activa: boolean;
  alternar: () => void;
  /** false si el navegador no puede hablar: la pantalla oculta el botón en vez
   *  de ofrecer algo que no hace nada. */
  disponible: boolean;
};

// Dice el aviso que corresponda según lo que falta para la maniobra. Mapbox
// entrega varios por maniobra (por ejemplo a 2 km, a 300 m y justo al llegar) y
// acá se elige el más cercano de los que ya se alcanzaron, marcando los más
// lejanos como dichos para no decir "en 300 metros" cuando ya faltan 50.
export function useVozNavegacion(
  activo: boolean,
  paso: PasoNavegacion | null,
  metrosAManiobra: number | null,
): Voz {
  const [activa, setActiva] = useState(leerPreferencia);
  const dichosRef = useRef<Set<string>>(new Set());
  const disponible = haySintesis();

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
  // ruta propuesta — o sea, justo al abrir la app, que es cuando el chofer
  // toca la pantalla. El toque en "Usar esta ruta", el gesto ideal para
  // desbloquear, pasaba sin que nadie lo escuchara; después el chofer arrancaba
  // a manejar sin volver a tocar nada y la voz no se habilitaba nunca.
  useEffect(() => {
    if (!activa) return;
    return desbloquearConPrimerToque();
  }, [activa]);

  useEffect(() => {
    if (!activo || !activa || !paso || metrosAManiobra == null) return;

    // avisos viene del más lejano al más cercano (ver obtenerNavegacion).
    const alcanzados = paso.avisos.filter((a) => metrosAManiobra <= a.aMetros);
    if (alcanzados.length === 0) return;

    const aDecir = alcanzados[alcanzados.length - 1];
    // La instrucción entra en la clave para que el mismo texto en una maniobra
    // distinta sí se diga (dos giros seguidos a la derecha en la misma calle).
    const clave = `${paso.instruccion}|${aDecir.texto}`;
    if (dichosRef.current.has(clave)) return;

    for (const a of alcanzados) dichosRef.current.add(`${paso.instruccion}|${a.texto}`);
    hablar(aDecir.texto);
  }, [activo, activa, paso, metrosAManiobra]);

  const alternar = useCallback(() => {
    const ahora = !activa;
    setActiva(ahora);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CLAVE_PREFERENCIA, ahora ? "on" : "off");

    if (!ahora) {
      // Al apagar se corta lo que esté sonando; si no, el chofer aprieta el
      // botón y la frase sigue hasta el final.
      if (haySintesis()) window.speechSynthesis.cancel();
      return;
    }

    // Encenderla CONFIRMA en voz alta, y eso hace dos cosas a la vez:
    //
    //  · Es la prueba de la voz. Si el chofer aprieta el botón y no escucha
    //    nada, ya sabe que en ese teléfono la voz no funciona — se entera
    //    parado en el galpón y no a mitad de una avenida.
    //  · Ocurre DENTRO de un toque suyo, que es lo único que desbloquea el
    //    sintetizador en iOS.
    desbloquear();
    hablar("Indicaciones por voz activadas.");
  }, [activa]);

  return { activa, alternar, disponible };
}
