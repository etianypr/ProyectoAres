"use client";

// La burbuja de ARES sobre Google Maps (spec 020). Empieza con el primer toque a
// los km de una parada (con el permiso dado) y sigue mientras quede una parada
// activa: no depende de lo que haga Google Maps (FR-004). Mientras está en curso:
//
// - le manda a la burbuja la parada activa y los botones de su paso, cada vez
//   que algo cambia (vista-burbuja.ts);
// - cada toque de la burbuja se atiende con las MISMAS funciones de la tarjeta
//   (botones-parada.ts, `atenderBoton`);
// - cada vez que cambia la parada activa, Google Maps navega a la nueva (FR-008).
//
// Fuera de la APK no hay burbuja: los km abren Google Maps como siempre.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  alTocarBurbuja,
  burbujaEnAres,
  mostrarBurbuja,
  navegarA,
  pedirPermisoBurbuja,
  permisoBurbuja,
  terminarBurbuja,
  type VistaBurbuja,
} from "@/lib/nativo/burbuja";
import type { Parada } from "./dia-trabajo-tipos";
import type { Fase } from "./fase-parada";
import { atenderBoton, type AccionesParada, type IdBoton } from "./botones-parada";
import { aDondeNavegar, vistaDeBurbuja, type AvisoBurbuja } from "./vista-burbuja";
import { useEvento } from "./use-evento";

/** El permiso se pide una vez por día: si el conductor no lo da, los km abren
 *  Google Maps sin burbuja y no se le vuelve a insistir (research R10). */
const CLAVE_PERMISO_PEDIDO = "dashund-burbuja-permiso-pedido";

function yaSePidioHoy(fecha: string): boolean {
  try {
    return localStorage.getItem(CLAVE_PERMISO_PEDIDO) === fecha;
  } catch {
    return false;
  }
}

function marcarPedidoHoy(fecha: string): void {
  try {
    localStorage.setItem(CLAVE_PERMISO_PEDIDO, fecha);
  } catch {
    // Sin almacenamiento se volverá a pedir: no rompe nada.
  }
}

