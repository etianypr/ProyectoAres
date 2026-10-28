"use client";

// WhatsApp en el día del conductor: mandar los avisos al armar la ruta, bajar las
// respuestas y aplicarlas, y el sondeo que las va a buscar (sale de
// use-dia-trabajo.ts, spec 002 T041). En pausa mientras no haya chip (spec 013).

import { useCallback, useEffect, useRef, useState } from "react";
import { leerPedidos, leerRuta } from "@/lib/encomiendas/local/almacen";
import { replanificarRuta } from "@/lib/encomiendas/local/replanificar";
import {
  pedidosSinAviso,
  pedirAviso,
  pedirListaHorarios,
  sincronizarDisponibilidad,
} from "@/lib/encomiendas/local/sincronizar-whatsapp";

/** Cada cuánto se le pregunta al servidor si llegaron respuestas de WhatsApp.
 *
 *  Más seguido que el reintento de la cola de actividad (60 s, ver enviar.ts) y
 *  a propósito: los eventos de actividad solo tienen que llegar en algún momento,
 *  mientras que acá el conductor está ESPERANDO la respuesta para decidir el orden
 *  de la ruta. Medio minuto es lo que tarda en volver a mirar el teléfono
 *  después de cargar un pedido.
 *
 *  El sondeo existe porque las respuestas hay que ir a buscarlas: un aviso
 *  empujado mientras el teléfono no escucha se pierde y el receptor no lo repite
 *  (ver docs/WHATSAPP.md, Diseño). */
const MS_SONDEO_WHATSAPP = 30_000;

