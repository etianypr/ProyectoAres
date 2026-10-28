// Los marcadores del mapa como elementos del DOM: las paradas numeradas y el punto
// del conductor, su tamaño según el zoom y cómo se desliza (sale de ruta-mapa.tsx,
// spec 002 T038).

import type mapboxgl from "mapbox-gl";
import { distanciaMetros, type PuntoLngLat } from "@/lib/geo/coordenada";
import { MS_DESPLAZAMIENTO, ZOOM_NAVEGACION } from "./camara";
import type { PuntoMapa } from "./tipos";

// Más que esto entre dos lecturas no se anima: es la señal que volvió tras un
// rato sin GPS, y deslizar el punto cruzaría manzanas enteras.
export const METROS_MAXIMOS_DESLIZAR = 150;

/**
 * Lleva el punto a su posición nueva en el mismo tiempo y al mismo ritmo
 * (lineal) que la cámara (spec 017, N5). Antes saltaba de golpe mientras la
 * cámara se deslizaba un segundo: durante ese segundo el punto se veía
 * adelantado y volvía al centro, un tirón por cada lectura de GPS. El giro
 * también se anima, y por el lado corto.
 */
export function deslizarMarcador(
  marcador: mapboxgl.Marker,
  hasta: PuntoLngLat,
  rotacion: number,
  cuadro: { current: number | null },
): void {
  if (cuadro.current != null) cancelAnimationFrame(cuadro.current);
  cuadro.current = null;
  const desde = marcador.getLngLat();
  const rotDesde = marcador.getRotation();
  const giro = ((rotacion - rotDesde + 540) % 360) - 180;
  const lejos =
    distanciaMetros({ lat: desde.lat, lng: desde.lng }, { lat: hasta[1], lng: hasta[0] }) > METROS_MAXIMOS_DESLIZAR;
  if (lejos || typeof requestAnimationFrame === "undefined") {
    marcador.setLngLat(hasta).setRotation(rotacion);
    return;
  }
  const inicio = performance.now();
  const avanzar = (ahora: number) => {
    const t = Math.min(1, (ahora - inicio) / MS_DESPLAZAMIENTO);
    marcador
      .setLngLat([desde.lng + (hasta[0] - desde.lng) * t, desde.lat + (hasta[1] - desde.lat) * t])
      .setRotation(rotDesde + giro * t);
    cuadro.current = t < 1 ? requestAnimationFrame(avanzar) : null;
  };
  cuadro.current = requestAnimationFrame(avanzar);
}

// El elemento del suelo se dibuja acostado sobre la calle: a 55° de
// inclinación la perspectiva se come casi la mitad del alto, así que necesita
// bastante más lienzo del que termina ocupando en pantalla.
export const TAMANO_MARCADOR = 128;

// ----------------------------------------------------------------------------
// El tamaño del punto según el zoom
// ----------------------------------------------------------------------------
// El marcador es un elemento del DOM: sin tocarlo mide siempre lo mismo en
// PANTALLA, así que al alejar el mapa las cuadras se achican y él no. Se ve
// como si creciera solo, hasta quedar un manchón que tapa el barrio.
//
// Así que se pega al TERRENO: conserva el tamaño REAL que tiene manejando —unos
// 9 m de disco al zoom de navegación— y se achica a la par del mapa. Cada nivel
// de zoom es el doble de escala, de ahí la potencia de dos.
//
// Con dos topes:
//
//   · no pasa de 1: acercando más allá del zoom de navegación el punto no se
//     agranda. El de manejar es el más grande que existe;
//   · no baja de 0.45, unos 18 px de disco —el tamaño del punto de Mapas—. En
//     la vista de la ruta entera, el tamaño real serían dos píxeles: un punto
//     que no se encuentra, y un haz que directamente no se ve.
export const ESCALA_MINIMA_MARCADOR = 0.45;

export function escalaMarcador(zoom: number): number {
  return Math.min(1, Math.max(ESCALA_MINIMA_MARCADOR, 2 ** (zoom - ZOOM_NAVEGACION)));
}

// Se escala el SVG y no el elemento del marcador: ese transform lo escribe
// Mapbox —posición, giro e inclinación— y pisarlo deja el punto clavado en una
// esquina de la pantalla.
export function ajustarEscalaMarcador(marcador: mapboxgl.Marker, zoom: number): void {
  const svg = marcador.getElement().querySelector("svg");
  if (svg) svg.style.transform = `scale(${escalaMarcador(zoom).toFixed(3)})`;
}

export function colorPunto(p: PuntoMapa, previa: boolean): string {
  // En una ruta propuesta ninguna parada es "la que sigue" todavía: van todas
  // del mismo color, el de marca, igual que su línea.
  if (previa) return "#0f766e";
  if (p.activa) return "#c0362c";
  if (p.completada) return "#2e9e5b";
  return "#6e6e73";
}

/** Largo del globo: la dirección corta, en una o dos líneas. */
const LARGO_GLOBO = 48;

/** El globo que sale al tocar un número: "3 · GINEBRA 4081". Va como texto,
 *  no como HTML: la dirección viene de la guía. */
export function contenidoGlobo(p: PuntoMapa): HTMLElement {
  const d = p.direccion.trim();
  const corta = d.length > LARGO_GLOBO ? `${d.slice(0, LARGO_GLOBO).replace(/\s+\S*$/, "")}…` : d;
  const el = document.createElement("div");
  el.style.cssText = "font-size:14px;font-weight:600;line-height:1.3;color:#1c1c1e";
  el.textContent = corta ? `${p.label} · ${corta}` : p.label;
  return el;
}

