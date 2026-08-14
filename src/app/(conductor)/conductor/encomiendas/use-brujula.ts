"use client";

import { useEffect, useState } from "react";

// ----------------------------------------------------------------------------
// La brújula del teléfono
// ----------------------------------------------------------------------------
// Hacia dónde APUNTA el aparato, que no es lo mismo que hacia dónde va el auto:
// el rumbo del GPS (ver use-ubicacion-actual) sale de comparar posiciones, así
// que detenido no existe, y el del camino (ver rumboDelCamino) es hacia dónde
// hay que ir, no hacia dónde se está mirando.
//
// Sirve para una sola cosa: el haz del punto con el mapa suelto. Ahí el chofer
// no está manejando —está mirando el mapa con el teléfono en la mano— y lo que
// lo ubica es ver la pantalla apuntando a lo mismo que él.

/** El magnetómetro avisa hasta 60 veces por segundo. A 150 ms el haz sigue el
 *  movimiento sin provocar un dibujado por cuadro. */
const MS_ENTRE_LECTURAS = 150;

/** Apoyado en el auto, el rumbo oscila un par de grados solo. Sin este piso el
 *  haz tiembla quieto y cada temblor es un dibujado. */
const GRADOS_MINIMOS = 3;

/** Diferencia entre dos rumbos, siempre 0-180. */
function difAngulo(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// Safari entrega el rumbo ya resuelto y referido al norte; el resto entrega los
// tres ángulos crudos del aparato.
type EventoOrientacion = DeviceOrientationEvent & { webkitCompassHeading?: number };

// En iOS 13+ los eventos de orientación no llegan hasta que se piden, y solo se
// pueden pedir desde un gesto del usuario.
type ConstructorConPermiso = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

function rumboDelEvento(e: EventoOrientacion): number | null {
  if (typeof e.webkitCompassHeading === "number" && !Number.isNaN(e.webkitCompassHeading)) {
    return e.webkitCompassHeading;
  }

  // "absolute" es lo que separa una brújula de verdad de la orientación
  // relativa al punto donde se encendió la pantalla: sin eso, alpha no dice
  // nada sobre el norte.
  if (!e.absolute || e.alpha == null || Number.isNaN(e.alpha)) return null;

  // alpha crece en sentido ANTIhorario desde el norte, al revés que un rumbo; y
  // está medido contra el borde de arriba del aparato, no contra el de la
  // imagen, así que hay que sumarle cuánto giró la pantalla.
  const pantalla = typeof screen !== "undefined" ? (screen.orientation?.angle ?? 0) : 0;
  return (360 - e.alpha + pantalla + 360) % 360;
}

/** Rumbo de la brújula en grados (0-360, 0 = norte), o null mientras no se
 *  sepa: el teléfono no tiene magnetómetro, el permiso está denegado, o todavía
 *  no llegó la primera lectura. */
export function useBrujula(activa: boolean): number | null {
  const [rumbo, setRumbo] = useState<number | null>(null);

  useEffect(() => {
    if (!activa || typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
      return;
    }

    // Android manda el rumbo absoluto en su propio evento; iOS lo mete en el
    // común, junto con webkitCompassHeading.
    const nombre =
      "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";

    let ultimaLectura = 0;

    const alOrientar = (e: Event) => {
      const ahora = Date.now();
      if (ahora - ultimaLectura < MS_ENTRE_LECTURAS) return;

      const leido = rumboDelEvento(e as EventoOrientacion);
      if (leido == null) return;

      ultimaLectura = ahora;
      setRumbo((anterior) =>
        anterior != null && difAngulo(leido, anterior) < GRADOS_MINIMOS ? anterior : leido,
      );
    };

    const escuchar = () => window.addEventListener(nombre, alOrientar);

    const constructor = DeviceOrientationEvent as ConstructorConPermiso;
    if (typeof constructor.requestPermission !== "function") {
      escuchar();
      return () => window.removeEventListener(nombre, alOrientar);
    }

    // iOS. El permiso se pide en el primer toque que venga —arrastrar el mapa ya
    // es uno—: pedirlo al montar tira la promesa con "requires a user gesture" y
    // el haz no aparecería nunca. Denegado, iOS responde al toque sin volver a
    // mostrar el diálogo, así que esto no molesta más de una vez.
    const pedirPermiso = () => {
      constructor
        .requestPermission?.()
        .then((r) => {
          if (r === "granted") escuchar();
        })
        .catch(() => {
          // Sin brújula el punto se queda con la flecha del rumbo: no hay nada
          // que avisar.
        });
    };
    window.addEventListener("touchend", pedirPermiso, { capture: true, once: true });

    return () => {
      window.removeEventListener(nombre, alOrientar);
      window.removeEventListener("touchend", pedirPermiso, { capture: true });
    };
  }, [activa]);

  return rumbo;
}
