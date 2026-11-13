"use client";

// Diagnóstico → «Probar escáner en vivo» (spec 028, T004): antes de hacer la
// pantalla de carga, medir en el teléfono si ML Kit lee la letra chica de la
// etiqueta en los cuadros de la cámara y cuántos cuadros hacen falta para que
// cada dato salga igual. Muestra, por dato, el valor que más se repite y en
// cuántos cuadros salió. No guarda nada ni manda nada: todo queda en el teléfono.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ScanLine, X } from "lucide-react";
import { formatCLP } from "@/lib/comun/format";
import { codigoEnLaFoto } from "@/lib/encomiendas/lectura/codigo-barras";
import { leerEtiqueta, type LecturaEtiqueta } from "@/lib/encomiendas/lectura/etiqueta";
import { formatoOf } from "@/lib/encomiendas/paquete";
import { alBotonAtras } from "@/lib/nativo/entorno";
import {
  elegirEscanerClasico,
  escanerVivoDisponible,
  escanerClasicoElegido,
  iniciarEscanerVivo,
  type CuadroVivo,
} from "@/lib/nativo/escaner-vivo";

const CAMPOS = [
  ["codigo", "Código"],
  ["destinatario", "Destinatario"],
  ["telefono", "Teléfono"],
  ["pago", "Pago"],
] as const;
type Campo = (typeof CAMPOS)[number][0];
type Conteo = Record<Campo, Record<string, number>>;

const vacio = (): Conteo => ({ codigo: {}, destinatario: {}, telefono: {}, pago: {} });

function pagoDe(e: LecturaEtiqueta): string | null {
  if (e.porPagar === null) return null;
  if (!e.porPagar) return "no se cobra";
  return e.montoPorPagar != null ? `POR PAGAR ${formatCLP(e.montoPorPagar)}` : "POR PAGAR · monto por revisar";
}

type Medida = { cuadros: number; conTexto: number; msTotal: number; ultimoMs: number; renglones: number; conteo: Conteo };

export function ProbarEscanerVivo({ enApp }: { enApp: boolean }) {
  // enApp llega después de abrir la pantalla: en el servidor no hay APK.
  const disponible = enApp && escanerVivoDisponible();
  // En el servidor da false (sin localStorage), pero la casilla recién se ve con
  // la APK detectada, después de hidratar: no hay diferencia que corregir.
  const [elegido, setElegido] = useState(escanerClasicoElegido);
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [medida, setMedida] = useState<Medida | null>(null);
  const apagar = useRef<(() => Promise<void>) | null>(null);
  const ofActual = useRef<string | null>(null);
  const acumulado = useRef<Medida>({ cuadros: 0, conTexto: 0, msTotal: 0, ultimoMs: 0, renglones: 0, conteo: vacio() });

  function alCuadro(c: CuadroVivo) {
    const m = acumulado.current;
    const codigo = codigoEnLaFoto(c.codigos);
    // Otra etiqueta en cámara: se empieza a contar de nuevo.
    if (codigo && codigo.of !== ofActual.current) {
      ofActual.current = codigo.of;
      Object.assign(m, { cuadros: 0, conTexto: 0, msTotal: 0, conteo: vacio() });
    }
    const sumar = (campo: Campo, valor: string | null) => {
      if (valor) m.conteo[campo][valor] = (m.conteo[campo][valor] ?? 0) + 1;
    };
    m.cuadros += 1;
    m.msTotal += c.ms;
    m.ultimoMs = c.ms;
    m.renglones = c.renglones.length;
    sumar("codigo", codigo ? `OF ${formatoOf(codigo.of)} · bulto ${codigo.bulto ?? "?"}` : null);
    const texto = c.renglones.map((r) => r.texto).join("\n");
    if (texto.trim()) {
      m.conTexto += 1;
      const e = leerEtiqueta(texto);
      sumar("destinatario", e.destinatario);
      sumar("telefono", e.telefono);
      sumar("pago", pagoDe(e));
    }
    setMedida({ ...m, conteo: { ...m.conteo } });
  }

  async function iniciar() {
    setError(null);
    ofActual.current = null;
    acumulado.current = { cuadros: 0, conTexto: 0, msTotal: 0, ultimoMs: 0, renglones: 0, conteo: vacio() };
    setMedida(null);
    document.documentElement.classList.add("camara-viva");
    setActivo(true);
    try {
      apagar.current = (await iniciarEscanerVivo(alCuadro)).apagar;
    } catch (e) {
      document.documentElement.classList.remove("camara-viva");
      setActivo(false);
      setError(e instanceof Error && /permiso/.test(e.message) ? "Sin permiso de cámara." : "La cámara no abrió.");
    }
  }

  async function detener() {
    await apagar.current?.();
    apagar.current = null;
    document.documentElement.classList.remove("camara-viva");
    setActivo(false);
  }

  // Atrás de Android y salir de la pantalla también la apagan.
  useEffect(() => {
    if (!activo) return;
    const soltar = alBotonAtras(() => void detener());
    return () => soltar();
  }, [activo]);
  useEffect(
    () => () => {
      void apagar.current?.();
      document.documentElement.classList.remove("camara-viva");
    },
    [],
  );

  const mejor = (campo: Campo) => {
    const valores = Object.entries(medida?.conteo[campo] ?? {}).sort((a, b) => b[1] - a[1]);
    return valores[0] ?? null;
  };

  return (
    <>
      <button
        type="button"
        disabled={!disponible || activo}
        onClick={() => void iniciar()}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
      >
        <ScanLine className="h-4 w-4" />
        Probar escáner en vivo
      </button>
      {!disponible ? (
        <p className="text-xs text-muted">{enApp ? "Esta app no trae el escáner en vivo (APK 1.6.0)." : "Solo en la app."}</p>
      ) : null}
      {disponible ? (
        <label className="flex items-center gap-2 px-1 text-sm font-medium">
          <input
            type="checkbox"
            checked={elegido}
            onChange={(e) => {
              elegirEscanerClasico(e.target.checked);
              setElegido(e.target.checked);
            }}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Cargar el auto con el escáner de Google
        </label>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {activo
        ? createPortal(
            <div className="capa-camara fixed inset-0 z-[60] flex flex-col">
              <div className="flex items-center gap-2 bg-black/60 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
                <p className="flex-1 text-sm font-semibold">Escáner en vivo</p>
                <button type="button" onClick={() => void detener()} aria-label="Detener" className="flex h-11 w-11 items-center justify-center">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="aspect-[4/3] w-full max-w-sm rounded-2xl border-2 border-white/70" />
              </div>
              <div className="space-y-1.5 bg-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-sm">
                {medida ? (
                  <>
                    <p className="font-mono text-xs text-muted">
                      {medida.cuadros} cuadros · {Math.round(medida.msTotal / Math.max(1, medida.cuadros))} ms promedio ·{" "}
                      {medida.ultimoMs} ms el último · {medida.renglones} renglones
                    </p>
                    {CAMPOS.map(([campo, etiqueta]) => {
                      const m = mejor(campo);
                      const de = campo === "codigo" ? medida.cuadros : medida.conTexto;
                      return (
                        <div key={campo} className="flex gap-3">
                          <span className="w-24 shrink-0 text-muted">{etiqueta}</span>
                          <span className="min-w-0 flex-1 break-words">
                            {m ? m[0] : "sin leer"}
                            {m ? <span className="ml-1.5 font-mono text-xs text-muted">{m[1]} de {de}</span> : null}
                          </span>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Prendiendo la cámara…
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
