// Los botones de la parada activa y el renglón de estado del receptor, en UN solo
// lugar (spec 020, FR-006). Los dibujan la tarjeta de ARES (parada-activa.tsx) y
// la burbuja que flota sobre Google Maps (use-burbuja.ts → lib/nativo/burbuja.ts):
// si cambia un paso, cambia en los dos. La burbuja no tiene reglas propias.
//
// Puro: qué botones van sale de la fase (fase-parada.ts) y del pedido. Qué hace
// cada uno lo decide `atenderBoton`, con las mismas funciones para los dos.

import { bloquePorId, type BloqueHorario } from "@/lib/encomiendas/config";
import type { Parada } from "./dia-trabajo-tipos";
import { OTRA_HORA, SALIDAS, type Fase, type Salida } from "./fase-parada";

/** Qué hace el botón. Los tres últimos solo existen en la burbuja. */
export type IdBoton =
  | "llamar"
  | "escanear"
  | "telefono"
  | "entregado"
  | "no_se_pudo"
  | "pendiente"
  | "no_entregado"
  | "otra_hora"
  | `hora:${string}`
  | "todos"
  | "solo_este"
  | "volver"
  | "deshacer"
  | "navegar"
  | "ares";

/** El color, sin clases: la tarjeta lo pasa a Tailwind y la burbuja a Android. */
export type Tono = "marca" | "ok" | "peligro" | "borde-marca" | "borde-ok" | "borde-peligro" | "neutro";

export type BotonParada = {
  id: IdBoton;
  texto: string;
  /** La consecuencia, escrita: el conductor la ve ANTES de tocar (salidas). */
  detalle?: string;
  tono: Tono;
  /** El "volver a llamar" redondo del medio: solo el ícono, `texto` va de etiqueta. */
  soloIcono?: boolean;
  /** Necesita la pantalla de ARES (desde la burbuja, la trae adelante). */
  abreAres: boolean;
  /** Escribe en el pedido: se apaga mientras se guarda lo anterior. */
  escribe: boolean;
};

const b = (id: IdBoton, texto: string, tono: Tono, extra: Partial<BotonParada> = {}): BotonParada => ({
  id,
  texto,
  tono,
  abreAres: false,
  escribe: false,
  ...extra,
});

/** Los botones del paso, en filas: cada fila se reparte el ancho.
 *
 *  En la parada, siempre la misma fila (el dueño, 2026-11-06): "Pedido entregado"
 *  en verde, llamar redondo al medio y "No se entrega" en rojo. Ya no se pregunta
 *  si contestó: hay quien no contesta y recibe igual, y llamar es solo para
 *  coordinar. Sin teléfono, el del medio escanea la etiqueta para sacarlo, y abajo
 *  queda escribirlo a mano si la etiqueta está dañada (spec 017, E3). */
export function botonesDeParada(activa: Parada, fase: Fase, extra: ExtraBotones = {}): BotonParada[][] {
  const volver = [b("volver", "Volver", "neutro")];
  if (fase === "salidas") {
    // Con una sola pendiente, «Dejar como pendiente» la deja activa otra vez al
    // instante: no se ofrece (spec 033, pendiente-ciclo).
    const salidas = SALIDAS.filter((s) => s.clave !== "pendiente" || (extra.pendientes ?? 2) > 1).map((s) => [
      b(s.clave, s.etiqueta, "neutro", { detalle: s.detalle, escribe: true }),
    ]);
    if (extra.bloques?.length) {
      salidas.splice(salidas.length - 1, 0, [b("otra_hora", OTRA_HORA.etiqueta, "neutro", { detalle: OTRA_HORA.detalle })]);
    }
    return [...salidas, volver];
  }
  if (fase === "horas") {
    const bloques = extra.bloques ?? [];
    const filas: BotonParada[][] = [];
    for (let i = 0; i < bloques.length; i += 2) {
      filas.push(bloques.slice(i, i + 2).map((x) => b(`hora:${x.id}`, x.etiqueta, "neutro", { escribe: true })));
    }
    return [...filas, volver];
  }
  if (fase === "juntas") {
    const n = (extra.juntas ?? 0) + 1;
    return [[b("todos", `Los ${n}`, "ok", { escribe: true }), b("solo_este", "Solo este", "borde-ok", { escribe: true })], volver];
  }
  const entregado = b("entregado", "Pedido entregado", "ok", { escribe: true });
  const noSeEntrega = b("no_se_pudo", "No se entrega", "peligro");
  if (activa.pedido.telefono) {
    return [[entregado, b("llamar", "Llamar", "neutro", { soloIcono: true }), noSeEntrega]];
  }
  return [
    [entregado, b("escanear", "Escanear la etiqueta", "neutro", { soloIcono: true, abreAres: true }), noSeEntrega],
    [b("telefono", "Teléfono a mano", "neutro", { abreAres: true })],
  ];
}

