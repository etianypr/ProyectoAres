"use client";

// Cargar el auto con el escáner en vivo (spec 028, maqueta aprobada 2026-11-08):
// la cámara queda abierta y cada etiqueta se lee sola —«PARADA n de N», bultos,
// nombre, teléfono y pago—; vibra y pita cuando queda leída, y se pasa a la
// siguiente sin tocar. Un ⚠ pausa la lectura ahí mismo, con sus botones. El
// estado vive en use-escaner-vivo.ts. Solo en la APK 1.6.0; si no, queda
// escanear-etiqueta.tsx.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Flashlight, FlashlightOff, Loader2, PackagePlus, Pencil, X } from "lucide-react";
import { Campo } from "@/components/ui/campo";
import { cn } from "@/lib/comun/utils";
import { normalizarTelefono } from "@/lib/comun/telefono";
import { leerCodigoEtiqueta } from "@/lib/encomiendas/lectura/codigo-barras";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { sePuedeQuitarBulto } from "@/lib/encomiendas/local/almacen";
import { soloLaOf, type EtiquetaParaPedido } from "../_hooks/guardar-etiqueta-viva";
import { useAtrasPropio } from "../_hooks/use-atras-propio";
import { useEscanerVivo } from "../_hooks/use-escaner-vivo";
import { AvisoOtraParada, tituloEsperado, type PaqueteEsperado } from "./aviso-otra-parada";
import { BOTON_PRINCIPAL, BOTON_SECUNDARIO, BOTON_ICONO } from "./botones";
import { Dato, DatosLeyendo, pagoTexto } from "./datos-etiqueta";

