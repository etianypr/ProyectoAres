"use client";

// Cargar el auto con el escáner en vivo (spec 028, maqueta aprobada 2026-11-08):
// la cámara queda abierta y cada etiqueta se lee sola —«PARADA n de N», bultos,
// nombre, teléfono y pago—; vibra y pita cuando queda leída, y se pasa a la
// siguiente sin tocar. Un ⚠ pausa la lectura ahí mismo, con sus botones. El
// estado vive en use-escaner-vivo.ts. Solo en la APK 1.6.0; si no, queda
// escanear-etiqueta.tsx.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Flashlight, FlashlightOff, Loader2, PackagePlus, X } from "lucide-react";
import { Campo } from "@/components/ui/campo";
import { cn } from "@/lib/comun/utils";
import { formatCLP } from "@/lib/comun/format";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { sePuedeQuitarBulto } from "@/lib/encomiendas/local/almacen";
import { useAtrasPropio } from "../_hooks/use-atras-propio";
import { useEscanerVivo } from "../_hooks/use-escaner-vivo";
import { AvisoOtraParada, tituloEsperado, type PaqueteEsperado } from "./aviso-otra-parada";

const BOTON =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground transition-transform active:scale-[0.97]";
const BOTON_SUAVE = "flex h-11 w-full items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand";

function Dato({ valor, firme, vacio }: { valor: string | null; firme: boolean; vacio: string }) {
  return (
    <p className="flex items-center gap-2 text-[15px]">
      <span className={cn("min-w-0 flex-1 truncate", !valor && "text-muted")}>{valor ?? vacio}</span>
      {valor && firme ? <Check className="h-4 w-4 shrink-0 text-ok" aria-label="Leído" /> : null}
      {valor && !firme ? <span className="shrink-0 text-xs font-semibold text-warn">⚠ revisar</span> : null}
    </p>
  );
}

