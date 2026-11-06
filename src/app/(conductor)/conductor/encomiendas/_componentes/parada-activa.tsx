"use client";

// La parada activa en la cabecera de la hoja: su tarjeta y los botones del paso
// que toca (sale de pantalla.tsx, spec 002 T037). Es lo único que se mira
// manejando. Qué botones van y qué dice el estado sale de botones-parada.ts, lo
// mismo que dibuja la burbuja sobre Google Maps (spec 020): acá solo se les pone
// ícono y clases.

import { AlertTriangle, Check, Clock, PackageCheck, Pencil, Phone, RotateCw, ScanLine, X, type LucideIcon } from "lucide-react";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { cn } from "@/lib/comun/utils";
import type { Parada } from "../_hooks/use-dia-trabajo";
import type { Fase } from "../_hooks/fase-parada";
import { botonesDeParada, estadoDeParada, type BotonParada, type IdBoton, type Tono } from "../_hooks/botones-parada";
import { TarjetaParada } from "./tarjeta-parada";
import { tituloAvisoAdelante, type AvisoAdelante } from "../_hooks/aviso-adelante";

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

const BORDE = "border border-separator bg-card";
const CLASE_TONO: Record<Tono, string> = {
  marca: "bg-brand text-brand-foreground",
  ok: "bg-ok text-white",
  peligro: "bg-danger text-white",
  "borde-marca": cn(BORDE, "text-brand"),
  "borde-ok": cn(BORDE, "text-ok"),
  "borde-peligro": cn(BORDE, "text-danger"),
  neutro: cn(BORDE, "text-foreground"),
};

const ICONO: Partial<Record<IdBoton, LucideIcon>> = {
  llamar: Phone,
  escanear: ScanLine,
  telefono: Pencil,
  entregado: PackageCheck,
  no_se_pudo: X,
  pendiente: RotateCw,
  no_entregado: X,
};

export function ParadaActiva({
  activa,
  fase,
  whatsapp,
  guardando,
  seAproximaSinContacto,
  faltan,
  onNavegar,
  onBoton,
  adelante = null,
  onLlamarA,
  onVer,
}: {
  activa: Parada;
  fase: Fase;
  /** false = sin avisos por WhatsApp: no se muestra "Sin respuesta todavía". */
  whatsapp: boolean;
  guardando: boolean;
  /** FR-017: llegando a una parada que todavía no se contactó. */
  seAproximaSinContacto: boolean;
  /** Lo que falta hasta la parada (use-hacia-parada.ts). */
  faltan: { metros: number; segundos: number | null; llegada: number | null } | null;
  /** Navegar con Google Maps y la burbuja (spec 020); sin punto, no hay. */
  onNavegar?: () => void;
  onBoton: (id: IdBoton) => void;
  /** Un pedido con ⚠ a una o dos paradas (spec 022, US2). */
  adelante?: AvisoAdelante | null;
  /** Llamar a ESE pedido, o abrirlo si no tiene teléfono. */
  onLlamarA?: (parada: Parada) => void;
  onVer?: (pedido: Pedido) => void;
}) {
  const estado = estadoDeParada(activa, whatsapp);
  const filas = botonesDeParada(activa, fase);
  const EstadoIcono = estado ? { reloj: Clock, check: Check, telefono: Phone }[estado.icono] : null;

  return (
    <div className="space-y-3">
      {/* Spec 022: dos paradas antes de un pedido con ⚠, para confirmar antes de
          ir. Va en la cabecera porque manejando es lo único que se mira. */}
      {adelante ? (
        <div className="flex items-center gap-2 rounded-xl bg-warn-bg py-1.5 pl-3 pr-1.5 text-warn">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate text-[13px] font-semibold">{tituloAvisoAdelante(adelante)}</p>
            <p className="truncate">{adelante.problema.texto}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              adelante.parada.pedido.telefono ? onLlamarA?.(adelante.parada) : onVer?.(adelante.parada.pedido)
            }
            className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-warn/30 bg-card px-3 text-xs font-semibold active:scale-[0.97]"
          >
            {adelante.parada.pedido.telefono ? <Phone className="h-3.5 w-3.5" /> : null}
            {adelante.parada.pedido.telefono ? "Llamar" : "Ver"}
          </button>
        </div>
      ) : null}
      <TarjetaParada
        secuencia={activa.secuencia}
        pedido={activa.pedido}
        onNavegar={onNavegar}
        faltan={faltan}
        estado={
          estado && EstadoIcono ? (
            <p
              className={cn(
                LINEA_ESTADO,
                estado.tono === "marca" ? "text-brand" : estado.tono === "ok" ? "text-ok" : "text-muted",
              )}
            >
              <EstadoIcono className="h-3 w-3 shrink-0" />
              {estado.texto}
            </p>
          ) : null
        }
      />

      {/* FR-017: al aproximarse a un pedido pendiente de respuesta, avisar que
          hay que contactarlo. Se muestra ACÁ y no como notificación porque el
          conductor está manejando y esta tarjeta es lo único que mira. */}
      {seAproximaSinContacto ? (
        <p className="flex items-start gap-2 rounded-xl bg-warn-bg px-3 py-2 text-sm font-medium text-warn">
          <Phone className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Llámalo antes de bajar.</span>
        </p>
      ) : null}

      <div className="space-y-2">
        {/* Las salidas de la parada, en una sola pantalla. */}
        {fase === "salidas" ? <p className="text-xs text-muted">¿Qué hacemos con esta parada?</p> : null}
        {filas.map((fila, i) => (
          <Fila key={i} fila={fila} guardando={guardando} onBoton={onBoton} />
        ))}
      </div>
    </div>
  );
}

