"use client";

// Mapa de navegación del conductor, con MapLibre GL JS (spec 019; antes Mapbox GL
// JS, que cobra pasado lo gratis) y el mapa de OpenFreeMap: easeTo() desplaza, gira e
// inclina en UNA sola animación sobre la placa de video, y las etiquetas de calle
// se quedan derechas (con Leaflet el giro era un complemento que peleaba con el
// arrastre y el zoom).

import { useEffect, useRef, useState } from "react";
import { AttributionControl, LngLatBounds, Map as MapaGL, Popup, setWorkerUrl, type GeoJSONSource, type Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CENTRO_ARICA, aLngLat, type Trazado } from "@/lib/geo/coordenada";
import { ESTILO, FUENTE_DIA, FUENTE_NAV, FUENTE_PREVIA, URL_WORKER, agregarLineas, linea, soportaWebGL, ajustarEstilo } from "./estilo";
import { agruparPorLugar, contenidoGlobo, type LugarMapa } from "./marcadores-dom";
import { agregarParadas, datosParadas, fuentesDelTema, lugarTocado, ponerParadas } from "./capa-paradas";
import type { PreviaRuta, PuntoMapa, Ubicacion } from "./tipos";
import { useCamaraNavegacion } from "./use-camara";
import { useMarcadorConductor } from "./use-marcador-conductor";

// Piezas: tipos.ts (lo que recibe), estilo.ts, camara.ts, marcadores-dom.ts
// (spec 002 T038), capa-paradas.ts (las paradas, dibujadas por el mapa).
export type { PreviaRuta, PuntoMapa, Ubicacion } from "./tipos";

/** Margen del encuadre de la propuesta: arriba, el botón del menú y la cinta del
 *  modo prueba; abajo, lo que tapa el panel de la propuesta. */
const RELLENO_ARRIBA = 76;
const RELLENO = 28;
/** Zoom mínimo al ir a una parada cercana: se ven la calle y las de al lado. */
const ZOOM_ENFOQUE = 16.5;
/** Alto mínimo que queda para dibujar la ruta, aunque el panel sea alto. */
const ALTO_MINIMO_RUTA = 160;

function rellenoConPanel(contenedor: HTMLElement) {
  const panel = document.querySelector<HTMLElement>("[data-propuesta-ruta]");
  // offsetHeight y no el rectángulo: el panel entra deslizándose (transform).
  const tapa = panel ? contenedor.getBoundingClientRect().bottom - (window.innerHeight - panel.offsetHeight) : 0;
  const tope = contenedor.clientHeight - RELLENO_ARRIBA - ALTO_MINIMO_RUTA;
  return { top: RELLENO_ARRIBA, left: RELLENO, right: RELLENO, bottom: Math.max(RELLENO, Math.min(tapa + RELLENO, tope)) };
}

