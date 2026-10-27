"use client";

// El formulario de un pedido dentro de la hoja (sale de pantalla.tsx, spec 002
// T037).

import { ArrowLeft, X } from "lucide-react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { PedidoFormLocal } from "./pedido-form-local";

/** El formulario de un pedido, DENTRO de la hoja deslizable (ver BottomSheet,
 *  prop "vista"): sobre el contenido y debajo de la misma cabecera.
 *
 *  Antes esto se abría como una pantalla aparte encima de todo. Se movió acá
 *  porque abrir otra pantalla para cargar un pedido rompía lo único que la app
 *  del conductor sostiene: que todo pase en el mismo lugar, sobre el mapa. La razón
 *  por la que en su momento salió de la hoja —"el formulario pelea con el gesto
 *  de arrastre"— ya no existe: la hoja se arrastra SOLO desde el tirador, así que
 *  ningún campo le roba el gesto a nada.
 *
 *  Lo que se gana además de la continuidad: la cabecera sigue siendo la parada
 *  activa con su botón, así que se puede cargar un pedido y contestar la parada
 *  que toca sin cerrar nada; y la hoja se puede bajar con el formulario a medio
 *  llenar para mirar el mapa, y volver a subirla tal como estaba.
 *
 *  Cargando uno nuevo se queda abierto después de guardar —los pedidos se cargan
 *  en tanda, uno atrás del otro— y editando se cierra, que es lo que uno espera
 *  al terminar de corregir algo.
 *
 *  Y como el formulario se queda ahí vacío, el "pedido agregado" lo dice esta
 *  vista y no el formulario: asomando desde el borde de abajo, encima de todo y
 *  sin empujar nada. Cargando en tanda, el campo del nombre no se mueve de lugar
 *  entre un pedido y el siguiente. */
export function VistaPedido({
  pedido,
  fecha,
  ofInicial,
  onCerrar,
  onGuardado,
}: {
  /** Sin esto, es uno nuevo. */
  pedido?: Pedido;
  /** OF de una etiqueta que no estaba en la guía (spec 005). */
  ofInicial?: string;
  /** Día de trabajo de un pedido nuevo. */
  fecha: string;
  onCerrar: () => void;
  /** El aviso que devuelve el formulario: null si todo salió limpio, o el texto
   *  de una advertencia que hay que dejar escrita (una dirección que no se pudo
   *  ubicar). Qué se hace con eso lo decide la pantalla, que es la que dibuja
   *  TODOS los avisos en un solo lugar (ver PilaNotificaciones). */
  onGuardado: (aviso?: string | null) => void;
}) {
  return (
    <>
      {/* Dos controles que hacen lo mismo, a propósito: la flecha de la
          izquierda es "volver a la lista" y la cruz de la derecha es "cerrar
          esto". El conductor va a buscar una o la otra según de dónde venga, y
          ninguna de las dos está donde el pulgar tape la primera línea del
          formulario. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-divider px-2 py-2">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Volver"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-background"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate font-semibold">
          {pedido ? "Editar pedido" : "Nuevo pedido"}
        </p>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-background"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Sin scroll ni padding propios: los pone el formulario, que necesita
          repartirlos él para dejar el botón de guardar clavado abajo y que solo
          scrollee la parte de los campos. */}
      <div className="min-h-0 flex-1">
        <PedidoFormLocal pedido={pedido} fecha={fecha} ofInicial={ofInicial} onGuardado={onGuardado} />
      </div>
    </>
  );
}
