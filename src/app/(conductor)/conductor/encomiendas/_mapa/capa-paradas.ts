// Las paradas DIBUJADAS POR EL MAPA (WebGL), no como elementos de la página
// (terreno 2026-10-29: "tantos puntos animados hacen que el rendimiento caiga").
//
// Antes cada parada era un div con sombra (filter: drop-shadow) y animación de
// entrada. Navegando, la cámara se desliza con cada lectura del GPS y el
// teléfono tenía que reubicar y repintar ~66 divs en cada cuadro (34 cuadros
// por segundo y 65 lentos en 7 s, medido en el teléfono). Como capa del mapa:
// 56 por segundo y 0 a 1 lentos.
//
// La FORMA es la de antes —la pastilla con punta, la cifra en monoespaciada, el
// anillo claro y la sombra— porque es la que el dueño eligió ("esas eran mucho
// más bonitas"): cada pastilla se dibuja UNA vez en un lienzo, igual que la
// pintaba el CSS, y el mapa la usa como imagen. Lo único que sigue en el DOM es
// el punto del conductor (use-marcador-conductor).
import type mapboxgl from "mapbox-gl";
import type { Coordenada } from "@/lib/geo/coordenada";
import type { LugarMapa } from "./marcadores-dom";

export const FUENTE_PARADAS = "paradas";
const CAPA_PINES = "paradas-pines";

/** Los colores de la pastilla, como en el tema Dashund. */
const COLORES = {
  pendiente: "#8a7d74",
  hecha: "#0f6b45",
  previa: "#d4531a",
  activa: "#d4531a",
  central: "#221a15",
} as const;
type Estado = keyof typeof COLORES;
/** Encima la activa y la central; debajo, las hechas. */
const ENCIMA: Record<Estado, number> = { hecha: 0, pendiente: 1, previa: 2, activa: 3, central: 4 };

const ANILLO = "#fdfbf9";
const SOMBRA = "rgba(34, 26, 21, 0.28)";
/** Lo que el lienzo deja alrededor para la sombra: el mapa lo descuenta al
 *  anclar, así la punta cae justo en el lugar. */
const MARGEN = 7;

/** Margen del dedo: una pastilla de 26 px se toca sin apuntar. */
const MARGEN_TOQUE_PX = 14;
/** El fundido con que entran los puntos de una ruta propuesta. */
const MS_ENTRADA = 400;

function estadoDe(l: LugarMapa, previa: boolean): Estado {
  if (previa) return "previa";
  if (l.puntos.some((p) => p.activa)) return "activa";
  if (l.puntos.every((p) => p.completada)) return "hecha";
  return "pendiente";
}

/** Lo que va escrito en un lugar con varias paradas: "40–43" si son seguidas,
 *  "41+3" si no. Antes iban todas ("41·42·43·40"); al tocarlo, el globo las
 *  sigue nombrando una por una. */
export function cifraDelLugar(etiquetas: string[]): string {
  if (etiquetas.length === 1) return etiquetas[0];
  const numeros = etiquetas.map(Number);
  if (numeros.every(Number.isInteger)) {
    const orden = [...numeros].sort((a, b) => a - b);
    if (orden.every((n, i) => i === 0 || n === orden[i - 1] + 1)) return `${orden[0]}–${orden[orden.length - 1]}`;
  }
  return `${etiquetas[0]}+${etiquetas.length - 1}`;
}

type Propiedades = { i: number; imagen: string; encima: number };
type Punto = { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: Propiedades };
export type DatosParadas = { type: "FeatureCollection"; features: Punto[] };

const idImagen = (estado: Estado, cifra: string) => `pin|${estado}|${cifra}`;

/** Lo que dibuja la capa: un punto por lugar ("30–31" si caen juntas) y la
 *  central. `i` es el índice del lugar, para abrir su globo al tocarlo. */
export function datosParadas(lugares: LugarMapa[], previa: boolean, central: Coordenada | null): DatosParadas {
  const punto = (lng: number, lat: number, p: Propiedades): Punto => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties: p,
  });
  const features = lugares.map((l, i) => {
    const estado = estadoDe(l, previa);
    return punto(l.lng, l.lat, {
      i,
      imagen: idImagen(estado, cifraDelLugar(l.puntos.map((p) => p.label))),
      encima: ENCIMA[estado],
    });
  });
  if (central) features.push(punto(central.lng, central.lat, { i: -1, imagen: idImagen("central", "C"), encima: ENCIMA.central }));
  return { type: "FeatureCollection", features };
}

// ----------------------------------------------------------------------------
// La pastilla, dibujada como la pintaba el CSS de antes (.pin-parada)
// ----------------------------------------------------------------------------

function variable(nombre: string, respaldo: string): string {
  const v = typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() : "";
  return v ? `${v}, ${respaldo}` : respaldo;
}

/** La letra de las cifras y la del texto (la "C" de la central), del tema. */
export function fuentesDelTema(): { cifras: string; texto: string } {
  return {
    cifras: variable("--font-cifras", "ui-monospace, monospace"),
    texto: variable("--font-texto", "ui-sans-serif, system-ui, sans-serif"),
  };
}

/** Una pastilla con punta: 26 px de alto (32 la activa y la central), tan ancha
 *  como pida la cifra, anillo claro de 2 px, punta de 7 px y sombra suave. */
