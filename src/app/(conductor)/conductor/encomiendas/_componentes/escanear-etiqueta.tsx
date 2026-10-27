"use client";

// Escanear la etiqueta de cada paquete (spec 005, US2–US3): el código de barras
// dice a qué parada va —"PARADA n de N" en lo más grande— y completa el pedido.
//
// Sin IA, la OF y la parada salen del código igual (sin señal también); el
// destinatario, el teléfono y el pago se completan pegando el texto de la
// etiqueta (Google Lens), y la descripción con tres toques.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, PackagePlus, ScanLine, X } from "lucide-react";
import { leerCodigoEtiqueta, type CodigoEtiqueta } from "@/lib/encomiendas/lectura/codigo-barras";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { aplicarLecturaEtiqueta, type ResultadoEscaneo } from "@/lib/encomiendas/local/almacen";
import { esApp } from "@/lib/nativo/entorno";
import { escanearCodigo } from "@/lib/nativo/escaner";
import { Resultado } from "./resultado-escaneo";

type Fase =
  | { tipo: "escaneando" }
  | { tipo: "escribir"; error: string | null }
  | { tipo: "resultado"; r: ResultadoEscaneo; codigo: CodigoEtiqueta }
  | { tipo: "noEsta"; of: string };

const BOTON =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export function EscanearEtiqueta({
  fecha,
  lecturaIA,
  avance,
  onCerrar,
  onCambio,
  onAgregarPedido,
}: {
  fecha: string;
  /** Con IA, una foto de la etiqueta completa el pedido. */
  lecturaIA: boolean;
  /** Paquetes de la guía escaneados sobre el total: el contador de la carga. */
  avance: { escaneados: number; total: number };
  onCerrar: () => void;
  /** Cambió un pedido: la pantalla lo vuelve a leer. */
  onCambio: () => void;
  /** La OF no está en el día: agregarla como pedido nuevo (spec 005, FR-013). */
  onAgregarPedido: (of: string) => void;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: "escaneando" });
  const [codigoEscrito, setCodigoEscrito] = useState("");

  const procesar = useCallback(
    async (texto: string) => {
      const codigo = leerCodigoEtiqueta(texto);
      if (!codigo) {
        setFase({ tipo: "escribir", error: "Ese código no es de una etiqueta de Starken." });
        return;
      }
      let r: ResultadoEscaneo | null;
      try {
        r = await aplicarLecturaEtiqueta(fecha, codigo);
      } catch {
        // Si falla el guardado local, no puede quedar "Abriendo el escáner…"
        // para siempre (spec 017, E12).
        setFase({ tipo: "escribir", error: "No se pudo guardar en el teléfono. Intenta de nuevo." });
        return;
      }
      if (!r) {
        setFase({ tipo: "noEsta", of: codigo.of });
        return;
      }
      onCambio();
      setFase({ tipo: "resultado", r, codigo });
    },
    [fecha, onCambio],
  );

  const escanear = useCallback(async () => {
    if (!esApp()) {
      setFase({ tipo: "escribir", error: null });
      return;
    }
    setFase({ tipo: "escaneando" });
    const leido = await escanearCodigo().catch(() => null);
    if (leido) await procesar(leido);
    else setFase({ tipo: "escribir", error: null });
  }, [procesar]);

  // Al abrir se escanea de una: es lo único que se viene a hacer acá.
  const arrancado = useRef(false);
  useEffect(() => {
    if (arrancado.current) return;
    arrancado.current = true;
    void escanear();
  }, [escanear]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-background pt-[max(0.75rem,env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label="Escanear etiqueta"
    >
      <div className="flex items-center gap-2 px-4 pb-2">
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Escanear etiqueta</h2>
        {avance.total > 0 ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-sm font-semibold tabular-nums text-brand">
            {avance.escaneados}/{avance.total}
          </span>
        ) : null}
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-card"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
        {fase.tipo === "escaneando" ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="text-sm">Abriendo el escáner…</p>
          </div>
        ) : null}

        {fase.tipo === "escribir" ? (
          <div className="space-y-2">
            {fase.error ? (
              <p className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {fase.error}
              </p>
            ) : null}
            <p className="text-sm text-muted">
              Si el código no se lee, escribe la OF de la etiqueta (9 dígitos).
            </p>
            <input
              inputMode="numeric"
              value={codigoEscrito}
              onChange={(e) => setCodigoEscrito(e.target.value)}
              placeholder="123 456 789"
              className="h-12 w-full rounded-2xl border border-separator bg-card px-4 text-lg tabular-nums outline-none focus:border-brand"
            />
            <button
              type="button"
              disabled={!codigoEscrito.trim()}
              onClick={() => void procesar(codigoEscrito)}
              className="h-11 w-full rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
            >
              Buscar esta OF
            </button>
          </div>
        ) : null}

        {fase.tipo === "noEsta" ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-xl font-bold tabular-nums">OF {formatoOf(fase.of)}</p>
            <p className="text-sm text-muted">Este paquete no está en los pedidos de hoy.</p>
            <button
              type="button"
              onClick={() => onAgregarPedido(fase.of)}
              className="mx-auto flex h-11 items-center gap-2 rounded-full border border-separator bg-card px-5 text-sm font-semibold text-brand"
            >
              <PackagePlus className="h-4 w-4" />
              Agregarlo como pedido
            </button>
          </div>
        ) : null}

        {fase.tipo === "resultado" ? (
          <Resultado
            fecha={fecha}
            lecturaIA={lecturaIA}
            inicial={fase.r}
            codigo={fase.codigo}
            onCambio={(r) => {
              onCambio();
              setFase({ tipo: "resultado", r, codigo: fase.codigo });
            }}
          />
        ) : null}
      </div>

      <div className="border-t border-divider px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" onClick={() => void escanear()} disabled={fase.tipo === "escaneando"} className={BOTON}>
          <ScanLine className="h-4 w-4" />
          {fase.tipo === "resultado" || fase.tipo === "noEsta"
            ? avance.total > 0 && avance.escaneados >= avance.total
              ? "Todos escaneados · escanear otra"
              : "Escanear el siguiente paquete"
            : "Escanear"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
