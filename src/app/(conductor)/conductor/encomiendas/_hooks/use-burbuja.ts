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
import { atenderBoton, type AccionesParada, type ExtraBotones, type IdBoton } from "./botones-parada";
import { destinoParaNavegar } from "@/lib/geo/ruta-por-calles";
import { pasoHacia, type RutaParaNavegar } from "@/lib/geo/punto-de-paso";
import { cargarRed } from "@/lib/geo/red/grafo";
import { useRedDeCalles } from "./use-red-de-calles";
import { aDondeNavegar, vistaDeBurbuja, type AvisoBurbuja } from "./vista-burbuja";
import { useEvento } from "./use-evento";
import { hacerMiniatura, miniaturaHecha } from "@/lib/encomiendas/local/miniatura-foto";
import { alIrAlFondo, alVolverAPrimerPlano } from "@/lib/nativo/entorno";

/** Las paradas que faltan: el punto de paso compara solo esas (geo/punto-de-paso.ts). */
const pendientesDe = (paradas: readonly Parada[]) =>
  new Set(paradas.filter((p) => p.pedido.resultado === "pendiente").map((p) => p.pedido.id));

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
  extra,
  onBoton,
  paradas = [],
  onLlamarA,
  onEscanearA,
  ruta = null,
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
  /** Lo que los botones necesitan además de la parada (botones-parada.ts). */
  extra?: ExtraBotones;
  /** Atiende un toque con la guarda del doble toque (use-guarda-toque.ts); sin
   *  esto, atenderBoton directo. */
  onBoton?: (id: IdBoton) => void;
  /** Las paradas del día: la burbuja llama a las que siguen (spec 046). */
  paradas?: readonly Parada[];
  /** Llamar a OTRA parada, o escanear su etiqueta si no tiene teléfono (spec 046). */
  onLlamarA?: (parada: Parada) => void;
  onEscanearA?: (parada: Parada) => void;
  /** La ruta guardada: de su línea sale el punto de paso para que Google Maps llegue
   *  a la parada en el sentido que planeó ARES (geo/punto-de-paso.ts). */
  ruta?: RutaParaNavegar | null;
}) {
  const [enCurso, setEnCurso] = useState(false);
  // Si falta el permiso de mostrarse sobre otras apps (spec 033, burbuja-permiso):
  // la tarjeta lo dice y ofrece pedirlo otra vez, aunque ya se haya pedido hoy.
  const [permiso, setPermiso] = useState<"dado" | "falta" | "no_disponible">("no_disponible");
  useEffect(() => {
    let vigente = true;
    const leer = () => void permisoBurbuja().then((p) => vigente && setPermiso(p));
    leer();
    document.addEventListener("visibilitychange", leer);
    return () => {
      vigente = false;
      document.removeEventListener("visibilitychange", leer);
    };
  }, []);
  const darPermiso = useCallback(async () => {
    marcarPedidoHoy(fecha);
    setPermiso((await pedirPermisoBurbuja()) ? "dado" : "falta");
  }, [fecha]);
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
  // Con el renglón de aviso ocupado, el ⚠ de adelante va en el del estado.
  const adelanteEnEstado = adelante != null && aviso?.texto !== adelante ? adelante : null;
  /** El pedido al que se mandó Google Maps por última vez. */
  const navegada = useRef<string | null>(null);
  /** El pedido de la última vista: si cambia, la burbuja se abre. */
  const mostrada = useRef<string | null>(null);
  // La foto del paquete en miniatura (spec 046): se hace una vez y la vista se redibuja con ella.
  const fotoId = activa?.pedido.fotoId ?? null;
  const [, setFotoLista] = useState<string | null>(null);
  useEffect(() => {
    if (!fotoId || miniaturaHecha(fotoId)) return;
    void hacerMiniatura(fotoId).then(() => setFotoLista(fotoId)).catch(() => {});
  }, [fotoId]);
  const foto = fotoId ? miniaturaHecha(fotoId) : null;

  /** Los km de la parada: Google Maps navegando y, con permiso, la burbuja. */
  const navegar = useCallback(async () => {
    if (!activa || activa.pedido.lat == null || activa.pedido.lng == null) return;
    // En un condominio, a su entrada (spec 031): el mapa de calles tiene que estar
    // cargado, o iría al edificio.
    await cargarRed();
    const destino = destinoParaNavegar({ lat: activa.pedido.lat, lng: activa.pedido.lng });
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
      await mostrarBurbuja(vistaDeBurbuja(activa, fase, { whatsapp, aviso, nueva: true, extra, adelante: adelanteEnEstado, paradas, foto }));
    }
    setPermiso(permiso);
    await navegarA(destino, pasoHacia(ruta, activa.pedido.id, pendientesDe(paradas)));
  }, [activa, fecha, fase, whatsapp, aviso, extra, adelanteEnEstado, paradas, foto, ruta]);

  // La vista de la burbuja, cada vez que cambia algo de la parada. El texto
  // resume la vista: se redibuja solo si cambió, no con cada lectura del GPS.
  const pedidoId = activa?.pedido.id ?? null;
  // Con la burbuja en curso, el mapa de calles se carga: el «Navegar» de la burbuja
  // lleva a la entrada del condominio. Cuando termina de cargar, el hook vuelve a
  // dibujar y la vista sale con la entrada (spec 031).
  useRedDeCalles(enCurso);
  const vistaJson =
    enCurso && activa
      ? JSON.stringify(vistaDeBurbuja(activa, fase, { whatsapp, aviso, nueva: false, extra, adelante: adelanteEnEstado, paradas, foto }))
      : null;
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

  // Cambió la parada activa: Google Maps va a la nueva. Se marca antes de esperar
  // al mapa de calles (si no, otro dibujado la mandaría dos veces) y el destino se
  // calcula después, para que en un condominio sea su entrada (spec 031).
  //
  // Salvo con ARES adelante (spec 047): si el conductor cerró la parada en ARES y
  // no desde la burbuja, sigue guiando ARES; Google Maps no se vuelve a abrir y la
  // burbuja se va. Guía Google Maps mientras se esté en Google Maps.
  // En la APK, `document.visibilityState` sigue en "visible" con Google Maps
  // adelante (visto en el V2430): lo dicen el pause y el resume de la app.
  const adelanteRef = useRef(true);
  useEffect(() => {
    const alFondo = alIrAlFondo(() => (adelanteRef.current = false));
    const alVolver = alVolverAPrimerPlano(() => (adelanteRef.current = true));
    return () => {
      alFondo();
      alVolver();
    };
  }, []);
  useEffect(() => {
    if (!aDondeNavegar(enCurso, navegada.current, activa) || !activa) return;
    navegada.current = activa.pedido.id;
    if (adelanteRef.current) {
      void terminarBurbuja().then(() => setEnCurso(false));
      return;
    }
    void cargarRed().then(() => {
      const destino = aDondeNavegar(true, null, activa);
      if (destino) void navegarA(destino, pasoHacia(ruta, activa.pedido.id, pendientesDe(paradas)));
    });
    // Con `ruta` en la lista no se navega dos veces: si la parada es la misma, aDondeNavegar da null.
  }, [enCurso, activa, ruta, paradas]);

  useEffect(() => {
    if (enCurso) void burbujaEnAres(enAres);
  }, [enCurso, enAres]);

  // Los toques de la burbuja: lo mismo que la tarjeta. "Navegar" con punto ya lo
  // abrió lo nativo; sin punto, ARES vino adelante y se abre la parada para
  // ubicarla. "Volver a ARES" no necesita nada más.
  const alToque = useEvento((id: string) => {
    // «Siguientes paradas» (spec 046): llamar a otra parada, o escanear su etiqueta (la
    // burbuja ya trajo ARES adelante). Si ya no está en el día, el toque no hace nada.
    const [que, pedidoId] = id.split(":");
    if ((que === "llamar" || que === "escanear") && pedidoId) {
      const parada = paradas.find((p) => p.pedido.id === pedidoId);
      if (parada) (que === "llamar" ? onLlamarA : onEscanearA)?.(parada);
      return;
    }
    if (id === "navegar") {
      if (activa && (activa.pedido.lat == null || activa.pedido.lng == null)) acciones.editar();
      return;
    }
    if (onBoton) onBoton(id as IdBoton);
    else atenderBoton(id as IdBoton, acciones);
  });
  useEffect(() => alTocarBurbuja(alToque), [alToque]);

  // Al salir de la pantalla (cerrar sesión, otra página) la burbuja no se queda
  // flotando sin nadie que la atienda.
  useEffect(() => () => void terminarBurbuja(), []);

  /** «Navegar» en ARES (spec 047): si la burbuja quedó de antes, se va. */
  const terminar = useCallback(() => setEnCurso(false), []);

  return { navegar, terminar, enCurso, sinPermiso: permiso === "falta", darPermiso };
}
