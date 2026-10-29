"use client";

// La parada activa en la cabecera de la hoja: su tarjeta y los botones del paso
// que toca (sale de pantalla.tsx, spec 002 T037). Es lo único que se mira
// manejando.

import { Check, Clock, PackageCheck, Pencil, Phone, RotateCw, ScanLine, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { bloquePorId } from "@/lib/encomiendas/config";
import type { Navegacion } from "../_hooks/use-navegacion";
import type { Parada } from "../_hooks/use-dia-trabajo";
import { SALIDAS, type Fase, type Salida } from "../_hooks/fase-parada";
import { TarjetaParada } from "./tarjeta-parada";
import { abrirEnMapas } from "@/lib/nativo/mapas";

// Botones de la hoja: a ancho completo y de 48 px. Es lo que el conductor aprieta
// manejando, con el pulgar y sin mirar mucho.
export const BOTON_PRINCIPAL =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground shadow-[0_1px_2px_var(--brand-shadow)] transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
// Los que van de a dos en una grilla. `min-w-0` no es decorativo: un elemento de
// grilla tiene `min-width: auto`, así que el botón de texto más largo se
// ensanchaba por encima de su columna y quedaba visiblemente más grande que el
// de al lado, pisando el hueco. Con el mínimo en cero los dos miden exactamente
// lo mismo, y sin `whitespace-nowrap` una etiqueta larga parte en dos renglones
// en vez de desbordar la píldora.
export const BOTON_RESULTADO =
  "flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-center text-sm font-semibold leading-tight transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

/** El renglón de estado del receptor, debajo de la dirección. */
const LINEA_ESTADO = "mt-0.5 flex items-center gap-1 text-xs font-medium";

export function ParadaActiva({
  activa,
  fase,
  whatsapp,
  guardando,
  seAproximaSinContacto,
  navegacion,
  onLlamar,
  onEscanear,
  onEditar,
  onPedidoFinalizado,
  onNoSePudo,
  onContesto,
  onNoContesto,
  onSalida,
  onVolver,
}: {
  activa: Parada;
  fase: Fase;
  /** false = sin avisos por WhatsApp: no se muestra "Sin respuesta todavía". */
  whatsapp: boolean;
  guardando: boolean;
  /** FR-017: llegando a una parada que todavía no se contactó. */
  seAproximaSinContacto: boolean;
  navegacion: Pick<Navegacion, "metrosAParada" | "segundosAParada" | "llegada">;
  onLlamar: () => void;
  onEscanear: () => void;
  /** Abrir el pedido (para escribir el teléfono). */
  onEditar: () => void;
  onPedidoFinalizado: () => void;
  onNoSePudo: () => void;
  onContesto: () => void;
  onNoContesto: () => void;
  onSalida: (salida: Salida) => void;
  onVolver: () => void;
}) {
  return (
    <div className="space-y-3">
      <TarjetaParada
        secuencia={activa.secuencia}
        pedido={activa.pedido}
        onAbrirMapas={
          activa.pedido.lat != null && activa.pedido.lng != null
            ? () => abrirEnMapas({ lat: activa.pedido.lat!, lng: activa.pedido.lng! })
            : undefined
        }
        faltan={
          navegacion.metrosAParada != null
            ? {
                metros: navegacion.metrosAParada,
                segundos: navegacion.segundosAParada,
                llegada: navegacion.llegada,
              }
            : null
        }
        estado={
          /* Qué contestó ESTE RECEPTOR. Es lo primero que el conductor necesita al
              llegar: saber si lo están esperando cambia lo que hace en la puerta.
              Cada estado lleva icono Y texto — a pleno sol, con el teléfono en
              una mano, el color solo no se distingue.
              Lo que NO va acá es lo que el conductor acabó de tocar. Había un "No
              contestó la llamada" y era ruido en el único renglón que se lee
              manejando: lo dijo él hace dos segundos, y los botones de abajo ya
              están preguntando justamente por eso. */
          activa.pedido.bloqueHorarioId ? (
            <p className={cn(LINEA_ESTADO, "text-brand")}>
              <Clock className="h-3 w-3 shrink-0" />
              Pidió {bloquePorId(activa.pedido.bloqueHorarioId)?.etiqueta ?? "un horario"}
            </p>
          ) : activa.pedido.disponibilidad === "confirmado" ? (
            <p className={cn(LINEA_ESTADO, "text-ok")}>
              <Check className="h-3 w-3 shrink-0" />
              Estará en su domicilio
            </p>
          ) : !whatsapp || activa.pedido.llamada === "no_contesto" ? null : (
            <p className={cn(LINEA_ESTADO, "text-muted")}>
              <Phone className="h-3 w-3 shrink-0" />
              Sin respuesta todavía
            </p>
          )
        }
      />

      {/* FR-017: al aproximarse a un pedido pendiente de respuesta, avisar que
          hay que contactarlo. Se muestra ACÁ y no como notificación porque el
          conductor está manejando y esta tarjeta es lo único que mira. */}
      {seAproximaSinContacto ? (
        <p className="flex items-start gap-2 rounded-xl bg-warn-bg px-3 py-2 text-sm font-medium text-warn">
          <Phone className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">
            No contestó: llámalo antes de bajar.
          </span>
        </p>
      ) : null}

      {fase === "antes_llamar" ? (
        activa.pedido.telefono ? (
          <button onClick={onLlamar} className={BOTON_PRINCIPAL}>
            <Phone className="h-4 w-4" />
            Llamar
          </button>
        ) : (
          // Viene de la guía y su etiqueta no se escaneó: el teléfono está ahí.
          // Si la etiqueta está dañada o no hay cómo leerla, la parada igual se
          // tiene que poder cerrar o completar a mano (spec 017, E3): si no,
          // traba todas las que siguen.
          <div className="space-y-2">
            <button onClick={onEscanear} className={BOTON_PRINCIPAL}>
              <ScanLine className="h-4 w-4" />
              Escanear la etiqueta para llamar
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={onEditar}
                className={cn(BOTON_RESULTADO, "border border-separator bg-card text-brand")}
              >
                <Pencil className="h-4 w-4 shrink-0" />
                Teléfono
              </button>
              <button
                disabled={guardando}
                onClick={onPedidoFinalizado}
                className={cn(BOTON_RESULTADO, "border border-separator bg-card text-ok")}
              >
                <PackageCheck className="h-4 w-4 shrink-0" />
                Entregado
              </button>
              <button
                disabled={guardando}
                onClick={onNoSePudo}
                className={cn(BOTON_RESULTADO, "border border-separator bg-card text-danger")}
              >
                No se pudo
              </button>
            </div>
          </div>
        )
      ) : null}

      {fase === "esperando_resultado" ? (
        // El botón de llamar queda en el medio para poder reintentar sin tener
        // que decidir todavía si contestó o no (suena ocupado, se cortó).
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <button
            disabled={guardando}
            onClick={onContesto}
            className={cn(BOTON_RESULTADO, "bg-ok text-white")}
          >
            <Check className="h-4 w-4 shrink-0" />
            Contestó
          </button>
          <button
            onClick={onLlamar}
            aria-label="Volver a llamar"
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-separator bg-card text-muted transition-transform active:scale-[0.97]"
          >
            <Phone className="h-5 w-5" />
          </button>
          <button
            disabled={guardando}
            onClick={onNoContesto}
            className={cn(BOTON_RESULTADO, "bg-danger text-white")}
          >
            <X className="h-4 w-4 shrink-0" />
            No contestó
          </button>
        </div>
      ) : null}

      {/* Ya confirmó por WhatsApp: no hay nada que preguntarle por teléfono. Es
          el caso que hace que avisarle AHORRE trabajo y no solo agregue datos. */}
      {fase === "esperando_entrega" || fase === "confirmado" ? (
        <div className="space-y-2">
          <button disabled={guardando} onClick={onPedidoFinalizado} className={BOTON_PRINCIPAL}>
            <PackageCheck className="h-4 w-4" />
            Pedido finalizado
          </button>
          <div className="grid grid-cols-2 gap-2">
            {/* Llamar sigue disponible aunque haya confirmado: puede no abrir. */}
            <button
              onClick={onLlamar}
              className={cn(BOTON_RESULTADO, "border border-separator bg-card text-brand")}
            >
              <Phone className="h-4 w-4 shrink-0" />
              Llamar
            </button>
            <button
              disabled={guardando}
              onClick={onNoSePudo}
              className={cn(BOTON_RESULTADO, "border border-separator bg-card text-danger")}
            >
              No se pudo
            </button>
          </div>
        </div>
      ) : null}

      {/* Las salidas de la parada, en una sola pantalla. */}
      {fase === "salidas" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">¿Qué hacemos con esta parada?</p>
          <div className="grid gap-2">
            {SALIDAS.map((salida) => (
              <button
                key={salida.clave}
                disabled={guardando}
                onClick={() => onSalida(salida)}
                className="flex h-12 items-center gap-2 rounded-full border border-separator bg-card px-4 text-left text-sm font-semibold text-foreground transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
              >
                {salida.clave === "pendiente" ? (
                  <RotateCw className="h-4 w-4 shrink-0 text-brand" />
                ) : (
                  <X className="h-4 w-4 shrink-0 text-danger" />
                )}
                <span className="min-w-0 flex-1">{salida.etiqueta}</span>
                {/* La consecuencia, escrita: el conductor la tiene que ver
                    ANTES de tocar. */}
                <span className="shrink-0 text-[11px] font-medium text-muted">
                  {salida.detalle}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onVolver}
            className="w-full rounded-full py-2 text-sm text-muted active:bg-background"
          >
            Volver
          </button>
        </div>
      ) : null}
    </div>
  );
}