export function useWhatsappDia({
  whatsapp,
  conductorId,
  fecha,
  recargar,
  confirmar,
}: {
  /** false = sin credenciales de Meta: no se avisa ni se consulta (spec 013). */
  whatsapp: boolean;
  conductorId: string;
  fecha: string;
  recargar: () => Promise<void>;
  /** Cierra el día si ya no quedan paradas (un "Mañana" pudo cerrar la última). */
  confirmar: () => Promise<void>;
}) {
  const [errorWhatsapp, setErrorWhatsapp] = useState<string | null>(null);
  const [cambiosRuta, setCambiosRuta] = useState<string[]>([]);
  const [avisando, setAvisando] = useState(false);
  // Sin este candado, el sondeo periódico y el disparado por volver a la app
  // mandarían el mismo lote dos veces en paralelo — el mismo problema que ya
  // resuelve enVueloRef en la cola de actividad.
  const whatsappEnVueloRef = useRef(false);

  /** Manda los avisos que falten de una lista de pedidos.
   *
   *  Filtra por `pedidosSinAviso` antes de mandar: al receptor le llegaría el
   *  mismo mensaje dos veces, y rehacer la ruta a media mañana vuelve a pasar por
   *  acá con los mismos pedidos. El servidor tiene la misma comprobación —es la
   *  que de verdad garantiza el "una sola vez"—, pero preguntar acá primero
   *  ahorra una consulta por pedido ya avisado.
   *
   *  Va de a uno y en serie: son consultas al servidor que a su vez llama a Meta,
   *  y treinta en paralelo con una conexión mala es la forma de que fallen todas. */
  const avisarPedidos = useCallback(
    async (pedidoIds: string[]) => {
      if (!whatsapp || pedidoIds.length === 0) return;
      setAvisando(true);
      try {
        // Se relee del teléfono: el estado de React puede no tener el último aviso.
        const ids = new Set(pedidoIds);
        const faltantes = pedidosSinAviso((await leerPedidos(fecha)).filter((p) => ids.has(p.id)));

        let ultimoError: string | null = null;
        for (const pedido of faltantes) {
          const fallo = await pedirAviso(pedido, fecha);
          // Se sigue con los demás: que un número esté mal no puede dejar sin
          // aviso a los otros veintinueve receptores.
          if (fallo) ultimoError = fallo.error;
        }

        setErrorWhatsapp(ultimoError);
        await recargar();
      } finally {
        setAvisando(false);
      }
    },
    [fecha, recargar, whatsapp],
  );

  /** Baja las respuestas, las aplica, manda las listas de horarios que hagan
   *  falta y reintenta los avisos que no salieron. Es el paso 3-5 del flujo
   *  descrito en local/sincronizar-whatsapp.ts.
   *
   *  El reintento vive ACÁ y no en un botón porque el estado de los avisos no es
   *  trabajo del conductor: él ve, por parada, si al receptor hay que llamarlo
   *  (Parada.hayQueContactar), y que el mensaje saliera al primer intento o
   *  al tercero no cambia nada de lo que hace en la puerta. Antes había una
   *  sección entera con contadores y un botón de reintentar por pedido, y lo que
   *  el conductor hacía con eso era tocar reintentar hasta que el número cambiara de
   *  color.
   *
   *  No insiste para siempre: `pedidosSinAviso` descarta los que ya tienen aviso
   *  —al receptor no le puede llegar dos veces— y los que agotaron los intentos
   *  (MAX_INTENTOS_AVISO), que es el caso del número mal escrito. */
  const sincronizarWhatsapp = useCallback(async () => {
    if (whatsappEnVueloRef.current) return;
    whatsappEnVueloRef.current = true;
    try {
      const r = await sincronizarDisponibilidad(conductorId);
      setErrorWhatsapp(r.error);

      // "Mañana" o un bloque elegido: la ruta en curso se reordena sola y el
      // conductor se entera por un aviso (spec 010).
      if (r.cambios.length > 0) {
        const avisos = await replanificarRuta(fecha, r.cambios);
        if (avisos.length > 0) setCambiosRuta((previos) => [...previos, ...avisos]);
        // Un "Mañana" pudo cerrar la última parada pendiente: el día se cierra
        // igual que al marcarla a mano (spec 017, E7).
        await confirmar();
      }

      // Los que tocaron "indicar un horario" necesitan el segundo mensaje: la
      // lista con los bloques. Recién ahora se puede mandar, porque tocar el
      // botón fue lo que abrió la ventana de 24 h (ver la Decisión 8).
      if (r.pedirHorarios.length > 0) {
        const guardados = await leerPedidos(fecha);
        const porId = new Map(guardados.map((p) => [p.id, p] as const));
        for (const id of r.pedirHorarios) {
          const pedido = porId.get(id);
          if (pedido) await pedirListaHorarios(pedido, fecha);
        }
      }

      // Los avisos que quedaron sin salir. La ruta se lee del teléfono en vez de
      // usar el estado del hook para no meter `ruta` en las dependencias: sería
      // reiniciar el sondeo con cada recarga.
      const ruta = await leerRuta(fecha);
      const enRuta = new Set(ruta?.orden ?? []);
      const faltantes = pedidosSinAviso(
        (await leerPedidos(fecha)).filter((p) => enRuta.has(p.id) && p.resultado === "pendiente"),
      );
      // De a uno y en serie, por lo mismo que avisarPedidos: son consultas que a
      // su vez llaman a Meta.
      for (const pedido of faltantes) await pedirAviso(pedido, fecha);

      if (r.aplicadas > 0 || r.pedirHorarios.length > 0 || faltantes.length > 0) {
        await recargar();
      }
    } catch (e) {
      // Sin esto el rechazo quedaba sin manejar (spec 017, E12).
      setErrorWhatsapp(e instanceof Error ? e.message : "No se pudo revisar WhatsApp.");
    } finally {
      whatsappEnVueloRef.current = false;
    }
  }, [fecha, conductorId, recargar, confirmar]);

  const vistoCambioRuta = useCallback(() => setCambiosRuta((previos) => previos.slice(1)), []);

  // Mismo patrón que la cola de actividad: al montar, al volver la conexión, al
  // volver a la app, y cada medio minuto. El conductor no tiene que apretar nada
  // para enterarse de que un receptor contestó.
  useEffect(() => {
    if (!whatsapp) return;
    const alVolver = () => void sincronizarWhatsapp();
    const primera = window.setTimeout(alVolver, 0);
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    const sondeo = setInterval(alVolver, MS_SONDEO_WHATSAPP);

    return () => {
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
      clearInterval(sondeo);
      clearTimeout(primera);
    };
  }, [sincronizarWhatsapp, whatsapp]);

  return { errorWhatsapp, cambiosRuta, avisando, avisarPedidos, vistoCambioRuta };
}
