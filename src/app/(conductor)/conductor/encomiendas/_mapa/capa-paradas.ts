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
import type * as maplibregl from "maplibre-gl";
import type { Coordenada } from "@/lib/geo/coordenada";
import type { LugarMapa } from "./marcadores-dom";

const FUENTE_PARADAS = "paradas";
const CAPA_PINES = "paradas-pines";
const CAPA_DIRECCIONES = "paradas-direcciones";

/** Los colores de la pastilla, como en el tema Dashund. */
const COLORES = {
  pendiente: "#8a7d74",
  hecha: "#0f6b45",
  previa: "#d4531a",
  activa: "#d4531a",
  central: "#221a15",
  /** Cercana con la lista abierta (spec 023): blanca con borde y cifra naranjos,
   *  así no se confunde con la activa ni depende solo del color. */
  cercana: "#d4531a",
} as const;
type Estado = keyof typeof COLORES;
/** Encima la activa y la central; debajo, las hechas. */
const ENCIMA: Record<Estado, number> = { hecha: 0, pendiente: 1, previa: 2, cercana: 2, activa: 3, central: 4 };

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
  if (l.puntos.some((p) => p.resaltada)) return "cercana";
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

/** Largo de la dirección escrita sobre la parada: la calle y el número. */
const LARGO_DIRECCION = 26;

/** Lo que va escrito sobre el lugar (dueño, 2026-11-16, como Spoke): la
 *  dirección corta, hasta la primera coma y sin cortar una palabra. Las hechas no
 *  llevan: ya no hay que ir. Pura. */
export function textoDelLugar(l: LugarMapa, previa: boolean): string {
  if (!previa && l.puntos.every((p) => p.completada)) return "";
  const d = (l.puntos[0]?.direccion ?? "").split(",")[0].replace(/\s+/g, " ").trim();
  if (d.length <= LARGO_DIRECCION) return d;
  const corta = d.slice(0, LARGO_DIRECCION).replace(/\s+\S*$/, "");
  return `${corta || d.slice(0, LARGO_DIRECCION)}…`;
}

/** Quién gana el lugar cuando dos direcciones chocan: la activa, la cercana y
 *  después la que viene antes en la ruta. Menor = primero. */
function ordenDelTexto(l: LugarMapa, estado: Estado): number {
  if (estado === "activa") return -2;
  if (estado === "cercana") return -1;
  const n = Math.min(...l.puntos.map((p) => Number(p.label)).filter(Number.isFinite));
  return Number.isFinite(n) ? n : 9999;
}

type Propiedades = { i: number; imagen: string; encima: number; texto: string; orden: number };
type Punto = { type: "Feature"; geometry: { type: "Point"; coordinates: [number, number] }; properties: Propiedades };
type DatosParadas = { type: "FeatureCollection"; features: Punto[] };

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
      texto: textoDelLugar(l, previa),
      orden: ordenDelTexto(l, estado),
    });
  });
  if (central) features.push(punto(central.lng, central.lat, { i: -1, imagen: idImagen("central", "C"), encima: ENCIMA.central, texto: "", orden: 9999 }));
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
  const lienzo = lienzoDelPin(estado, cifra, escala);
  return lienzo.getContext("2d")!.getImageData(0, 0, lienzo.width, lienzo.height);
}

/** La pastilla de la parada activa como elemento de la página, idéntica a la del
 *  mapa y en el mismo lugar (dueño, 2026-11-16: el punto del auto le tapaba la
 *  ubicación). El punto del auto es del DOM y el mapa dibuja debajo de todo el
 *  DOM: la única forma de dejar la parada encima es otro elemento, después de él.
 *  No recibe toques: el toque lo sigue resolviendo la capa del mapa. */
export function elementoPinActiva(cifra: string): HTMLElement {
  const escala = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const lienzo = lienzoDelPin("activa", cifra, escala);
  lienzo.style.width = `${lienzo.width / escala}px`;
  lienzo.style.height = `${lienzo.height / escala}px`;
  const el = document.createElement("div");
  el.style.pointerEvents = "none";
  el.style.zIndex = "2";
  el.append(lienzo);
  return el;
}

/** Margen bajo la punta de la pastilla: el ancla lo descuenta. */
export const MARGEN_PIN = MARGEN;