export function RutaMapa({
  puntos,
  miUbicacion,
  rumbo,
  rumboBrujula,
  claveDestino,
  destino = null,
  trazado,
  geometriaNavegacion,
  previa,
  central,
  siguiendo,
  onArrastre,
  enfoque = null,
}: {
  puntos: PuntoMapa[];
  /** Posición GPS actual del conductor (ver useUbicacionActual) — mientras
   *  "siguiendo" esté activo, centra el mapa en modo navegación (como Google
   *  Maps/Waze); no afecta el orden de las paradas. */
  miUbicacion?: Ubicacion | null;
  /** Hacia dónde va el conductor, en grados horarios desde el norte: con esto se
   *  GIRA el mapa para que esa dirección quede siempre "arriba", y se orienta
   *  la flecha del punto. Sale del camino que viene por delante en la ruta (ver
   *  rumboDelCamino) y, si no hay ruta, del rumbo del GPS. */
  rumbo?: number | null;
  /** Hacia dónde APUNTA el teléfono (ver useBrujula). Solo orienta el haz del
   *  punto con el mapa suelto; nunca gira el mapa —la brújula se mueve con la
   *  mano y giraría la vista con el teléfono, no con el auto. */
  rumboBrujula?: number | null;
  /** Identifica la parada a la que se está yendo. Cuando cambia —se terminó una
   *  entrega y arrancó el tramo siguiente— el mapa vuelve a acomodarse al
   *  camino nuevo: centro, zoom, inclinación y orientación. */
  claveDestino?: string | null;
  /** La parada activa: cerca, el mapa se acerca para la llegada (camara.ts). */
  destino?: { lat: number; lng: number } | null;
  /** Trazado de la ruta completa del día ([lng, lat]): apagado, de referencia. */
  trazado?: Trazado | null;
  /** Trazado desde la posición actual hasta la parada activa (ver
   *  useNavegacion): esta es la línea que el conductor tiene que seguir ahora,
   *  así que va destacada por encima de la anterior. */
  geometriaNavegacion?: Trazado | null;
  /** Ruta propuesta a la vista (PreviaRuta): reemplaza los marcadores del día. */
  previa?: PreviaRuta | null;
  /** La central, de donde sale y adonde vuelve la ruta: una C (terreno 2026-10-28). */
  central?: { lat: number; lng: number } | null;
  /** Modo navegación: el mapa sigue y orienta según la ubicación del conductor.
   *  El estado vive en el componente padre porque el botón para retomarlo
   *  también (ver controles-mapa.tsx). */
  siguiendo: boolean;
  /** Arrastró el mapa a mano: deja de seguirlo hasta que toque "centrar". */
  onArrastre: () => void;
  /** Una parada cercana que el conductor tocó en su lista (spec 023): el mapa va
   *  a ella. `clave` cambia en cada toque, para volver aunque sea la misma. */
  enfoque?: { lat: number; lng: number; clave: number } | null;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaGL | null>(null);
  // El estilo se carga de forma ASÍNCRONA y hasta que termine no se pueden
  // agregar fuentes ni capas. Sin avisar por estado, los efectos que dibujan
  // encima corrían una sola vez, encontraban el mapa sin estilo, se iban sin
  // hacer nada y nunca volvían: el mapa quedaba vacío para siempre.
  const [mapaListo, setMapaListo] = useState(false);
  const [soportaMapa] = useState(soportaWebGL);

  const entroModoNavegacionRef = useRef(false);
  /** A qué parada se acomodó la vista por última vez. null = todavía a
   *  ninguna, así que en cuanto se conozca el rumbo hay que acomodarse. */
  const claveOrientadaRef = useRef<string | null>(null);
  const encuadreInicialRef = useRef(false);
  /** Las paradas de la propuesta ya encuadrada (ver el encuadre de la propuesta). */
  const previaEncuadradaRef = useRef<string | null>(null);
  /** Ya se centró en la ubicación del conductor por no haber nada más que mostrar.
   *  Es un ref aparte del de arriba a propósito: centrarse en el punto NO gasta
   *  el encuadre de la ruta, así que cuando aparezcan las paradas el mapa las
   *  encuadra igual. */
  const centradoEnMiRef = useRef(false);
  const usuarioMovioRef = useRef(false);
  // El conductor tiene el dedo en el mapa: el código no toca la vista hasta que
  // suelte, o el movimiento por GPS pelea con el gesto.
  const gestoRef = useRef(false);
  const marcadorUbicacionRef = useRef<Marker | null>(null);
  /** El cuadro de animación del punto en curso (ver deslizarMarcador). */
  const cuadroMarcadorRef = useRef<number | null>(null);
  /** El conductor eligió el zoom con dos dedos: el zoom por velocidad se calla
   *  hasta que vuelva a entrar al modo navegación. */
  const zoomManualRef = useRef(false);
  /** Los lugares dibujados: al tocar uno se abre su globo. */
  const lugaresRef = useRef<LugarMapa[]>([]);
  /** Si lo dibujado era una ruta propuesta: al aparecer una, sus puntos entran. */
  const eraPreviaRef = useRef(false);
  // El handler de arrastre se registra una sola vez, al crear el mapa, así
  // que lee la última versión del callback desde un ref en vez de quedarse
  // con la primera.
  const onArrastreRef = useRef(onArrastre);

  useEffect(() => {
    onArrastreRef.current = onArrastre;
  }, [onArrastre]);

  useEffect(() => {
    const contenedor = contenedorRef.current;
    const cuadro = cuadroMarcadorRef;
    if (!contenedor || mapaRef.current || !soportaMapa) return;

    // MapLibre busca su worker al lado de su archivo, que al empaquetar deja de
    // existir: se sirve desde public/ (scripts/copiar-worker-mapa.mjs).
    setWorkerUrl(URL_WORKER);
    const mapa = new MapaGL({
      container: contenedor,
      style: ESTILO,
      // Respaldo hasta que haya paradas o GPS.
      center: aLngLat(CENTRO_ARICA),
      zoom: 13,
      // Los controles por defecto no se montan: en el celular se hace zoom
      // con los dedos, y la esquina de arriba a la izquierda la ocupan el
      // botón "Inicio" y el cartel de navegación.
      attributionControl: false,
    });
    mapaRef.current = mapa;

    // La atribución es obligatoria por licencia, pero compacta: abajo a la
    // derecha ocupa lo mínimo y no tapa el botón de centrar.
    mapa.addControl(new AttributionControl({ compact: true }), "bottom-right");

    mapa.on("load", () => {
      ajustarEstilo(mapa);

      agregarLineas(mapa);
      agregarParadas(mapa);
      // Letra del tema para las pastillas (capa-paradas.ts), con tope. allSettled: la cara
      // «… Fallback» de next/font usa Arial, que Android no trae, y rechaza con NetworkError.
      const letras = fuentesDelTema();
      void Promise.race([
        Promise.allSettled([document.fonts.load(`600 12px ${letras.cifras}`), document.fonts.load(`800 14px ${letras.texto}`)]),
        new Promise((listo) => setTimeout(listo, 1500)),
      ]).finally(() => setMapaListo(true));
    });

    // Tocar un número abre un globo con su dirección; tocar el mapa lo cierra.
    mapa.on("click", (e) => {
      const i = lugarTocado(mapa, e.point);
      const lugar = i != null ? lugaresRef.current[i] : null;
      if (!lugar) return;
      new Popup({ offset: 36, closeButton: false, maxWidth: "260px" })
        .setLngLat([lugar.lng, lugar.lat])
        .setDOMContent(contenidoGlobo(lugar))
        .addTo(mapa);
    });

    // "dragstart" solo lo dispara un arrastre real del usuario, así que sirve
    // para distinguir "el conductor tomó el control" de un recentrado automático.
    mapa.on("dragstart", () => {
      usuarioMovioRef.current = true;
      onArrastreRef.current();
    });

    // "Tiene el dedo apoyado" se detecta con los eventos del navegador y no con
    // los del mapa: cubre de una sola vez el arrastre y el pellizco, y no hay
    // que adivinar si un "zoomstart" lo disparó el conductor o nuestro propio
    // acercamiento de entrada (que se autocancelaría).
    //
    // Un pellizco NO corta el seguimiento, solo frena el movimiento por código
    // mientras dura — igual que en Maps: acercar no significa "quiero mirar
    // otra cosa". Eso lo decide dragstart, arriba.
    const alTocar = (e: TouchEvent) => {
      gestoRef.current = true;
      if (e.touches.length >= 2) zoomManualRef.current = true;
    };
    const alSoltar = () => {
      gestoRef.current = false;
    };
    contenedor.addEventListener("touchstart", alTocar, { passive: true });
    contenedor.addEventListener("touchend", alSoltar, { passive: true });
    contenedor.addEventListener("touchcancel", alSoltar, { passive: true });

    // Si el contenedor mide 0x0 en el momento exacto de crear el mapa (pasa
    // seguido en Safari/iOS, que asienta el layout un poco más tarde que
    // Chrome), el mapa queda gris para siempre. Se le avisa dos veces con un
    // pequeño retraso.
    const t1 = setTimeout(() => mapa.resize(), 100);
    const t2 = setTimeout(() => mapa.resize(), 500);
    const onResize = () => mapa.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      contenedor.removeEventListener("touchstart", alTocar);
      contenedor.removeEventListener("touchend", alSoltar);
      contenedor.removeEventListener("touchcancel", alSoltar);
      // Es el MISMO objeto ref, leído al limpiar a propósito: el cuadro en curso.
      if (cuadro.current != null) cancelAnimationFrame(cuadro.current);
      marcadorUbicacionRef.current = null;
      mapa.remove();
      mapaRef.current = null;
    };
  }, [soportaMapa]);

  // Marcadores numerados de las paradas. Con una ruta propuesta a la vista se
  // dibujan LAS DE LA PROPUESTA: son otras paradas y en otro orden, y mezclarlas
  // con las de la ruta vigente daría dos números distintos sobre la misma casa.
  const puntosDibujados = previa ? previa.puntos : puntos;
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;

    // Las paradas en el mismo lugar van juntas ("30·31"): si no, una tapa a la otra.
    const lugares = agruparPorLugar(puntosDibujados);
    lugaresRef.current = lugares;
    const esPrevia = previa != null;
    ponerParadas(mapa, datosParadas(lugares, esPrevia, central ?? null), esPrevia && !eraPreviaRef.current);
    eraPreviaRef.current = esPrevia;
  }, [puntosDibujados, previa, central, mapaListo]);

  // A la parada cercana tocada (spec 023). El seguimiento ya se soltó: si no, la
  // próxima lectura del GPS traería el mapa de vuelta.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !enfoque) return;
    mapa.easeTo({ center: [enfoque.lng, enfoque.lat], zoom: Math.max(mapa.getZoom(), ZOOM_ENFOQUE), duration: 600 });
  }, [enfoque, mapaListo]);

  // Los dos trazados. Actualizar los datos de la fuente es todo lo que hace
  // falta: no hay que crear ni destruir capas en cada cambio.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_DIA) as GeoJSONSource | undefined)?.setData(linea(trazado));
  }, [trazado, mapaListo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_NAV) as GeoJSONSource | undefined)?.setData(
      linea(geometriaNavegacion),
    );
  }, [geometriaNavegacion, mapaListo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_PREVIA) as GeoJSONSource | undefined)?.setData(
      linea(previa?.trazado),
    );
  }, [previa, mapaListo]);

  // Al aparecer una ruta propuesta se encuadra COMPLETA, de norte y sin
  // inclinación: es el momento de mirarla entera, no de manejar.
  //
  // El panel de la propuesta va encima del mapa, abajo, y le tapa casi la mitad:
  // se mide cuánto tapa y la ruta se encuadra en lo que queda visible arriba
  // (dueño, 2026-11-07: «tiene que verse toda la ruta»; antes el sur de la ruta
  // quedaba debajo del panel). Se mide y no se supone: el panel cambia de alto
  // con la comparación y los avisos.
  //
  // Una vez por juego de paradas: invertir el orden o elegir otra alternativa no
  // mueve la cámara, para que se vea cambiar la ruta donde se estaba mirando
  // (dueño, 2026-11-07, spec 024). Eliminar o devolver una parada sí encuadra.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!previa) previaEncuadradaRef.current = null;
    if (!mapa || !mapaListo || !previa) return;
    const paradas = previa.puntos.map((p) => `${p.lat},${p.lng}`).sort().join("|");
    if (paradas === previaEncuadradaRef.current) return;
    previaEncuadradaRef.current = paradas;

    const limites = new LngLatBounds();
    for (const c of previa.trazado ?? []) limites.extend(c);
    for (const p of previa.puntos) limites.extend([p.lng, p.lat]);
    if (limites.isEmpty()) return;

    // Este encuadre ya deja el mapa donde tiene que estar: el de "una sola vez"
    // de más abajo no tiene que volver a moverlo al aceptar la ruta.
    encuadreInicialRef.current = true;

    mapa.fitBounds(limites, {
      padding: rellenoConPanel(mapa.getContainer()),
      bearing: 0,
      pitch: 0,
      duration: 700,
      // Con UNA sola parada pendiente el recuadro no tiene tamaño y el encuadre
      // se iría al zoom máximo, dejando la pantalla en media cuadra sin ninguna
      // referencia de dónde queda eso.
      maxZoom: 16,
    });
  }, [previa, mapaListo]);

  // Encuadre de toda la ruta, UNA sola vez: apenas hay paradas que mostrar,
  // para no dejar el mapa clavado en el centro de respaldo (Arica) mientras no
  // haya señal de GPS. No se repite después: ni al re-dibujar, ni al dejar de
  // seguir la ubicación. Si ya se entró a modo navegación, tampoco: ahí manda
  // el GPS.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || puntos.length === 0) return;
    if (encuadreInicialRef.current || usuarioMovioRef.current || entroModoNavegacionRef.current) {
      return;
    }
    encuadreInicialRef.current = true;

    const limites = new LngLatBounds();
    for (const p of puntos) limites.extend([p.lng, p.lat]);
    mapa.fitBounds(limites, { padding: 40, duration: 0 });
  }, [puntos, mapaListo]);

  // Sin paradas y sin propuesta no hay nada que encuadrar, y el mapa se queda en
  // el centro de respaldo mostrando Arica entera: al conductor que todavía no armó
  // la ruta —a primera hora no hay ninguna— eso no le dice nada. Con la primera
  // lectura del GPS se centra UNA vez donde está, a zoom de barrio.
  //
  // No sirve el encuadre de arriba: ese necesita paradas. Y tampoco el modo
  // navegación, que además inclinaría y giraría el mapa — esto es una vista
  // para mirar, no para manejar.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !miUbicacion) return;
    if (puntos.length > 0 || previa) return;
    if (centradoEnMiRef.current || usuarioMovioRef.current || entroModoNavegacionRef.current) {
      return;
    }
    centradoEnMiRef.current = true;
    mapa.jumpTo({ center: [miUbicacion.lng, miUbicacion.lat], zoom: 15 });
  }, [miUbicacion, puntos, previa, mapaListo]);

  // La cámara en modo navegación (ver use-camara.ts) y el punto del conductor
  // (ver use-marcador-conductor.ts).
  useCamaraNavegacion({
    mapaRef,
    mapaListo,
    miUbicacion,
    rumbo,
    claveDestino,
    destino,
    siguiendo,
    refs: { entroModoNavegacionRef, claveOrientadaRef, usuarioMovioRef, gestoRef, zoomManualRef },
  });
  useMarcadorConductor({
    mapaRef,
    mapaListo,
    miUbicacion,
    rumbo,
    rumboBrujula,
    siguiendo,
    marcadorUbicacionRef,
    cuadroMarcadorRef,
  });

  if (!soportaMapa) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-6">
        <p className="max-w-xs text-center text-sm text-muted">Este teléfono no puede mostrar el mapa (no soporta WebGL).</p>
      </div>
    );
  }

  return <div ref={contenedorRef} className="h-full w-full" />;
}