/** Lo que los botones necesitan además de la parada: cuántas pendientes quedan,
 *  los bloques horarios que siguen hoy y cuántas paradas más hay en el mismo
 *  punto (spec 033). Sin esto, los botones de siempre. */
export type ExtraBotones = { pendientes?: number; bloques?: readonly BloqueHorario[]; juntas?: number };

export type EstadoParada = { texto: string; tono: "marca" | "ok" | "neutro"; icono: "reloj" | "check" | "telefono" };

/** Qué contestó ESTE receptor: lo primero que se necesita al llegar. Cada estado
 *  lleva ícono Y texto (a pleno sol el color solo no se distingue). No va lo que
 *  el conductor acaba de tocar: los botones ya preguntan por eso. */
export function estadoDeParada(activa: Parada, whatsapp: boolean): EstadoParada | null {
  const { pedido } = activa;
  if (pedido.bloqueHorarioId) {
    return { texto: `Pidió ${bloquePorId(pedido.bloqueHorarioId)?.etiqueta ?? "un horario"}`, tono: "marca", icono: "reloj" };
  }
  if (pedido.disponibilidad === "confirmado") return { texto: "Estará en su domicilio", tono: "ok", icono: "check" };
  if (!whatsapp) return null;
  return { texto: "Sin respuesta todavía", tono: "neutro", icono: "telefono" };
}

/** Lo que hace cada botón: las mismas funciones para la tarjeta y la burbuja. */
export type AccionesParada = {
  llamar: () => void;
  escanear: () => void;
  editar: () => void;
  finalizar: () => void;
  noSePudo: () => void;
  salida: (salida: Salida) => void;
  /** «Pidió otra hora»: muestra los bloques; `hora` anota el elegido. */
  otraHora: () => void;
  hora: (bloqueId: string) => void;
  /** Con paradas en el mismo punto: entregar todas o solo esta. */
  todos: () => void;
  soloEste: () => void;
  volver: () => void;
  deshacer: () => void;
};

/** Atiende un botón. `navegar` y `ares` los resuelve quien los muestra. */
export function atenderBoton(id: IdBoton, a: AccionesParada): void {
  if (id.startsWith("hora:")) return a.hora(id.slice("hora:".length));
  switch (id) {
    case "llamar":
      return a.llamar();
    case "escanear":
      return a.escanear();
    case "telefono":
      return a.editar();
    case "entregado":
      return a.finalizar();
    case "no_se_pudo":
      return a.noSePudo();
    case "pendiente":
    case "no_entregado": {
      const salida = SALIDAS.find((s) => s.clave === id);
      if (salida) a.salida(salida);
      return;
    }
    case "otra_hora":
      return a.otraHora();
    case "todos":
      return a.todos();
    case "solo_este":
      return a.soloEste();
    case "volver":
      return a.volver();
    case "deshacer":
      return a.deshacer();
    case "navegar":
    case "ares":
      return;
  }
}