export function useBurbuja({
  fecha,
  activa,
  fase,
  whatsapp,
  deshacer,
  confirmacion,
  enAres,
  acciones,
  adelante = null,
}: {
  fecha: string;
  activa: Parada | null;
  fase: Fase;
  whatsapp: boolean;
  /** Lo último que se cerró, mientras se puede deshacer (use-acciones-parada.ts). */
  deshacer: { texto: string } | null;
  /** Una confirmación que ya no se deshace. */
  confirmacion: { texto: string } | null;
  /** ARES está cargando la guía con la cámara: con ARES atrás la burbuja quedaría
   *  encima. El escáner de la etiqueta se avisa solo mientras está abierto
   *  (lib/nativo/escaner.ts), y el formulario del pedido no cuenta: son pantallas de
   *  ARES que pueden quedar abiertas al volver a Google Maps, y ahí la burbuja tiene
   *  que verse (el vivo, 2026-11-05 y 2026-11-06). */
  enAres: boolean;
  acciones: AccionesParada;
  /** «⚠ En 2 paradas: …» (spec 022): va en el aviso de la burbuja cuando no hay
   *  un «Deshacer» ni una confirmación. Sin tocar android/: solo se ve con la
   *  tarjeta abierta. */
  adelante?: string | null;
}) {
  const [enCurso, setEnCurso] = useState(false);
  const textoDeshacer = deshacer?.texto ?? null;
  const textoConfirmacion = confirmacion?.texto ?? null;
  const aviso = useMemo<AvisoBurbuja>(
    () =>
      textoDeshacer != null
        ? { texto: textoDeshacer, deshacer: true }
        : textoConfirmacion != null
          ? { texto: textoConfirmacion, deshacer: false }
          : adelante != null
            ? { texto: adelante, deshacer: false }
            : null,
    [textoDeshacer, textoConfirmacion, adelante],
  );
  /** El pedido al que se mandó Google Maps por última vez. */
  const navegada = useRef<string | null>(null);
  /** El pedido de la última vista: si cambia, la burbuja se abre. */
  const mostrada = useRef<string | null>(null);

  /** Los km de la parada: Google Maps navegando y, con permiso, la burbuja. */
  const navegar = useCallback(async () => {
    if (!activa || activa.pedido.lat == null || activa.pedido.lng == null) return;
    const destino = { lat: activa.pedido.lat, lng: activa.pedido.lng };
    let permiso = await permisoBurbuja();
    if (permiso === "falta" && !yaSePidioHoy(fecha)) {
      marcarPedidoHoy(fecha);
      permiso = (await pedirPermisoBurbuja()) ? "dado" : "falta";
    }
    // Se marca ANTES de esperar a la burbuja: si no, el efecto de "cambió la
    // activa" ve la burbuja en curso sin parada navegada y manda Google Maps una
    // segunda vez (visto en el vivo, 2026-11-05).
    navegada.current = activa.pedido.id;
    if (permiso === "dado") {
      setEnCurso(true);
      // La primera vista va ANTES de abrir Google Maps: con ella arranca el servicio
      // de la burbuja, y Android 15 solo lo deja arrancar con ARES adelante.
      mostrada.current = activa.pedido.id;
      await mostrarBurbuja(vistaDeBurbuja(activa, fase, { whatsapp, aviso, nueva: true }));
    }
    await navegarA(destino);
  }, [activa, fecha, fase, whatsapp, aviso]);

  // La vista de la burbuja, cada vez que cambia algo de la parada. El texto
  // resume la vista: se redibuja solo si cambió, no con cada lectura del GPS.
  const pedidoId = activa?.pedido.id ?? null;
  const vistaJson =
    enCurso && activa ? JSON.stringify(vistaDeBurbuja(activa, fase, { whatsapp, aviso, nueva: false })) : null;
  useEffect(() => {
    if (!vistaJson) return;
    const vista = JSON.parse(vistaJson) as VistaBurbuja;
    vista.nueva = pedidoId !== mostrada.current;
    mostrada.current = pedidoId;
    void mostrarBurbuja(vista);
  }, [vistaJson, pedidoId]);

  // Sin parada activa (el día terminó) la burbuja se va. Se ajusta durante el
  // dibujado, como se recomienda para un estado que depende de otro.
  if (enCurso && !activa) setEnCurso(false);
  useEffect(() => {
    if (enCurso) return;
    navegada.current = null;
    mostrada.current = null;
    void terminarBurbuja();
  }, [enCurso]);

  // Cambió la parada activa: Google Maps va a la nueva.
  useEffect(() => {
    const destino = aDondeNavegar(enCurso, navegada.current, activa);
    if (destino && activa) {
      navegada.current = activa.pedido.id;
      void navegarA(destino);
    }
  }, [enCurso, activa]);

  useEffect(() => {
    if (enCurso) void burbujaEnAres(enAres);
  }, [enCurso, enAres]);

  // Los toques de la burbuja: lo mismo que la tarjeta. "Navegar" con punto ya lo
  // abrió lo nativo; sin punto, ARES vino adelante y se abre la parada para
  // ubicarla. "Volver a ARES" no necesita nada más.
  const alToque = useEvento((id: string) => {
    if (id === "navegar") {
      if (activa && (activa.pedido.lat == null || activa.pedido.lng == null)) acciones.editar();
      return;
    }
    atenderBoton(id as IdBoton, acciones);
  });
  useEffect(() => alTocarBurbuja(alToque), [alToque]);

  // Al salir de la pantalla (cerrar sesión, otra página) la burbuja no se queda
  // flotando sin nadie que la atienda.
  useEffect(() => () => void terminarBurbuja(), []);

  return { navegar, enCurso };
}
