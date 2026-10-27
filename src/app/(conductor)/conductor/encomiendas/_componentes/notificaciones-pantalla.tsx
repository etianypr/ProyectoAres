"use client";

// Los avisos que caen desde arriba de la pantalla del conductor, armados en un solo
// lugar (sale de pantalla.tsx, spec 002 T035). Puro: recibe el estado y las
// acciones, y devuelve la lista en el orden en que se muestra.

import { AlertTriangle, Check, Download, MessageCircleOff, PhoneCall, PhoneOff, Route, Trash2, Undo2 } from "lucide-react";
import { nombreVisible } from "@/lib/encomiendas/paquete";
import type { PedidoEliminado } from "@/lib/encomiendas/local/almacen";
import type { LlamadaDetectada } from "../_hooks/use-llamada-nativa";
import type { Notificacion } from "./notificaciones";

export type DatosNotificaciones = {
  error: string | null;
  onCerrarError: () => void;
  apkVieja: boolean;
  apkUrl: string | null;
  llamadaDetectada: LlamadaDetectada | null;
  onCorregirLlamada: (llamada: LlamadaDetectada) => void;
  /** Solo con ruta armada: sin ruta no hay respuestas que esperar. */
  errorWhatsapp: string | null;
  cambiosRuta: string[];
  onVistoCambioRuta: () => void;
  eliminado: PedidoEliminado | null;
  onDeshacerEliminado: () => void;
  deshacer: { pedidoId: string; eventoId: string; texto: string } | null;
  onDeshacer: () => void;
  confirmacion: { texto: string; n: number } | null;
};

export function armarNotificaciones(d: DatosNotificaciones): Notificacion[] {
  // Todo lo que la pantalla le tiene que decir al conductor, en una sola lista y en
  // un solo lugar: cae desde el borde de arriba (ver PilaNotificaciones). Se
  // llaman notificaciones y no avisos: el aviso es el WhatsApp al receptor.
  //
  // El orden es fijo y va de lo más reversible a lo menos: primero lo que ofrece
  // deshacer algo —y tiene un plazo corriendo— y al final la confirmación, que no
  // ofrece nada. Con dos a la vista, el botón de deshacer queda siempre en el
  // mismo renglón y no baila según cuál llegó antes.
  const notificaciones: Notificacion[] = [];
  // El fallo de una escritura va primero y no se va solo: se cierra a mano, o lo
  // limpia la próxima acción que salga bien (ver correr).
  //
  // Antes esto se dibujaba adentro de los controles de la parada activa, así que
  // sin ruta armada no se dibujaba en ningún lado: un pedido que no se pudo
  // guardar ni eliminar —el teléfono sin espacio, el navegador en modo privado—
  // fallaba en silencio y el conductor volvía a intentarlo sin saber por qué.
  if (d.error) {
    notificaciones.push({
      id: `error:${d.error}`,
      icono: <AlertTriangle className="h-4 w-4" />,
      texto: d.error,
      tono: "error",
      accion: { etiqueta: "Cerrar", onClick: d.onCerrarError },
    });
  }
  // Que WhatsApp esté caído no es una alarma —el sondeo reintenta solo— pero
  // mientras lo esté no van a llegar respuestas, y el conductor tiene que saber que
  // esperarlas no sirve: lo que corresponde es llamar. Es lo único que quedó
  // visible del canal.
  if (d.apkVieja) {
    notificaciones.push({
      id: "apk-vieja",
      icono: <Download className="h-4 w-4 text-white/70" />,
      texto: "Hay una versión nueva de la app para instalar.",
      ...(d.apkUrl ? { accion: { etiqueta: "Bajar", onClick: () => window.open(d.apkUrl!, "_blank") } } : {}),
    });
  }
  const llamada = d.llamadaDetectada;
  if (llamada) {
    const contesto = llamada.resultado === "contesto";
    notificaciones.push({
      id: `llamada:${llamada.n}`,
      icono: contesto ? (
        <PhoneCall className="h-4 w-4 text-white/70" />
      ) : (
        <PhoneOff className="h-4 w-4 text-white/70" />
      ),
      texto: contesto ? "Contestó la llamada" : "No contestó la llamada",
      accion: { etiqueta: "Corregir", onClick: () => d.onCorregirLlamada(llamada) },
    });
  }
  if (d.errorWhatsapp) {
    notificaciones.push({
      id: "whatsapp",
      icono: <MessageCircleOff className="h-4 w-4 text-white/70" />,
      texto: "WhatsApp no está disponible: llama a los clientes que no respondieron.",
      tono: "error",
    });
  }
  // Lo que las respuestas le cambiaron a la ruta en curso (spec 010): uno a la
  // vez, del más viejo al más nuevo, hasta que el conductor lo da por leído.
  if (d.cambiosRuta.length > 0) {
    notificaciones.push({
      id: `ruta:${d.cambiosRuta[0]}`,
      icono: <Route className="h-4 w-4 text-white/70" />,
      texto: d.cambiosRuta[0],
      accion: { etiqueta: "Entendido", onClick: d.onVistoCambioRuta },
    });
  }
  const eliminado = d.eliminado;
  if (eliminado) {
    notificaciones.push({
      id: `eliminado:${eliminado.pedido.id}`,
      icono: <Trash2 className="h-4 w-4 text-white/70" />,
      texto: `Eliminado: ${nombreVisible(eliminado.pedido)}`,
      accion: {
        etiqueta: "Deshacer",
        icono: <Undo2 className="h-4 w-4" />,
        onClick: d.onDeshacerEliminado,
      },
    });
  }
  const deshacer = d.deshacer;
  if (deshacer) {
    // Mientras este aviso está a la vista, lo que se marcó no salió del teléfono
    // ni cerró el día (ver use-dia-trabajo).
    notificaciones.push({
      id: `deshacer:${deshacer.eventoId}`,
      icono: <Check className="h-4 w-4 text-ok" />,
      texto: deshacer.texto,
      accion: {
        etiqueta: "Deshacer",
        icono: <Undo2 className="h-4 w-4" />,
        onClick: d.onDeshacer,
      },
    });
  }
  const confirmacion = d.confirmacion;
  if (confirmacion) {
    notificaciones.push({
      id: `guardado:${confirmacion.n}`,
      icono: <Check className="h-4 w-4 text-ok" />,
      texto: confirmacion.texto,
    });
  }
  return notificaciones;
}