function dibujarPin(estado: Estado, cifra: string, escala: number): ImageData {
  const grande = estado === "activa" || estado === "central";
  const alto = grande ? 32 : 26;
  const tamano = estado === "central" ? 14 : grande ? 13 : 11.5;
  const fuentes = fuentesDelTema();
  const letra = estado === "central" ? `800 ${tamano}px ${fuentes.texto}` : `600 ${tamano}px ${fuentes.cifras}`;

  const medidor = document.createElement("canvas").getContext("2d")!;
  medidor.font = letra;
  const ancho = Math.max(alto, Math.ceil(medidor.measureText(cifra).width) + 14);

  const anillo = 2;
  const punta = 7;
  const w = ancho + anillo * 2 + MARGEN * 2;
  // Abajo de la punta solo el margen: así el borde inferior del lienzo está a
  // MARGEN de la punta, que es lo que descuenta "icon-offset".
  const h = MARGEN + anillo + alto + punta - 1 + MARGEN;
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.ceil(w * escala);
  lienzo.height = Math.ceil(h * escala);
  const ctx = lienzo.getContext("2d")!;
  ctx.scale(escala, escala);

  const x = MARGEN + anillo;
  const y = MARGEN + anillo;
  const color = COLORES[estado];

  // Con sombra: el anillo y la punta (lo que se apoya en el mapa).
  ctx.shadowColor = SOMBRA;
  ctx.shadowBlur = 4 * escala;
  ctx.shadowOffsetY = 3 * escala;
  ctx.beginPath();
  ctx.roundRect(x - anillo, y - anillo, ancho + anillo * 2, alto + anillo * 2, alto / 2 + anillo);
  ctx.fillStyle = ANILLO;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + ancho / 2 - 6, y + alto - 1);
  ctx.lineTo(x + ancho / 2 + 6, y + alto - 1);
  ctx.lineTo(x + ancho / 2, y + alto + punta - 1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // Sin sombra: la pastilla y la cifra.
  ctx.shadowColor = "transparent";
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, alto / 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = letra;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (estado !== "central" && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-0.02em";
  }
  ctx.fillText(cifra, x + ancho / 2, y + alto / 2 + 0.5);

  return ctx.getImageData(0, 0, lienzo.width, lienzo.height);
}

/** Agrega las pastillas que falten (una por cifra y estado: se dibujan una vez). */
function asegurarImagenes(mapa: mapboxgl.Map, datos: DatosParadas): void {
  const escala = Math.min(3, Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio : 1));
  for (const f of datos.features) {
    const id = f.properties.imagen;
    if (mapa.hasImage(id)) continue;
    const [, estado, cifra] = id.split("|") as [string, Estado, string];
    mapa.addImage(id, dibujarPin(estado, cifra, escala), { pixelRatio: escala });
  }
}

/** La capa de las pastillas. Va encima de las líneas. */
export function agregarParadas(mapa: mapboxgl.Map): void {
  mapa.addSource(FUENTE_PARADAS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  mapa.addLayer({
    id: CAPA_PINES,
    type: "symbol",
    source: FUENTE_PARADAS,
    layout: {
      "icon-image": ["get", "imagen"],
      // Anclada en la punta, como el marcador de antes (anchor "bottom"): el
      // margen de la sombra se descuenta para que la punta caiga en el lugar.
      "icon-anchor": "bottom",
      "icon-offset": [0, MARGEN],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["get", "encima"],
      // Derechas aunque el mapa esté inclinado, como eran los marcadores.
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
    },
  });
}

/** Pone los puntos. Con `entrar` (aparece una ruta propuesta) entran con un
 *  fundido: una sola transición del mapa, no una animación por punto. */
export function ponerParadas(mapa: mapboxgl.Map, datos: DatosParadas, entrar: boolean): void {
  asegurarImagenes(mapa, datos);
  (mapa.getSource(FUENTE_PARADAS) as mapboxgl.GeoJSONSource | undefined)?.setData(datos as never);
  if (!entrar) return;
  mapa.setPaintProperty(CAPA_PINES, "icon-opacity-transition", { duration: 0, delay: 0 });
  mapa.setPaintProperty(CAPA_PINES, "icon-opacity", 0);
  requestAnimationFrame(() => {
    mapa.setPaintProperty(CAPA_PINES, "icon-opacity-transition", { duration: MS_ENTRADA, delay: 0 });
    mapa.setPaintProperty(CAPA_PINES, "icon-opacity", 1);
  });
}

/** El lugar que tocó el dedo (índice en la lista de lugares), o null. */
export function lugarTocado(mapa: mapboxgl.Map, punto: mapboxgl.Point): number | null {
  const caja: [mapboxgl.PointLike, mapboxgl.PointLike] = [
    [punto.x - MARGEN_TOQUE_PX, punto.y - MARGEN_TOQUE_PX],
    [punto.x + MARGEN_TOQUE_PX, punto.y + MARGEN_TOQUE_PX],
  ];
  const tocados = mapa.queryRenderedFeatures(caja, { layers: [CAPA_PINES] });
  // El de más arriba: la activa antes que una hecha que quedó debajo.
  const i = tocados
    .map((f) => (f as unknown as { properties?: Partial<Propiedades> }).properties)
    .map((p) => ({ i: Number(p?.i ?? -1), encima: Number(p?.encima ?? 0) }))
    .filter((t) => t.i >= 0)
    .sort((a, b) => b.encima - a.encima)[0]?.i;
  return i ?? null;
}
