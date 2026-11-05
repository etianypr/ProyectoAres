// Los botones de la parada activa y el renglón de estado del receptor, en UN solo
// lugar (spec 020, FR-006). Los dibujan la tarjeta de ARES (parada-activa.tsx) y
// la burbuja que flota sobre Google Maps (use-burbuja.ts → lib/nativo/burbuja.ts):
// si cambia un paso, cambia en los dos. La burbuja no tiene reglas propias.
//
// Puro: qué botones van sale de la fase (fase-parada.ts) y del pedido. Qué hace
// cada uno lo decide `atenderBoton`, con las mismas funciones para los dos.

import { bloquePorId } from "@/lib/encomiendas/config";
import type { Parada } from "./dia-trabajo-tipos";
import { SALIDAS, type Fase, type Salida } from "./fase-parada";

/** Qué hace el botón. Los tres últimos solo existen en la burbuja. */
export type IdBoton =
  | "llamar"
  | "escanear"
  | "telefono"
  | "entregado"
  | "no_se_pudo"
  | "contesto"
  | "no_contesto"
  | "finalizado"
  | "pendiente"
  | "no_entregado"
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

/** Los botones del paso, en filas: cada fila se reparte el ancho. */
export function botonesDeParada(activa: Parada, fase: Fase): BotonParada[][] {
  switch (fase) {
    case "antes_llamar":
      // Viene de la guía y su etiqueta no se escaneó: el teléfono está ahí. Si la
      // etiqueta está dañada, la parada igual se tiene que poder cerrar o
      // completar a mano (spec 017, E3): si no, traba todas las que siguen.
      return activa.pedido.telefono
        ? [[b("llamar", "Llamar", "marca")]]
        : [
            [b("escanear", "Escanear la etiqueta para llamar", "marca", { abreAres: true })],
            [
              b("telefono", "Teléfono", "borde-marca", { abreAres: true }),
              b("entregado", "Entregado", "borde-ok", { escribe: true }),
              b("no_se_pudo", "No se pudo", "borde-peligro", { escribe: true }),
            ],
          ];
    case "esperando_resultado":
      // Llamar queda en el medio para reintentar sin decidir todavía si contestó
      // (suena ocupado, se cortó).
      return [
        [
          b("contesto", "Contestó", "ok", { escribe: true }),
          b("llamar", "Volver a llamar", "neutro", { soloIcono: true }),
          b("no_contesto", "No contestó", "peligro", { escribe: true }),
        ],
      ];
    case "esperando_entrega":
    case "confirmado":
      // Llamar sigue aunque haya confirmado: puede no abrir.
      return [
        [b("finalizado", "Pedido finalizado", "marca", { escribe: true })],
        [b("llamar", "Llamar", "borde-marca"), b("no_se_pudo", "No se pudo", "borde-peligro", { escribe: true })],
      ];
    case "salidas":
      return [
        ...SALIDAS.map((s) => [
          b(s.clave, s.etiqueta, "neutro", { detalle: s.detalle, escribe: true }),
        ]),
        [b("volver", "Volver", "neutro")],
      ];
  }
}

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
  if (!whatsapp || pedido.llamada === "no_contesto") return null;
  return { texto: "Sin respuesta todavía", tono: "neutro", icono: "telefono" };
}

/** Lo que hace cada botón: las mismas funciones para la tarjeta y la burbuja. */
export type AccionesParada = {
  llamar: () => void;
  escanear: () => void;
  editar: () => void;
  finalizar: () => void;
  noSePudo: () => void;
  contesto: () => void;
  noContesto: () => void;
  salida: (salida: Salida) => void;
  volver: () => void;
  deshacer: () => void;
};

/** Atiende un botón. `navegar` y `ares` los resuelve quien los muestra. */
export function atenderBoton(id: IdBoton, a: AccionesParada): void {
  switch (id) {
    case "llamar":
      return a.llamar();
    case "escanear":
      return a.escanear();
    case "telefono":
      return a.editar();
    case "entregado":
    case "finalizado":
      return a.finalizar();
    case "no_se_pudo":
      return a.noSePudo();
    case "contesto":
      return a.contesto();
    case "no_contesto":
      return a.noContesto();
    case "pendiente":
    case "no_entregado": {
      const salida = SALIDAS.find((s) => s.clave === id);
      if (salida) a.salida(salida);
      return;
    }
    case "volver":
      return a.volver();
    case "deshacer":
      return a.deshacer();
    case "navegar":
    case "ares":
      return;
  }
}
