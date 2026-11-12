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

/** Un lugar posible para una dirección en duda: lo que trajo la búsqueda. */
export type OpcionLugar = { direccion: string; detalle: string | null; lat: number; lng: number };

/** Un ⚠ guardado en el pedido. `revisado` = el conductor dijo «Va igual» o «Es
 *  así»: sigue anotado, pero ya no pide nada. */
export type ProblemaGuardado =
  | { tipo: "calle_repetida" | "solo_calle"; opciones: OpcionLugar[] }
  | { tipo: "lejana" | "horario"; texto: string; revisado?: boolean }
  | { tipo: "etiqueta_otra_direccion"; direccion: string }
  /** El receptor contestó «No, es otra» al aviso de WhatsApp (spec 004). null =
   *  no escribió cuál. */
  | { tipo: "receptor_otra_direccion"; direccion: string | null }
  | { tipo: "fuera_de_guia"; revisado?: boolean };

export type TipoProblema = "sin_ubicar" | "sin_of" | ProblemaGuardado["tipo"];

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
  "receptor_otra_direccion",
]);

function textoGuardado(p: ProblemaGuardado): string {
  switch (p.tipo) {
    case "calle_repetida":
      return `Calle en ${p.opciones.length} lugares`;
    case "solo_calle":
      return "Sin número: va a mitad de cuadra";
    case "lejana":
    case "horario":
      return p.texto;
    case "etiqueta_otra_direccion":
      return "La etiqueta dice otra dirección";
    case "receptor_otra_direccion":
      return "El receptor dice otra dirección";
    case "fuera_de_guia":
      return "No estaba en la guía";
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
  // Uno cargado a mano puede no tener OF y no es un problema. Uno de la guía sin
  // OF no se va a poder enlazar con su etiqueta al escanear.
  if (!p.of && p.origenCarga.startsWith("guia")) {
    problemas.push({ tipo: "sin_of", texto: "No se leyó la OF", avisaAntes: false });
  }
  return problemas;
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
  const opciones = r.candidatos.slice(0, MAX_OPCIONES).map((c) => ({
    direccion: c.direccion,
    detalle: c.detalle ?? null,
    lat: c.lat,
    lng: c.lng,
  }));
  if (opciones.length === 0) return null;
  return {
    punto: { lat: opciones[0].lat, lng: opciones[0].lng },
    problema: { tipo: r.tipo === "ambigua" ? "calle_repetida" : "solo_calle", opciones },
  };
}
