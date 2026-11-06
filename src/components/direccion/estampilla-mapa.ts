// La foto del mapa alrededor de un punto, para la estampilla de mapa-punto.tsx
// (spec 019; antes una imagen de Mapbox Static Images, que se cobra).
//
// OpenFreeMap no entrega imágenes: solo el mapa. Así que se dibuja UNA vez con
// MapLibre en una caja fuera de la pantalla, con el mismo estilo y los tonos
// Dashund del mapa del conductor, se saca la foto del lienzo y el mapa se
// destruye. Queda una imagen, como antes: sin un segundo mapa vivo, sin robarle
// gestos al formulario y sin otro contexto WebGL encendido junto al de
// navegación (el porqué de la imagen está en mapa-punto.tsx).
//
// De a una por vez (hay listas con varias miniaturas) y guardadas en memoria por
// esquina: la misma dirección otra vez no vuelve a dibujar nada.
import { ESTILO, URL_WORKER, ajustarEstilo } from "@/lib/geo/estilo-mapa";

/** El zoom de la estampilla: la cuadra y los nombres de las calles de alrededor. */
export const ZOOM_PUNTO = 16.5;

/** Sin el mapa dibujado en esto (sin señal), la estampilla dice que falló. */
const MS_TOPE = 12_000;

export type PedidoEstampilla = { lat: number; lng: number; ancho: number; alto: number; zoom?: number };

/** La misma esquina con un decimal de más es la misma foto: ~1 m. Pura. */
export function claveEstampilla({ lat, lng, ancho, alto, zoom = ZOOM_PUNTO }: PedidoEstampilla): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}|${Math.round(ancho)}x${Math.round(alto)}|z${zoom}`;
}

const fotos = new Map<string, Promise<string>>();
let cola: Promise<unknown> = Promise.resolve();

/** La foto (data URL) del mapa con el punto en el centro. Falla sin señal. */
export function fotoDelMapa(pedido: PedidoEstampilla): Promise<string> {
  const clave = claveEstampilla(pedido);
  const guardada = fotos.get(clave);
  if (guardada) return guardada;
  const foto = cola.then(() => dibujar({ ...pedido, zoom: pedido.zoom ?? ZOOM_PUNTO }));
  cola = foto.catch(() => undefined);
  fotos.set(clave, foto);
  // Una falla (sin señal) no se guarda: la próxima vez se intenta de nuevo.
  foto.catch(() => fotos.delete(clave));
  return foto;
}

async function dibujar({ lat, lng, ancho, alto, zoom }: Required<PedidoEstampilla>): Promise<string> {
  const { Map: MapaGL, setWorkerUrl } = await import("maplibre-gl");
  setWorkerUrl(URL_WORKER);
  const caja = document.createElement("div");
  caja.style.cssText = `position:fixed;left:-10000px;top:0;width:${ancho}px;height:${alto}px;pointer-events:none;`;
  document.body.appendChild(caja);
  const mapa = new MapaGL({
    container: caja,
    style: ESTILO,
    center: [lng, lat],
    zoom,
    interactive: false,
    attributionControl: false,
    // Sin esto el lienzo se borra después de dibujar y la foto sale en blanco.
    canvasContextAttributes: { preserveDrawingBuffer: true },
    // Los nombres de calle aparecen de una vez, no a medio fundido en la foto.
    fadeDuration: 0,
    // Nítida en el teléfono, sin pasarse en pantallas de 3×.
    pixelRatio: Math.min(2, window.devicePixelRatio || 1),
  });
  try {
    await new Promise<void>((listo, falla) => {
      const tope = setTimeout(() => falla(new Error("sin_senal")), MS_TOPE);
      let cargado = false;
      mapa.once("load", () => {
        cargado = true;
        ajustarEstilo(mapa);
        mapa.once("idle", () => {
          clearTimeout(tope);
          listo();
        });
      });
      // Antes de cargar el estilo, un error es que no hay mapa (sin señal).
      mapa.on("error", () => {
        if (cargado) return;
        clearTimeout(tope);
        falla(new Error("sin_senal"));
      });
    });
    return mapa.getCanvas().toDataURL("image/png");
  } finally {
    mapa.remove();
    caja.remove();
  }
}
