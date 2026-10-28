"use client";

// Mapa de navegación del conductor, con Mapbox GL JS: easeTo() desplaza, gira e
// inclina en UNA sola animación sobre la placa de video, y las etiquetas de calle
// se quedan derechas (con Leaflet el giro era un complemento que peleaba con el
// arrastre y el zoom).

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { CENTRO_ARICA, aLngLat, type Trazado } from "@/lib/geo/coordenada";
import { ESTILO, FUENTE_DIA, FUENTE_NAV, FUENTE_PREVIA, TOKEN, apagarVerdeDelTrafico, linea, soportaWebGL } from "./estilo";
import { elementoParada } from "./marcadores-dom";
import type { PreviaRuta, PuntoMapa, Ubicacion } from "./tipos";
import { useCamaraNavegacion } from "./use-camara";
import { useMarcadorConductor } from "./use-marcador-conductor";

// Piezas: tipos.ts (lo que recibe), estilo.ts, camara.ts, marcadores-dom.ts
// (spec 002 T038).
export type { PreviaRuta, PuntoMapa, Ubicacion } from "./tipos";


export function RutaMapa({
  puntos,
  miUbicacion,
  rumbo,
  rumboBrujula,
  claveDestino,
  trazado,
  geometriaNavegacion,
  previa,
  siguiendo,
  onArrastre,
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
  /** Trazado de la ruta completa del día ([lng, lat] por punto). Se dibuja
   *  apagado, como referencia. */
  trazado?: Trazado | null;
  /** Trazado desde la posición actual hasta la parada activa (ver
   *  useNavegacion): esta es la línea que el conductor tiene que seguir ahora,
   *  así que va destacada por encima de la anterior. */
  geometriaNavegacion?: Trazado | null;
  /** Ruta propuesta a la vista (ver PreviaRuta). Reemplaza los marcadores de la
   *  ruta del día mientras está puesta. */
  previa?: PreviaRuta | null;
  /** Modo navegación: el mapa sigue y orienta según la ubicación del conductor.
   *  El estado vive en el componente padre porque el botón para retomarlo
   *  también (ver ruta-conductor.tsx). */
  siguiendo: boolean;
  /** El conductor arrastró el mapa a mano: quiere mirar otra cosa, así que hay
   *  que dejar de seguirlo hasta que toque "centrar". */
  onArrastre: () => void;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<mapboxgl.Map | null>(null);
  // El estilo se carga de forma ASÍNCRONA y hasta que termine no se pueden
  // agregar fuentes ni capas. Sin avisar por estado, los efectos que dibujan
  // encima corrían una sola vez, encontraban el mapa sin estilo, se iban sin
  // hacer nada y nunca volvían: el mapa quedaba vacío para siempre.
  const [mapaListo, setMapaListo] = useState(false);
  // Solo se escribe desde el manejador asíncrono de errores de Mapbox (token
  // rechazado, estilo que no carga). Los otros dos casos —sin token, sin
  // WebGL— se saben antes de dibujar y no necesitan estado.
  const [errorMapa, setErrorMapa] = useState<string | null>(null);
  const [soportaMapa] = useState(soportaWebGL);

  const entroModoNavegacionRef = useRef(false);
  /** A qué parada se acomodó la vista por última vez. null = todavía a
   *  ninguna, así que en cuanto se conozca el rumbo hay que acomodarse. */
  const claveOrientadaRef = useRef<string | null>(null);
  const encuadreInicialRef = useRef(false);
  /** Ya se centró en la ubicación del conductor por no haber nada más que mostrar.
   *  Es un ref aparte del de arriba a propósito: centrarse en el punto NO gasta
   *  el encuadre de la ruta, así que cuando aparezcan las paradas el mapa las
   *  encuadra igual. */
  const centradoEnMiRef = useRef(false);
  const usuarioMovioRef = useRef(false);
  // El conductor tiene el dedo en el mapa: el código no toca la vista hasta que
  // suelte, o el movimiento por GPS pelea con el gesto.
  const gestoRef = useRef(false);
  const marcadorUbicacionRef = useRef<mapboxgl.Marker | null>(null);
  /** El cuadro de animación del punto en curso (ver deslizarMarcador). */
  const cuadroMarcadorRef = useRef<number | null>(null);
  /** El conductor eligió el zoom con dos dedos: el zoom por velocidad se calla
   *  hasta que vuelva a entrar al modo navegación. */
  const zoomManualRef = useRef(false);
  const marcadoresParadasRef = useRef<mapboxgl.Marker[]>([]);
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
    if (!contenedor || mapaRef.current || !TOKEN || !soportaMapa) return;

    mapboxgl.accessToken = TOKEN;
    const mapa = new mapboxgl.Map({
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
    mapa.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

    mapa.on("load", () => {
      apagarVerdeDelTrafico(mapa);

      // La ruta del día va primero para que la de navegación quede ENCIMA.
      mapa.addSource(FUENTE_DIA, { type: "geojson", data: linea() });
      mapa.addLayer({
        id: FUENTE_DIA,
        type: "line",
        source: FUENTE_DIA,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#6e6e73", "line-width": 3, "line-opacity": 0.4 },
      });

      mapa.addSource(FUENTE_NAV, { type: "geojson", data: linea() });
      mapa.addLayer({
        id: FUENTE_NAV,
        type: "line",
        source: FUENTE_NAV,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#1d3a8f", "line-width": 6, "line-opacity": 0.9 },
      });

      // Encima de todo: cuando hay una ruta propuesta, es lo único que el conductor
      // tiene que mirar.
      mapa.addSource(FUENTE_PREVIA, { type: "geojson", data: linea() });
      mapa.addLayer({
        id: FUENTE_PREVIA,
        type: "line",
        source: FUENTE_PREVIA,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#0f766e",
          "line-width": 5,
          "line-opacity": 0.95,
          "line-dasharray": [2, 1.2],
        },
      });

      setMapaListo(true);
    });

    mapa.on("error", (e) => {
      // Un estilo que no carga o un token rechazado dejan el mapa gris sin
      // decir nada: sin este mensaje no hay forma de saber qué pasó.
      const mensaje = e.error?.message ?? "";
      if (/access token|Unauthorized|401|403/i.test(mensaje)) {
        setErrorMapa("El token de Mapbox fue rechazado. Avisa al administrador.");
      }
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
      marcadoresParadasRef.current = [];
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

    marcadoresParadasRef.current = puntosDibujados.map((p) =>
      new mapboxgl.Marker({ element: elementoParada(p, previa != null) })
        .setLngLat([p.lng, p.lat])
        .addTo(mapa),
    );

    return () => {
      for (const m of marcadoresParadasRef.current) m.remove();
      marcadoresParadasRef.current = [];
    };
  }, [puntosDibujados, previa, mapaListo]);

  // Los dos trazados. Actualizar los datos de la fuente es todo lo que hace
  // falta: no hay que crear ni destruir capas en cada cambio.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_DIA) as mapboxgl.GeoJSONSource | undefined)?.setData(linea(trazado));
  }, [trazado, mapaListo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_NAV) as mapboxgl.GeoJSONSource | undefined)?.setData(
      linea(geometriaNavegacion),
    );
  }, [geometriaNavegacion, mapaListo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    (mapa.getSource(FUENTE_PREVIA) as mapboxgl.GeoJSONSource | undefined)?.setData(
      linea(previa?.trazado),
    );
  }, [previa, mapaListo]);

  // Al aparecer una ruta propuesta se encuadra COMPLETA, de norte y sin
  // inclinación: es el momento de mirarla entera, no de manejar.
  //
  // El relleno es parejo y chico. Antes se reservaba el 48% de abajo porque el
  // mapa iba a pantalla completa y el panel de la propuesta le tapaba la mitad;
  // ahora la propuesta se mira en el día, donde el mapa es una tarjeta de
  // 224 px y el panel está fuera de él (ver pantalla.tsx). Con aquel relleno, en
  // una tarjeta de ese alto quedaban 70 px para dibujar y la ruta salía
  // ilegible de lo alejada.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !previa) return;

    const limites = new mapboxgl.LngLatBounds();
    for (const c of previa.trazado ?? []) limites.extend(c);
    for (const p of previa.puntos) limites.extend([p.lng, p.lat]);
    if (limites.isEmpty()) return;

    // Este encuadre ya deja el mapa donde tiene que estar: el de "una sola vez"
    // de más abajo no tiene que volver a moverlo al aceptar la ruta.
    encuadreInicialRef.current = true;

    mapa.fitBounds(limites, {
      padding: 28,
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

    const limites = new mapboxgl.LngLatBounds();
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

  const mensajeError = !TOKEN
    ? "Falta configurar el token de Mapbox. Avisa al administrador."
    : !soportaMapa
      ? "Este teléfono no puede mostrar el mapa (no soporta WebGL)."
      : errorMapa;

  if (mensajeError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-6">
        <p className="max-w-xs text-center text-sm text-muted">{mensajeError}</p>
      </div>
    );
  }

  return <div ref={contenedorRef} className="h-full w-full" />;
}