export function elementoParada(p: PuntoMapa, previa = false): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `background:${colorPunto(p, previa)};color:#fff;border-radius:9999px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;box-shadow:0 1px 4px rgba(0,0,0,.4)`;
  el.textContent = p.label;
  return el;
}

// ----------------------------------------------------------------------------
// El marcador del conductor
// ----------------------------------------------------------------------------
// TODO lo que lo compone vive en el plano de la CALLE: se crea con
// pitchAlignment "map", así que Mapbox le aplica rotateX(inclinación) +
// rotateZ(giro) y queda acostado sobre el pavimento. Inclinando o girando el
// mapa, el marcador se inclina y gira con él — está pegado al terreno, no
// dibujado sobre el vidrio.
//
// Nada de esto puede alinearse a la pantalla, ni siquiera el punto redondo. Un
// elemento derecho mientras el mapa se inclina se despega de la calle y flota:
// deja de ser "el conductor está acá" y pasa a ser una calcomanía en la ventana.
//
// La figura es UNA sola —el disco, siempre del mismo tamaño— y lo que cambia es
// lo que lleva adentro o alrededor, según el modo. Igual que en Mapas:
//
//   · siguiendo (manejando)   disco + flecha blanca con el sentido del auto. El
//                             haz no va: hacia dónde apunta el teléfono no le
//                             importa a nadie que va manejando, y el mapa ya
//                             está girado hacia adelante;
//   · mapa suelto             disco + haz. Acá el punto deja de querer decir
//                             "voy para allá" y pasa a decir "estás acá, y
//                             estás mirando para allá", que es lo que ubica a
//                             alguien que está paseando el mapa. El haz apunta
//                             a donde apunta el TELÉFONO cuando hay brújula
//                             (ver use-brujula) y, si no la hay, al último
//                             rumbo conocido — el haz tiene que estar igual: es
//                             lo que distingue este modo del de manejo, y sin
//                             él los dos se ven idénticos;
//   · sin rumbo de ninguno    el disco solo. Una flecha (o un haz) apuntando a
//                             cualquier lado es peor que no tener ninguna.
//
// El tamaño lo maneja escalaMarcador: va pegado al terreno, no a la pantalla.
//
// La sombra de contacto va siempre: es lo que apoya la figura en la calle.

/** Sombra, haz, disco y flecha: todo en el plano de la calle. */
export function elementoUbicacion(): HTMLElement {
  const el = document.createElement("div");
  el.style.cssText = `position:absolute;width:${TAMANO_MARCADOR}px;height:${TAMANO_MARCADOR}px;pointer-events:none;will-change:transform`;
  el.innerHTML = `
<svg width="${TAMANO_MARCADOR}" height="${TAMANO_MARCADOR}" viewBox="0 0 128 128" style="display:block;transform-origin:center">
  <defs>
    <!-- El haz se desvanece hacia adelante en vez de cortarse: un borde duro
         parecía el alcance de un sensor y no "por acá voy". -->
    <radialGradient id="pucarani-cono" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2f56c9" stop-opacity=".45"/>
      <stop offset="55%" stop-color="#2f56c9" stop-opacity=".15"/>
      <stop offset="100%" stop-color="#2f56c9" stop-opacity="0"/>
    </radialGradient>
    <!-- El disco se aclara hacia adelante. Acostado sobre la calle, ese
         degradado es lo que le da volumen: sin él es una mancha plana. -->
    <linearGradient id="pucarani-disco" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a76e8"/>
      <stop offset="55%" stop-color="#2547ad"/>
      <stop offset="100%" stop-color="#16307a"/>
    </linearGradient>
    <!-- Sombra de contacto: sin ella la flecha flota sobre la calle. -->
    <radialGradient id="pucarani-sombra" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#0b1020" stop-opacity=".35"/>
      <stop offset="60%" stop-color="#0b1020" stop-opacity=".14"/>
      <stop offset="100%" stop-color="#0b1020" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Haz de 60° saliendo del punto, como el de Mapas. Solo con el mapa suelto,
       que es casi siempre con el mapa alejado: ahí el marcador está en su
       tamaño mínimo y este radio de 62 queda en unos 28 px, que es lo que hace
       falta para que se vea de qué lado mira el punto. -->
  <g data-cono style="opacity:0;transition:opacity .35s ease-out">
    <path d="M64 64 L33 10.3 A62 62 0 0 1 95 10.3 Z" fill="url(#pucarani-cono)"/>
  </g>

  <!-- Va siempre: es lo que apoya la figura en el pavimento. -->
  <ellipse cx="64" cy="70" rx="24" ry="20" fill="url(#pucarani-sombra)"/>

  <!-- El disco, centrado en la coordenada. También acostado: al inclinar el
       mapa se convierte en una elipse, que es exactamente lo que hace un
       círculo pintado en el suelo. El borde oscuro apenas se nota, pero es lo
       que lo despega de un pavimento claro. -->
  <circle cx="64" cy="64" r="20" fill="#fff" stroke="#0b1020" stroke-opacity=".12"/>
  <circle cx="64" cy="64" r="16" fill="url(#pucarani-disco)"/>

  <!-- La flecha del sentido del auto, adentro del disco. Alargada a propósito:
       a 55° la perspectiva se come el 43% del alto, y una flecha de
       proporciones normales queda como una raya. -->
  <g data-flecha style="opacity:0;transition:opacity .3s ease-out">
    <path d="M64 51.5 L73.5 74.5 L64 69 L54.5 74.5 Z" fill="#fff"/>
  </g>
</svg>`;
  return el;
}
