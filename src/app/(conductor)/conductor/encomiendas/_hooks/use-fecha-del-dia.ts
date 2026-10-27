"use client";

// La fecha del día de trabajo, calculada EN EL TELÉFONO (spec 017, E1).
//
// La página la manda en el HTML, pero ese HTML puede ser de ayer: sin señal el
// service worker sirve la copia guardada, y la APK puede quedar abierta desde la
// noche anterior. Con la fecha de ayer, la guía de hoy se cargaba en el día de
// ayer y al recargar el cierre obligaba a borrar la ruta en curso.
//
// Se revisa al montar, al volver a la app y cada minuto, pero sin cambiar de día en medio de una ruta empezada y abierta: esa
// se termina en su fecha.

import { useEffect, useState } from "react";
import { hoyChile } from "@/lib/comun/fechas";

export function useFechaDelDia(delServidor: string, rutaEnCurso: () => boolean): string {
  const [fecha, setFecha] = useState(delServidor);

  useEffect(() => {
    const revisar = () => {
      const hoy = hoyChile();
      if (hoy !== fecha && !rutaEnCurso()) setFecha(hoy);
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar();
    };
    document.addEventListener("visibilitychange", alVolver);
    const reloj = window.setInterval(revisar, 60_000);
    // Apenas monta: con el HTML viejo todavía no hay ruta cargada y se corrige.
    const ahora = window.setTimeout(revisar, 0);
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(reloj);
      window.clearTimeout(ahora);
    };
  }, [fecha, rutaEnCurso]);

  return fecha;
}