// «Seguir» y «Buscar» sobre la cámara: el secundario, con la letra de marca.
const BOTON_SUAVE = cn(BOTON_SECUNDARIO, "text-brand");

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
  /** La OF no está en el día: el pedido nuevo con lo leído de la etiqueta. */
  onAgregarPedido: (e: EtiquetaParaPedido) => void;
  /** Sin cámara: el escáner de siempre. */
  onClasico: () => void;
}) {
  const [escribiendo, setEscribiendo] = useState(false);
  const [agregando, setAgregando] = useState(false);
  /** ✎ del teléfono: lo que se va escribiendo (null: sin corregir). */
  const [telefonoEscrito, setTelefonoEscrito] = useState<string | null>(null);
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
  const campoTelefono = useRef<HTMLInputElement>(null);
  const corrigiendo = telefonoEscrito !== null;
  const { estado, camara, enVivo, linterna, alternarLinterna, seguir, usarDireccion, avisoDireccion, quitarUno, escribir, paraPedido, corregirTelefono } =
    useEscanerVivo({
      fecha,
      onCambio,
      // Con el teclado arriba la cámara se apaga (ANR, use-camara-viva.ts).
      pausada: escribiendo || corrigiendo,
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

  // ✎ del teléfono (dueño, 2026-11-26: «la lectura de teléfono es dudosa»). El teclado sube
  // recién con la cámara apagada, como al ingresar la OF.
  useEffect(() => {
    if (corrigiendo && !enVivo) campoTelefono.current?.focus();
  }, [corrigiendo, enVivo]);
  function dejarDeCorregir() {
    campoTelefono.current?.blur();
    setErrorTelefono(null);
    setTelefonoEscrito(null);
  }
  useAtrasPropio(corrigiendo, dejarDeCorregir);
  function corregir(actual: string | null) {
    const t = normalizarTelefono(actual);
    setTelefonoEscrito(t.ok ? t.telefono.legible.replace(/^\+56\s*/, "") : (actual ?? ""));
  }
  async function guardarTelefono() {
    const t = normalizarTelefono(telefonoEscrito);
    if (!t.ok) return setErrorTelefono(t.motivo);
    if (!(await corregirTelefono(t.telefono.e164))) return setErrorTelefono("No se pudo guardar. Vuelve a intentarlo.");
    dejarDeCorregir();
  }
  const botonCorregir = (actual: string | null) => (
    <button type="button" onClick={() => corregir(actual)} aria-label="Corregir teléfono" className={cn("-mr-2", BOTON_ICONO)}>
      <Pencil className="h-4 w-4 text-brand" />
    </button>
  );

  function buscar() {
    if (!escribir(codigoEscrito)) {
      setErrorCodigo("El código no corresponde a una etiqueta de Starken.");
      return;
    }
    // Lo escrito se queda: si la OF no está en el día (un dígito mal), «Escribir
    // la OF» la trae de vuelta para corregirla, sin escribirla entera de nuevo
    // (terreno 2026-11-14).
    campoOf.current?.blur();
    setErrorCodigo(null);
    setEscribiendo(false);
  }

  /** «Escribir la OF»: vacío, salvo con una OF que no está en el día (leída o
   *  escrita): viene puesta, para cambiarle solo el dígito malo («270…» por
   *  «280…») en vez de escribirla entera (terreno 2026-11-14). */
  function abrirEscribir() {
    if (estado.tipo !== "noEsta") setCodigoEscrito("");
    else if (leerCodigoEtiqueta(codigoEscrito)?.of !== estado.of) setCodigoEscrito(formatoOf(estado.of));
    setEscribiendo(true);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className={cn("capa-camara fixed inset-0 z-pantalla flex flex-col", escribiendo && "bg-black")} role="dialog" aria-modal="true" aria-label="Cargar vehículo">
      <div className="flex items-center gap-2 bg-black/60 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{esperado ? tituloEsperado(esperado) : "Cargar vehículo"}</h2>
        {avance.total > 0 && !esperado ? (
          <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-sm font-semibold tabular-nums">
            {avance.escaneados} de {avance.total}
          </span>
        ) : null}
        {camara?.linterna ? (
          <button
            type="button"
            onClick={() => void alternarLinterna()}
            aria-label={linterna ? "Apagar linterna" : "Encender linterna"}
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

      <div className="space-y-2 rounded-t-hoja bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {estado.tipo === "prendiendo" ? (
          <p className="flex items-center gap-2 py-3 text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Iniciando cámara…
          </p>
        ) : null}

        {estado.tipo === "sinCamara" ? (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {estado.motivo}
            </p>
            <button type="button" onClick={onClasico} className={BOTON_PRINCIPAL}>
              Usar escáner de Google
            </button>
          </div>
        ) : null}

        {estado.tipo === "buscando" ? <p className="py-3 text-muted">No se detecta etiqueta.</p> : null}

        {corrigiendo ? (
          <div className="space-y-2 pt-1">
            {errorTelefono ? <p className="text-sm text-danger">{errorTelefono}</p> : null}
            <Campo
              ref={campoTelefono}
              fin={
                <button type="button" onClick={dejarDeCorregir} aria-label="Volver a la cámara" className={cn("-mr-1", BOTON_ICONO)}>
                  <X className="h-5 w-5" />
                </button>
              }
              etiqueta="Teléfono"
              type="tel"
              inputMode="tel"
              value={telefonoEscrito ?? ""}
              onChange={(e) => setTelefonoEscrito(e.target.value)}
              placeholder="9 1234 5678"
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardarTelefono();
              }}
              className="text-lg tabular-nums"
            />
            <button type="button" disabled={!telefonoEscrito?.trim()} onClick={() => void guardarTelefono()} className={cn(BOTON_PRINCIPAL, "disabled:opacity-50")}>
              Guardar teléfono
            </button>
          </div>
        ) : null}

        {estado.tipo === "etiqueta" && !corrigiendo ? (
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
                <p className="text-lg font-bold">SIN RUTA ASIGNADA</p>
              )}
              {estado.leida && estado.conDato ? (
                <span className="mb-1 ml-auto flex items-center gap-1 rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">
                  <Check className="h-3.5 w-3.5" />
                  Leída
                </span>
              ) : estado.leida ? (
                // Sin ningún dato firme no es «Leída» (spec 033).
                <span className="mb-1 ml-auto rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted">
                  {estado.escrita ? "OF ingresada" : "Solo el código"}
                </span>
              ) : null}
            </div>
            <p className="font-mono text-sm tabular-nums text-muted">
              OF {formatoOf(estado.r.pedido.of ?? "")}
              {/* Spec 039: la nómina la dejó con un «0» donde el código dice «8». */}
              {estado.r.ofAntes ? ` · corregida (era ${formatoOf(estado.r.ofAntes)})` : ""}
              {/* Sin contar cuadros: un texto que cambia en cada cuadro redibujaba la pantalla, y
                  con la cámara encendida cada redibujo puede trabar 1 a 5 s (spec 028). */}
              {!estado.leida && estado.votos ? " · leyendo…" : ""}
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
            {/* Antes de quedar leída se ve lo que van diciendo los cuadros; después, lo que
                quedó guardado (solo lo firme). */}
            {estado.leida ? (
              <>
                <Dato valor={estado.r.pedido.nombre || null} firme vacio="Destinatario sin leer" />
                <Dato
                  valor={estado.r.pedido.telefono || null}
                  firme
                  vacio="Teléfono sin leer"
                  accion={botonCorregir(estado.r.pedido.telefono || null)}
                />
                <Dato
                  valor={pagoTexto(estado.r.pedido.porPagar, estado.r.pedido.montoPorPagar)}
                  firme={estado.r.pedido.porPagar !== true || estado.r.pedido.montoPorPagar != null}
                  vacio="Pago sin leer"
                />
              </>
            ) : (
              <DatosLeyendo
                votos={estado.votos}
                telefono={estado.telefonoAMano ? estado.r.pedido.telefono || null : null}
                accionTelefono={botonCorregir(
                  estado.telefonoAMano ? estado.r.pedido.telefono || null : estado.votos?.lectura.telefono ?? (estado.r.pedido.telefono || null),
                )}
              />
            )}
          </div>
        ) : null}

        {estado.tipo === "noEsta" ? (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-xl bg-warn-bg px-3 py-2 text-sm text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Este paquete no está en los pedidos de hoy.
            </p>
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 font-mono text-lg font-semibold tabular-nums">OF {formatoOf(estado.of)}</p>
              {estado.leida ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-ok-bg px-2.5 py-1 text-xs font-semibold text-ok">
                  <Check className="h-3.5 w-3.5" />
                  Leída
                </span>
              ) : null}
            </div>
            {/* Se sigue leyendo: todo va al pedido nuevo (dueño, 2026-11-25). */}
            <DatosLeyendo votos={estado.votos} conDireccion />
            <button
              type="button"
              disabled={agregando}
              onClick={async () => {
                setAgregando(true);
                const leido = await paraPedido().catch(() => null);
                onAgregarPedido(leido ?? soloLaOf(estado.of));
              }}
              className={BOTON_PRINCIPAL}
            >
              {agregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
              Agregar como pedido
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
            <button type="button" onClick={() => void usarDireccion()} className={BOTON_PRINCIPAL}>
              Usar dirección de la etiqueta
            </button>
            <button type="button" onClick={seguir} className={BOTON_SUAVE}>
              Mantener la de la guía
            </button>
          </div>
        ) : null}

        {estado.tipo !== "sinCamara" && estado.tipo !== "prendiendo" && !corrigiendo ? (
          escribiendo ? (
            <div className="space-y-2 pt-1">
              {errorCodigo ? <p className="text-sm text-danger">{errorCodigo}</p> : null}
              <Campo
                ref={campoOf}
                fin={
                  <button type="button" onClick={dejarDeEscribir} aria-label="Volver a la cámara" className={cn("-mr-1", BOTON_ICONO)}>
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
            <button type="button" onClick={abrirEscribir} className="h-11 w-full text-sm font-semibold text-brand">
              {estado.tipo === "noEsta" ? "Corregir OF" : "Ingresar OF"}
            </button>
          )
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
