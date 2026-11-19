// Lo que hace dudar de un pedido (⚠). Dos fuentes (spec 022):
//   · lo que se deduce del pedido: sin punto en el mapa, o una línea de la guía
//     sin OF (no se va a poder enlazar con su etiqueta);
//   · lo guardado en el pedido (`Pedido.problemas`): la calle que existe en
//     varios lugares, la parada lejana, el horario que no alcanza, la etiqueta
//     que dice otra dirección y el paquete que no estaba en la guía.
// La hoja los muestra primero, con el problema en palabras y no solo con un color.
//
// La OF de otro largo NO es un problema (dueño, 2026-11-06): hay OF de distintos
// largos y valen si están en el paquete o en la orden de flete.
//
// Recibe solo los campos que mira, sin el tipo `Pedido` del teléfono: así no
// arrastra `local/` a nadie que lo importe.

import type { ResultadoUbicacion } from "@/lib/geo/geocoding";

/** Un lugar posible para una dirección en duda: lo que trajo la búsqueda. Con una calle
 *  repetida (spec 035) trae además su población, su sector y si calzó con la guía (opcionales:
 *  los pedidos guardados antes siguen sirviendo). */
export type OpcionLugar = {
  direccion: string;
  detalle: string | null;
  lat: number;
  lng: number;
  poblacion?: string | null;
  sector?: string;
  calza?: boolean;
  /** Las calles que cruzan ese lugar (hasta 3). */
  cruces?: string[];
};

/** Un ⚠ guardado en el pedido. `revisado` = el conductor dijo «Va igual» o «Es
 *  así»: sigue anotado, pero ya no pide nada. */
export type ProblemaGuardado =
  | { tipo: "calle_repetida" | "solo_calle"; opciones: OpcionLugar[] }
  | { tipo: "lejana" | "horario"; texto: string; revisado?: boolean }
  | { tipo: "etiqueta_otra_direccion"; direccion: string }
  | { tipo: "fuera_de_guia"; revisado?: boolean };

export type TipoProblema = "sin_ubicar" | ProblemaGuardado["tipo"];

export type ProblemaPedido = {
  tipo: TipoProblema;
  texto: string;
  /** Si se avisa dos paradas antes de llegar (spec 022, US2): los que pueden
   *  hacer perder el viaje. */
  avisaAntes: boolean;
};

/** Los ⚠ que hablan del LUGAR: cambiar la dirección o el punto los deja sin
 *  sentido (se vuelven a calcular al rehacer la ruta). */
export const PROBLEMAS_DE_LUGAR: ReadonlySet<ProblemaGuardado["tipo"]> = new Set([
  "calle_repetida",
  "solo_calle",
  "lejana",
  "etiqueta_otra_direccion",
]);

function textoGuardado(p: ProblemaGuardado): string {
  switch (p.tipo) {
    // Spec 040: en las listas, tres estados (Ubicada, Aproximada, Sin ubicar). El detalle («está en
    // 3 lugares», «sin número») se ve al abrir el pedido para elegir (opciones-lugar.tsx).
    case "calle_repetida":
    case "solo_calle":
      return APROXIMADA;
    case "lejana":
    case "horario":
      return p.texto;
    case "etiqueta_otra_direccion":
      return "La etiqueta indica otra dirección";
    case "fuera_de_guia":
      return "No figura en la guía";
  }
}

export function problemasDelPedido(p: {
  lat: number | null;
  lng: number | null;
  of: string | null;
  origenCarga: string;
  problemas?: ProblemaGuardado[];
}): ProblemaPedido[] {
  const problemas: ProblemaPedido[] = [];
  // Primero el que deja al pedido fuera de la ruta.
  if (p.lat == null || p.lng == null) problemas.push({ tipo: "sin_ubicar", texto: "Sin ubicar", avisaAntes: false });
  for (const g of p.problemas ?? []) {
    if ("revisado" in g && g.revisado) continue;
    problemas.push({ tipo: g.tipo, texto: textoGuardado(g), avisaAntes: g.tipo !== "fuera_de_guia" });
  }
  // Sin OF no es algo que resolver (dueño, 2026-11-16): la OF es solo el id del paquete; la
  // parada vale por su dirección. Se completa al escanear la etiqueta.
  return problemas;
}

/** Lo que ve el conductor de una dirección (spec 040, dueño: «muchos tipos confunde»). */
const APROXIMADA = "Aproximada";

