// El orden sabiendo dónde no se puede dar la vuelta (terreno 2026-10-29: "entrar
// a la calle y salir en reversa en calles estrechas no se puede").
//
// El plan ordena con distancias que suponen que en cada parada se puede dar la
// vuelta gratis. Al dibujar la ruta, Mapbox dice de cada parada qué calle es
// (vuelta.ts) y en qué dirección corre; en una prueba de 66 paradas, 28 eran de
// pasaje o residencial y hubo que pasarlas de frente: 3,9 km más.
//
// Con eso se vuelve a buscar el orden cobrando, en cada parada de calle estrecha,
// entrar y salir por el MISMO extremo: si la parada anterior y la siguiente
// quedan del mismo lado a lo largo de la calle, hay que devolverse, y eso cuesta
// lo que midió Mapbox para esa parada (o lo típico del día). Si quedan a lados
// distintos, se pasa de frente sin costo. Es una estimación, así que la nueva se
// vuelve a dibujar por calles y se queda la que de verdad mide menos.
import { distanciaMetros, type Coordenada } from "@/lib/geo/coordenada";
import { obtenerRutaCalles, type CalleDelPunto, type RutaCalles } from "@/lib/geo/mapbox/direcciones";
import { permiteDarLaVuelta } from "@/lib/geo/mapbox/vuelta";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { FIN, type Penalizacion } from "@/lib/rutas/orden-paradas/costo";
import type { PedidoUbicado } from "./tipos";

/** Una parada vecina "casi de costado" (ni adelante ni atrás a lo largo de la
 *  calle) se puede alcanzar por cualquiera de los dos extremos: no se cobra. */
const COSENO_DE_LADO = 0.35;
/** Sin medición de esa parada: lo típico del día, o esto si no hay ninguna. */
const METROS_DEVOLVERSE = 300;
const MIN_METROS = 100;
const MAX_METROS = 1500;

/** -1, 0 o 1: de qué lado de la parada `s` queda `x` a lo largo de su calle. */
function lado(s: Coordenada, eje: number, x: Coordenada): number {
  const rad = (eje * Math.PI) / 180;
  const este = (x.lng - s.lng) * Math.cos((s.lat * Math.PI) / 180) * 111_320;
  const norte = (x.lat - s.lat) * 110_540;
  const d = Math.hypot(este, norte);
  if (d < 1) return 0;
  const coseno = (este * Math.sin(rad) + norte * Math.cos(rad)) / d;
  return coseno > COSENO_DE_LADO ? 1 : coseno < -COSENO_DE_LADO ? -1 : 0;
}

/** La penalización para ordenarParadas, con puntos[0] la base. null si no hay
 *  ninguna parada de calle estrecha. */
export function penalizacionPorSentido(puntos: Coordenada[], calles: (CalleDelPunto | null)[]): Penalizacion | null {
  const estrecha = puntos.map((_, i) => i > 0 && calles[i]?.eje != null && !permiteDarLaVuelta(calles[i]?.clase));
  if (!estrecha.some(Boolean)) return null;

  const medidos = calles
    .map((c) => c?.extraM)
    .filter((m): m is number => m != null && m > 0)
    .sort((a, b) => a - b);
  const tipico = medidos.length > 0 ? medidos[Math.floor(medidos.length / 2)] : METROS_DEVOLVERSE;
  const metros = calles.map((c) => Math.min(MAX_METROS, Math.max(MIN_METROS, c?.extraM || tipico)));

  const lados = puntos.map((s, i) =>
    estrecha[i] ? puntos.map((x, j) => (j === i ? 0 : lado(s, calles[i]!.eje!, x))) : null,
  );
  const pen: Penalizacion = (anterior, parada, siguiente) => {
    const fila = lados[parada];
    if (!fila) return 0;
    const a = fila[anterior];
    return a !== 0 && a === fila[siguiente === FIN ? 0 : siguiente] ? metros[parada] : 0;
  };
  pen.maximo = Math.max(...metros.filter((_, i) => estrecha[i]));
  return pen;
}

/** El orden de nuevo, cobrando devolverse en calles estrechas, y su ruta por
 *  calles. null si no hay nada que mejorar o la nueva no mide menos. */
export async function ordenarConSentido(
  base: Coordenada,
  paradas: PedidoUbicado[],
  indiceEnMatriz: Map<string, number>,
  matriz: number[][] | null,
  calles: RutaCalles,
): Promise<{ paradas: PedidoUbicado[]; calles: RutaCalles } | null> {
  if (!matriz || !calles.puntos) return null;
  const puntos = [base, ...paradas.map((p) => ({ lat: p.lat, lng: p.lng }))];
  const pen = penalizacionPorSentido(puntos, calles.puntos.slice(0, puntos.length));
  if (!pen) return null;

  const indices = [0, ...paradas.map((p) => indiceEnMatriz.get(p.id) ?? -1)];
  if (indices.some((i) => i < 0)) return null;
  const sub = indices.map((f) => indices.map((c) => matriz[f]?.[c] ?? Infinity));
  const vuelta = (i: number) => matriz[indices[i]]?.[0] ?? distanciaMetros(puntos[i], base);
  const orden = ordenarParadas(puntos, sub, vuelta, false, {
    penalizacion: pen,
    arranque: puntos.map((_, i) => i),
  });

  const nuevas = orden.slice(1).map((i) => paradas[i - 1]);
  if (nuevas.every((p, k) => p.id === paradas[k].id)) return null;
  const otra = await obtenerRutaCalles([base, ...nuevas.map((p) => ({ lat: p.lat, lng: p.lng })), base]);
  if (!otra || otra.distanciaM >= calles.distanciaM) return null;
  return { paradas: nuevas, calles: otra };
}
