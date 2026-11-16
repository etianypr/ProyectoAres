// Una calle que está en varios lugares de Arica (spec 035): cada lugar es una opción con su
// población y su sector, y la referencia de la guía elige la correcta de inmediato.
//
// No consulta a nadie: los lugares y las poblaciones viajan en el código. Las puertas que ya
// trajo Google (la misma consulta de siempre, ninguna más) se usan si caen en un lugar.
import { distanciaMetros } from "@/lib/geo/coordenada";
import { sectorDe } from "@/lib/geo/sectores-arica";
import { cruceNombrado, cruzaCon, type LugarDeCalle } from "./lugares";
import { nombrePoblacion, poblacionesDe, poblacionesEscritas } from "./poblaciones";
import { calleYNumero, type Referencias } from "./referencias";
import type { SugerenciaDireccion } from "./tipos";
import type { ResultadoUbicacion } from "./ubicar";

/** Una puerta de un buscador pertenece a un lugar si queda a menos de esto de su calle. */
const METROS_PUERTA_EN_LUGAR = 200;

export async function ubicarEnLugares(
  consulta: string,
  ref: Referencias,
  lugares: LugarDeCalle[],
  deBuscadores: SugerenciaDireccion[],
): Promise<ResultadoUbicacion> {
  const { numero } = calleYNumero(consulta);
  const escritas = new Set(await poblacionesEscritas(ref.referencia));
  const puertas = deBuscadores.filter((c) => !c.soloCalle);

  const opciones: SugerenciaDireccion[] = [];
  for (const [i, l] of lugares.entries()) {
    const poblaciones = await poblacionesDe([l, ...l.muestras]);
    const poblacion = poblaciones[0] ?? null;
    const sector = sectorDe(l);
    const puerta = puertas.find((p) => [l, ...l.muestras].some((m) => distanciaMetros(p, m) <= METROS_PUERTA_EN_LUGAR));
    const calza =
      poblaciones.some((n) => escritas.has(n)) || ref.cruces.some((c) => cruzaCon(l, c)) || cruceNombrado(l, ref.referencia);
    const detalle = [poblacion ? nombrePoblacion(poblacion) : null, sector].filter(Boolean).join(" · ");
    opciones.push({
      id: `lugar:${l.nombre}:${i}`,
      direccion: puerta?.direccion ?? (numero ? `${l.nombre} ${numero}` : l.nombre),
      detalle,
      lat: puerta?.lat ?? l.lat,
      lng: puerta?.lng ?? l.lng,
      // Sin puerta, el punto es el de la calle en ese lugar: llega a la cuadra.
      soloCalle: !puerta,
      confianza: puerta?.confianza ?? "aproximada",
      coincideNumero: puerta ? true : null,
      fuente: puerta?.fuente ?? "osm",
      poblacion,
      sector,
      calza,
      // Las calles de alrededor, para distinguirlo de los otros (dueño, 2026-11-16).
      cruces: l.cruces.filter((c) => c !== l.nombre).slice(0, 3),
    });
  }
  // Las que calzan con la guía primero; después las que tienen puerta.
  opciones.sort((a, b) => Number(b.calza) - Number(a.calza) || Number(a.soloCalle) - Number(b.soloCalle));
  const calzan = opciones.filter((o) => o.calza);
  const nombre = lugares[0].nombre;

  if (calzan.length === 1) {
    const elegida = calzan[0];
    return {
      tipo: elegida.confianza === "exacta" ? "exacta" : "aproximada",
      candidatos: opciones,
      elegida,
      advertencia: `Ubicado por la referencia de la guía: ${nombre} · ${elegida.detalle}.${elegida.soloCalle ? " Busca el número al llegar." : ""}`,
    };
  }
  return {
    tipo: "ambigua",
    candidatos: opciones,
    elegida: null,
    advertencia: `${nombre} está en ${lugares.length} lugares de Arica. Elige cuál es.`,
  };
}