export type EstadoUbicacion = "ubicada" | "aproximada" | "sin_ubicar";

/** Tres estados: sin punto → sin ubicar; con un ⚠ de lugar (calle repetida, solo la calle) o con el
 *  punto en la cuadra (`aproximada`) → aproximada; lo demás → ubicada. Pura. */
export function estadoUbicacion(p: {
  lat: number | null;
  lng: number | null;
  aproximada?: true;
  problemas?: ProblemaGuardado[];
}): EstadoUbicacion {
  if (p.lat == null || p.lng == null) return "sin_ubicar";
  const deLugar = (p.problemas ?? []).some((x) => x.tipo === "calle_repetida" || x.tipo === "solo_calle");
  return deLugar || p.aproximada === true ? "aproximada" : "ubicada";
}

/** Una etiqueta de las listas: los ⚠ del pedido y, si el punto es la cuadra sin un ⚠, «Aproximada». */
export type EtiquetaPedido = { tipo: TipoProblema | "aproximada"; texto: string };

/** Lo que muestran la fila, la tarjeta de la parada y la ruta (spec 040). La cuadra se ve
 *  «Aproximada», pero no es un ⚠: no entra a «Por resolver» ni pide nada (no hay qué elegir); de eso
 *  sigue encargándose problemasDelPedido. Pura. */
export function etiquetasDelPedido(p: Parameters<typeof problemasDelPedido>[0] & { aproximada?: true }): EtiquetaPedido[] {
  const etiquetas: EtiquetaPedido[] = problemasDelPedido(p).map(({ tipo, texto }) => ({ tipo, texto }));
  const yaDice = etiquetas.some((e) => e.texto === APROXIMADA);
  if (!yaDice && estadoUbicacion(p) === "aproximada") etiquetas.unshift({ tipo: "aproximada", texto: APROXIMADA });
  return etiquetas;
}

/** Spec 035, para el aviso dos paradas antes: «Va a Pob. Linderos · Sur; hay 3 lugares más».
 *  La opción es la más cercana al punto con que el pedido entró a la ruta. null si el pedido no
 *  tiene una calle repetida con poblaciones. */
export function lugarSupuesto(p: { lat: number | null; lng: number | null; problemas?: ProblemaGuardado[] }): string | null {
  const g = p.problemas?.find((x) => x.tipo === "calle_repetida");
  if (!g || !("opciones" in g) || p.lat == null || p.lng == null || !g.opciones.some((o) => o.sector)) return null;
  const { lat, lng } = p;
  const cerca = [...g.opciones].sort((a, b) => Math.hypot(a.lat - lat, a.lng - lng) - Math.hypot(b.lat - lat, b.lng - lng))[0];
  const otros = g.opciones.length - 1;
  return `Va a ${cerca.detalle ?? cerca.direccion}; hay ${otros === 1 ? "1 lugar más" : `${otros} lugares más`}`;
}

/** Cuántas opciones se guardan de una dirección en duda: las que se alcanzan a
 *  mirar de una pasada en la pantalla. */
const MAX_OPCIONES = 5;

/** Una dirección que la búsqueda no eligió sola, pero que trae opciones: el
 *  pedido entra a la ruta con la primera y un ⚠ con todas, para elegir después
 *  sin volver a buscar (spec 022, US1; `AGENTS.md`). Sin opciones no hay punto
 *  adonde ir: null. */
export function lugarProvisorio(
  r: Pick<ResultadoUbicacion, "tipo" | "candidatos" | "elegida">,
): { punto: { lat: number; lng: number }; problema: ProblemaGuardado } | null {
  if (r.elegida || (r.tipo !== "ambigua" && r.tipo !== "solo_calle")) return null;
  const opciones: OpcionLugar[] = r.candidatos.slice(0, MAX_OPCIONES).map((c) => ({
    direccion: c.direccion,
    detalle: c.detalle ?? null,
    lat: c.lat,
    lng: c.lng,
    ...(c.sector ? { poblacion: c.poblacion ?? null, sector: c.sector, calza: c.calza ?? false, cruces: c.cruces ?? [] } : {}),
  }));
  if (opciones.length === 0) return null;
  return {
    punto: { lat: opciones[0].lat, lng: opciones[0].lng },
    problema: { tipo: r.tipo === "ambigua" ? "calle_repetida" : "solo_calle", opciones },
  };
}
