"use client";

// La cámara en vivo del paso 1 de «Cargar la guía» (dueño, 2026-11-15: «que quede
// funcionando la cámara en la app»): el recuadro muestra lo que ve la cámara de ARES, que
// queda debajo de la pantalla, y el botón redondo saca la foto sin salir a la cámara del
// teléfono. La foto es lo que se ve en el recuadro.
//
// Se había dejado sin cámara en vivo (2026-11-13) por la traba de la spec 028. Aquí va
// como en el barrido de la nómina, que no se traba: la pantalla del día se quita del
// todo mientras la cámara está prendida (`camara-sola`), y la cámara no lee cada cuadro
// (`visor`). Si la APK no trae el visor, o la cámara no abre, `vivo` queda en false y
// «Cargar la guía» sigue con la cámara del teléfono, como antes.

import { useEffect, useRef, useState } from "react";
import { capturarViva, iniciarEscanerVivo, linternaViva, usarVisorVivo, type ZonaViva } from "@/lib/nativo/escaner-vivo";

/** Las mismas clases del barrido (tema-dashund.css): la página transparente sobre la
 *  cámara y, detrás, nada más que la ventana que lleva `capa-camara`. */
const CLASES_CAMARA = ["camara-viva", "camara-sola"];

/** El recuadro en fracciones de la pantalla: lo que la foto tiene que traer. */
function zonaDe(recuadro: Element): ZonaViva {
  const r = recuadro.getBoundingClientRect();
  return { x: r.left / window.innerWidth, y: r.top / window.innerHeight, ancho: r.width / window.innerWidth, alto: r.height / window.innerHeight };
}

export function useVisorVivo(encendido: boolean) {
  const [vivo, setVivo] = useState(false);
  const [conLinterna, setConLinterna] = useState(false);
  const [linterna, setLinterna] = useState(false);
  const [sacando, setSacando] = useState(false);
  /** Hay una foto en camino: un segundo toque no pide otra. */
  const ocupada = useRef(false);
  /** Esta APK no trae el visor o la cámara falló: no se vuelve a intentar en esta ventana. */
  const sinVisor = useRef(false);
  const apagar = useRef<(() => Promise<void>) | null>(null);
  /** Lo último que se le pidió a la cámara: prender y apagar van en fila, nunca cruzados. */
  const fila = useRef<Promise<void>>(Promise.resolve());

  function apagarCamara(): Promise<void> {
    fila.current = fila.current.then(async () => {
      const cerrar = apagar.current;
      apagar.current = null;
      if (!cerrar) return;
      await cerrar();
      document.documentElement.classList.remove(...CLASES_CAMARA);
      setVivo(false);
      setLinterna(false);
    });
    return fila.current;
  }

  useEffect(() => {
    if (!encendido || sinVisor.current || !usarVisorVivo()) return;
    let vigente = true;
    fila.current = fila.current.then(async () => {
      if (!vigente) return;
      try {
        const { camara, apagar: cerrar } = await iniciarEscanerVivo(() => undefined, { visor: true });
        if (!camara.visor || !camara.captura || !vigente) {
          // Una APK anterior ignora `visor` y lee cada cuadro: no sirve de visor.
          if (!camara.visor || !camara.captura) sinVisor.current = true;
          await cerrar();
          return;
        }
        apagar.current = cerrar;
        document.documentElement.classList.add(...CLASES_CAMARA);
        setConLinterna(camara.linterna);
        setVivo(true);
      } catch {
        // Sin permiso o sin cámara: queda la del teléfono.
        sinVisor.current = true;
      }
    });
    return () => {
      vigente = false;
      void apagarCamara();
    };
  }, [encendido]);

  return {
    vivo,
    conLinterna,
    linterna,
    sacando,
    /** Apaga y espera: antes de prender el barrido, que usa la misma cámara. */
    detener: apagarCamara,
    alternarLinterna() {
      void linternaViva(!linterna).then((ok) => ok && setLinterna(!linterna));
    },
    /** La foto de lo que se ve en `recuadro`, o null si la cámara no la dio. */
    async sacar(recuadro: Element | null): Promise<File | null> {
      if (!recuadro || !apagar.current || ocupada.current) return null;
      ocupada.current = true;
      setSacando(true);
      try {
        const foto = await capturarViva({ leer: false, recorte: zonaDe(recuadro) });
        return foto ? new File([foto.imagen], `guia-${Date.now()}.jpg`, { type: "image/jpeg" }) : null;
      } finally {
        ocupada.current = false;
        setSacando(false);
      }
    },
  };
}