function lienzoDelPin(estado: Estado, cifra: string, escala: number): HTMLCanvasElement {
  const grande = estado === "activa" || estado === "central";
  const alto = grande ? 32 : 26;
  const tamano = estado === "central" ? 14 : grande ? 13 : 11.5;
  const fuentes = fuentesDelTema();
  const letra = estado === "central" ? `800 ${tamano}px ${fuentes.texto}` : `600 ${tamano}px ${fuentes.cifras}`;

  const medidor = document.createElement("canvas").getContext("2d")!;
  medidor.font = letra;
  const anchoCifra = Math.ceil(medidor.measureText(cifra).width);
  // La hecha lleva un ✓ antes de la cifra: verde contra gris no bastaba, y un
  // estado no depende solo del color («Plano», spec 041).
  const conTilde = estado === "hecha";
  const TILDE = 10;
  const ancho = Math.max(alto, anchoCifra + 14 + (conTilde ? TILDE : 0));

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
  const invertida = estado === "cercana";

  // Con sombra: el anillo y la punta (lo que se apoya en el mapa).
  ctx.shadowColor = SOMBRA;
  ctx.shadowBlur = 4 * escala;
  ctx.shadowOffsetY = 3 * escala;
  ctx.beginPath();
  ctx.roundRect(x - anillo, y - anillo, ancho + anillo * 2, alto + anillo * 2, alto / 2 + anillo);
  ctx.fillStyle = invertida ? color : ANILLO;
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
  ctx.fillStyle = invertida ? "#ffffff" : color;
  ctx.fill();
  ctx.font = letra;
  ctx.fillStyle = invertida ? color : "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (estado !== "central" && "letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "-0.02em";
  }
  const centroCifra = x + ancho / 2 + (conTilde ? TILDE / 2 : 0);
  ctx.fillText(cifra, centroCifra, y + alto / 2 + 0.5);
  if (conTilde) {
    const cx = centroCifra - anchoCifra / 2 - TILDE / 2 - 1;
    const cy = y + alto / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 3.5, cy);
    ctx.lineTo(cx - 1, cy + 2.5);
    ctx.lineTo(cx + 3.5, cy - 2.5);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  return lienzo;
}

/** Agrega las pastillas que falten (una por cifra y estado: se dibujan una vez). */
function asegurarImagenes(mapa: maplibregl.Map, datos: DatosParadas): void {
  const escala = Math.min(3, Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio : 1));
  for (const f of datos.features) {
    const id = f.properties.imagen;
    if (mapa.hasImage(id)) continue;
    const [, estado, cifra] = id.split("|") as [string, Estado, string];
    mapa.addImage(id, dibujarPin(estado, cifra, escala), { pixelRatio: escala });
  }
}

/** La capa de las pastillas y, debajo, la de las direcciones. Van encima de las líneas. */
export function agregarParadas(mapa: maplibregl.Map): void {
  mapa.addSource(FUENTE_PARADAS, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // Las direcciones sobre las paradas (dueño, 2026-11-16: «como Spoke, limpias,
  // nunca una arriba de la otra»). Las dibuja el mapa como el nombre de una calle:
  // si una choca con otra o con una pastilla no se muestra, y vuelve al acercar.
  // Es la misma capa WebGL, sin elementos en la página (ver arriba el rendimiento).
  // Las pastillas se ubican primero (están encima), así ninguna dirección las tapa.
  mapa.addLayer({
    id: CAPA_DIRECCIONES,
    type: "symbol",
    source: FUENTE_PARADAS,
    minzoom: 13.5,
    filter: ["!=", ["get", "texto"], ""],
    layout: {
      "text-field": ["get", "texto"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11.5,
      "text-max-width": 9,
      "text-line-height": 1.1,
      // Arriba de la pastilla; si no cabe, a su derecha o a su izquierda. Fuera
      // del recuadro de la pastilla con su margen de sombra (54 px de alto la
      // activa, 44 de ancho la de una cifra): si lo pisa, el mapa la esconde.
      "text-variable-anchor-offset": ["literal", ["bottom", [0, -4.4], "left", [2.3, -1.9], "right", [-2.3, -1.9]]],
      "text-justify": "auto",
      "symbol-sort-key": ["get", "orden"],
      "text-pitch-alignment": "viewport",
      "text-rotation-alignment": "viewport",
      "text-padding": 1,
    },
    paint: {
      "text-color": "#221a15",
      "text-halo-color": "#fdfbf9",
      "text-halo-width": 1.6,
    },
  });
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
      // Siempre se ven, pero ocupan su lugar: las direcciones no se les ponen encima.
      "icon-ignore-placement": false,
      "icon-padding": 0,
      "symbol-sort-key": ["get", "encima"],
      // Derechas aunque el mapa esté inclinado, como eran los marcadores.
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
    },
  });
}

/** Pone los puntos. Con `entrar` (aparece una ruta propuesta) entran con un
 *  fundido: una sola transición del mapa, no una animación por punto. */
export function ponerParadas(mapa: maplibregl.Map, datos: DatosParadas, entrar: boolean): void {
  asegurarImagenes(mapa, datos);
  (mapa.getSource(FUENTE_PARADAS) as maplibregl.GeoJSONSource | undefined)?.setData(datos as never);
  if (!entrar) return;
  mapa.setPaintProperty(CAPA_PINES, "icon-opacity-transition", { duration: 0, delay: 0 });
  mapa.setPaintProperty(CAPA_PINES, "icon-opacity", 0);
  requestAnimationFrame(() => {
    mapa.setPaintProperty(CAPA_PINES, "icon-opacity-transition", { duration: MS_ENTRADA, delay: 0 });
    mapa.setPaintProperty(CAPA_PINES, "icon-opacity", 1);
  });
}

/** El lugar que tocó el dedo (índice en la lista de lugares), o null. */
export function lugarTocado(mapa: maplibregl.Map, punto: maplibregl.Point): number | null {
  const caja: [maplibregl.PointLike, maplibregl.PointLike] = [
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
