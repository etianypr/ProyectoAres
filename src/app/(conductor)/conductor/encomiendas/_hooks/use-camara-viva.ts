"use client";

// Prender y apagar la cámara del escáner en vivo (spec 028), y su linterna. Salió de
// use-escaner-vivo.ts (A7), que decide qué hacer con cada cuadro.
//
//   · La cámara se prende UNA vez al abrir: los cuadros llegan a la última versión de
//     alCuadro por una referencia, así un nuevo dibujo de la pantalla no la reinicia.
//   · Mientras se escribe la OF queda apagada: abrir o cerrar el teclado con la cámara viva
//     traba la GPU de la WebView varios segundos y Android cierra ARES por no responder (ANR
//     medido en el teléfono del conductor, 2026-11-09; con la cámara sola o el teclado solo,
//     fluido).
//   · La página transparente sobre la cámara y, detrás, nada: la pantalla del día invisible
//     trababa cada redibujo (tema-dashund.css, camara-sola; fotos del dueño, 2026-11-25).

import { useCallback, useEffect, useRef, useState } from "react";
import { iniciarEscanerVivo, linternaViva, type CamaraViva, type CuadroVivo } from "@/lib/nativo/escaner-vivo";

/** Después de escribir la OF, la cámara vuelve cuando el teclado ya bajó. */
const ESPERA_TECLADO_MS = 800;
const CLASES_CAMARA = ["camara-viva", "camara-sola"];

export function useCamaraViva({
  pausada,
  alCuadro,
  alEmpezar,
  alPrender,
  alFallar,
}: {
  pausada: boolean;
  alCuadro: (c: CuadroVivo) => void;
  /** Justo antes de pedir la cámara (cada vez que vuelve). */
  alEmpezar: () => void;
  /** La cámara quedó prendida, con lo que sabe hacer. */
  alPrender: (camara: CamaraViva) => void;
  alFallar: (motivo: string) => void;
}) {
  const [camara, setCamara] = useState<CamaraViva | null>(null);
  /** La cámara está prendida: el teclado se abre recién cuando se apagó. */
  const [enVivo, setEnVivo] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const avisos = useRef({ alCuadro, alEmpezar, alPrender, alFallar });
  useEffect(() => {
    avisos.current = { alCuadro, alEmpezar, alPrender, alFallar };
  }, [alCuadro, alEmpezar, alPrender, alFallar]);

  const yaPrendio = useRef(false);
  useEffect(() => {
    if (pausada) return;
    let vivo = true;
    let prendida: Promise<(() => Promise<void>) | null> = Promise.resolve(null);
    const prender = () => {
      document.documentElement.classList.add(...CLASES_CAMARA);
      avisos.current.alEmpezar();
      prendida = iniciarEscanerVivo((c) => avisos.current.alCuadro(c), { foto: "cuadro" }).then(
        (r) => {
          if (vivo) {
            yaPrendio.current = true;
            setCamara(r.camara);
            setEnVivo(true);
            avisos.current.alPrender(r.camara);
          }
          return r.apagar;
        },
        (e: unknown) => {
          if (vivo) {
            document.documentElement.classList.remove(...CLASES_CAMARA);
            avisos.current.alFallar(e instanceof Error && /permiso/.test(e.message) ? "Sin permiso de cámara." : "No se pudo abrir la cámara.");
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
      document.documentElement.classList.remove(...CLASES_CAMARA);
      setLinterna(false);
      void prendida.then((apagar) => apagar?.()).finally(() => setEnVivo(false));
    };
  }, [pausada]);

  const alternarLinterna = useCallback(async () => {
    if (await linternaViva(!linterna)) setLinterna(!linterna);
  }, [linterna]);

  return { camara, enVivo, linterna, alternarLinterna };
}