function Fila({ fila, guardando, onBoton }: { fila: BotonParada[]; guardando: boolean; onBoton: (id: IdBoton) => void }) {
  const [unico] = fila;
  if (fila.length === 1 && unico.id === "volver") {
    return (
      <button
        type="button"
        onClick={() => onBoton("volver")}
        className="w-full rounded-full py-2 text-sm text-muted active:bg-background"
      >
        {unico.texto}
      </button>
    );
  }
  if (fila.length === 1 && unico.detalle) return <BotonSalida boton={unico} guardando={guardando} onBoton={onBoton} />;
  if (fila.length === 1) {
    const Icono = ICONO[unico.id];
    // Sola en su fila es la acción principal solo si su tono lo dice: "Teléfono a
    // mano" va debajo de la fila principal, sin competir con ella.
    const clase = unico.tono === "marca" ? BOTON_PRINCIPAL : cn(BOTON_RESULTADO, CLASE_TONO[unico.tono], "w-full");
    return (
      <button disabled={unico.escribe && guardando} onClick={() => onBoton(unico.id)} className={clase}>
        {Icono ? <Icono className="h-4 w-4" /> : null}
        {unico.texto}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "grid items-center gap-2",
        fila.some((x) => x.soloIcono) ? "grid-cols-[1fr_auto_1fr]" : fila.length === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {fila.map((boton) => {
        const Icono = ICONO[boton.id];
        return boton.soloIcono ? (
          <button
            key={boton.id}
            onClick={() => onBoton(boton.id)}
            aria-label={boton.texto}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-separator bg-card text-muted transition-transform active:scale-[0.97]"
          >
            {Icono ? <Icono className="h-5 w-5" /> : null}
          </button>
        ) : (
          <button
            key={boton.id}
            disabled={boton.escribe && guardando}
            onClick={() => onBoton(boton.id)}
            className={cn(BOTON_RESULTADO, CLASE_TONO[boton.tono])}
          >
            {Icono ? <Icono className="h-4 w-4 shrink-0" /> : null}
            {boton.texto}
          </button>
        );
      })}
    </div>
  );
}

/** Una salida de la parada: la consecuencia escrita al lado, antes de tocar. */
function BotonSalida({ boton, guardando, onBoton }: { boton: BotonParada; guardando: boolean; onBoton: (id: IdBoton) => void }) {
  return (
    <button
      disabled={guardando}
      onClick={() => onBoton(boton.id)}
      className="flex h-12 w-full items-center gap-2 rounded-full border border-separator bg-card px-4 text-left text-sm font-semibold text-foreground transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
    >
      {boton.id === "pendiente" ? (
        <RotateCw className="h-4 w-4 shrink-0 text-brand" />
      ) : (
        <X className="h-4 w-4 shrink-0 text-danger" />
      )}
      <span className="min-w-0 flex-1">{boton.texto}</span>
      <span className="shrink-0 text-[11px] font-medium text-muted">{boton.detalle}</span>
    </button>
  );
}