export function EscanerVivo({
  fecha,
  esperado = null,
  avance,
  onCerrar,
  onCambio,
  onAgregarPedido,
  onClasico,
}: {
  fecha: string;
  /** Abierto desde la parada: el paquete que se espera (spec 033). */
  esperado?: PaqueteEsperado | null;
  avance: { escaneados: number; total: number };
  onCerrar: () => void;
  onCambio: () => void;
  onAgregarPedido: (of: string) => void;
  /** Sin cámara: el escáner de siempre. */
  onClasico: () => void;
}) {
  const [escribiendo, setEscribiendo] = useState(false);
  const { estado, camara, enVivo, linterna, alternarLinterna, seguir, usarDireccion, avisoDireccion, quitarUno, escribir } = useEscanerVivo({
    fecha,
    onCambio,
    pausada: escribiendo,
  });
  const [codigoEscrito, setCodigoEscrito] = useState("");
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const campoOf = useRef<HTMLInputElement>(null);

  // El teclado sube recién con la cámara apagada (use-escaner-vivo, «pausada»).
  useEffect(() => {
    if (escribiendo && !enVivo) campoOf.current?.focus();
  }, [escribiendo, enVivo]);

  // ✕ del campo y atrás mientras se escribe: vuelve a la cámara sin cerrar el
  // escáner (spec 033, vivo-limites). Antes atrás cerraba todo.
  function dejarDeEscribir() {
    campoOf.current?.blur();
    setErrorCodigo(null);
    setCodigoEscrito("");
    setEscribiendo(false);
  }
  useAtrasPropio(escribiendo, dejarDeEscribir);

  function buscar() {
    if (!escribir(codigoEscrito)) {
      setErrorCodigo("Ese código no es de una etiqueta de Starken.");
      return;
    }
    campoOf.current?.blur();
    setErrorCodigo(null);
    setCodigoEscrito("");
    setEscribiendo(false);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={cn("capa-camara fixed inset-0 z-50 flex flex-col", escribiendo && "bg-black")} role="dialog" aria-modal="true" aria-label="Cargar el auto">
      <div className="flex items-center gap-2 bg-black/60 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{esperado ? tituloEsperado(esperado) : "Cargar el auto"}</h2>
        {avance.total > 0 && !esperado ? (
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-sm font-semibold tabular-nums">
            {avance.escaneados} de {avance.total}
          </span>
        ) : null}
        {camara?.linterna ? (
          <button
            type="button"
            onClick={() => void alternarLinterna()}
            aria-label={linterna ? "Apagar la linterna" : "Prender la linterna"}
            aria-pressed={linterna}
            className="flex h-11 w-11 items-center justify-center rounded-full"
          >
            {linterna ? <Flashlight className="h-5 w-5" /> : <FlashlightOff className="h-5 w-5" />}
          </button>
        ) : null}
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="flex h-11 w-11 items-center justify-center rounded-full">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="aspect-[4/3] w-full max-w-sm rounded-2xl border-2 border-white/70" />
      </div>

      <div className="space-y-2 rounded-t-3xl bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {estado.tipo === "prendiendo" ? (
          <p className="flex items-center gap-2 py-3 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Prendiendo la cámara…
          </p>
        ) : null}

        {estado.tipo === "sinCamara" ? (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {estado.motivo}
            </p>
            <button type="button" onClick={onClasico} className={BOTON}>
              Usar el escáner de siempre
            </button>
          </div>
        ) : null}

        {estado.tipo === "buscando" ? <p className="py-3 text-muted">Sin etiqueta en la cámara.</p> : null}

        {estado.tipo === "etiqueta" ? (
          <div className="space-y-1.5">
            <AvisoOtraParada esperado={esperado} r={estado.r} />
            <div className="flex items-end gap-3">
              {estado.r.parada ? (
                <p className="text-5xl font-bold leading-none tabular-nums text-brand">
                  <span className="mr-2 align-middle text-sm font-semibold text-muted">PARADA</span>
                  {estado.r.parada.n}
                  <span className="text-xl font-semibold text-muted"> de {estado.r.parada.total}</span>
                </p>
              ) : (
                <p className="text-lg font-bold">SIN RUTA TODAVÍA</p>
              )}
              {estado.leida && estado.conDato ? (
                <span className="mb-1 ml-auto flex items-center gap-1 rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">
                  <Check className="h-3.5 w-3.5" />
                  Leída
                </span>
              ) : estado.leida ? (
                // Sin ningún dato firme no es «Leída» (spec 033).
                <span className="mb-1 ml-auto rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted">
                  {estado.escrita ? "OF escrita" : "Solo el código"}
                </span>
              ) : null}
            </div>
            <p className="font-mono text-sm tabular-nums text-muted">
              OF {formatoOf(estado.r.pedido.of ?? "")}
              {!estado.leida && estado.votos ? ` · leyendo, ${estado.votos.cuadros} cuadros` : ""}
            </p>
            {(estado.r.pedido.bultos != null && estado.r.pedido.bultos > 1) || sePuedeQuitarBulto(estado.r) ? (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">
                  Bultos {estado.r.pedido.bultosEscaneados.length} de {estado.r.pedido.bultos ?? 1}
                </p>
                {/* El bulto escrito de más o escaneado de más (spec 033): solo el último. */}
                {sePuedeQuitarBulto(estado.r) ? (
                  <button type="button" onClick={() => void quitarUno()} className="h-9 shrink-0 rounded-full border border-separator px-3 text-sm font-semibold text-brand">
                    −1 bulto
                  </button>
                ) : null}
              </div>
            ) : null}
            {avisoDireccion ? <p className="rounded-xl bg-background px-3 py-2 text-sm">{avisoDireccion}</p> : null}
            {(() => {
              // Antes de quedar leída se ve lo que van diciendo los cuadros; después,
              // lo que quedó guardado (solo lo firme).
              const p = estado.r.pedido;
              const l = estado.votos?.lectura;
              const firme = (d: string) => Boolean(l && !l.dudosos.includes(d));
              const pago = (porPagar: boolean | null, monto: number | null) =>
                porPagar === null ? null : !porPagar ? "No se cobra" : monto != null ? `POR PAGAR ${formatCLP(monto)}` : "POR PAGAR · monto por revisar";
              return estado.leida ? (
                <>
                  <Dato valor={p.nombre || null} firme vacio="Destinatario sin leer" />
                  <Dato valor={p.telefono || null} firme vacio="Teléfono sin leer" />
                  <Dato valor={pago(p.porPagar, p.montoPorPagar)} firme={p.porPagar !== true || p.montoPorPagar != null} vacio="Pago sin leer" />
                </>
              ) : (
                <>
                  <Dato valor={l?.destinatario ?? null} firme={firme("destinatario")} vacio="Leyendo el destinatario…" />
                  <Dato valor={l?.telefono ?? null} firme={firme("telefono")} vacio="Leyendo el teléfono…" />
                  <Dato valor={pago(l?.porPagar ?? null, l?.montoPorPagar ?? null)} firme={firme("pago")} vacio="Leyendo el pago…" />
                </>
              );
            })()}
          </div>
        ) : null}

        {estado.tipo === "noEsta" ? (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Este paquete no está en los pedidos de hoy.
            </p>
            <p className="font-mono text-lg font-bold tabular-nums">OF {formatoOf(estado.of)}</p>
            <button type="button" onClick={() => onAgregarPedido(estado.of)} className={BOTON}>
              <PackagePlus className="h-4 w-4" />
              Agregarlo como pedido
            </button>
            <button type="button" onClick={seguir} className={BOTON_SUAVE}>
              Seguir escaneando
            </button>
          </div>
        ) : null}

        {estado.tipo === "otraDireccion" ? (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              La etiqueta dice &ldquo;{estado.direccion}&rdquo;, distinto de la guía.
            </p>
            <button type="button" onClick={() => void usarDireccion()} className={BOTON}>
              Usar la dirección de la etiqueta
            </button>
            <button type="button" onClick={seguir} className={BOTON_SUAVE}>
              Dejar la de la guía
            </button>
          </div>
        ) : null}

        {estado.tipo !== "sinCamara" && estado.tipo !== "prendiendo" ? (
          escribiendo ? (
            <div className="space-y-2 pt-1">
              {errorCodigo ? <p className="text-sm text-danger">{errorCodigo}</p> : null}
              <Campo
                ref={campoOf}
                fin={
                  <button type="button" onClick={dejarDeEscribir} aria-label="Volver a la cámara" className="-mr-1 flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-background">
                    <X className="h-5 w-5" />
                  </button>
                }
                etiqueta="OF"
                inputMode="numeric"
                value={codigoEscrito}
                onChange={(e) => setCodigoEscrito(e.target.value)}
                placeholder="123 456 789"
                enterKeyHint="search"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && codigoEscrito.trim()) buscar();
                }}
                className="font-mono text-lg tabular-nums"
              />
              <button type="button" disabled={!codigoEscrito.trim()} onClick={buscar} className={cn(BOTON_SUAVE, "disabled:opacity-50")}>
                Buscar esta OF
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setEscribiendo(true)} className="h-11 w-full text-sm font-semibold text-brand">
              Escribir la OF
            </button>
          )
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
