"use client";

// Las filas de datos de una etiqueta en el escáner en vivo (spec 028): destinatario, teléfono
// y pago, con ✓ si quedaron firmes o «revisar». Salió de escaner-vivo.tsx (A7).

import type { ReactNode } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { formatCLP } from "@/lib/comun/format";
import type { ResultadoVotos } from "@/lib/encomiendas/lectura/etiqueta/votos";

export function Dato({ valor, firme, vacio, accion }: { valor: string | null; firme: boolean; vacio: string; accion?: ReactNode }) {
  return (
    <p className={cn("flex items-center gap-2 text-[15px]", accion && "-my-1.5")}>
      <span className={cn("min-w-0 flex-1 truncate", !valor && "text-muted")}>{valor ?? vacio}</span>
      {valor && firme ? <Check className="h-4 w-4 shrink-0 text-ok" aria-label="Leído" /> : null}
      {valor && !firme ? <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-warn"><AlertTriangle aria-hidden className="h-3.5 w-3.5" />revisar</span> : null}
      {accion}
    </p>
  );
}

export const pagoTexto = (porPagar: boolean | null, monto: number | null) =>
  porPagar === null ? null : !porPagar ? "No se cobra" : monto != null ? `POR PAGAR ${formatCLP(monto)}` : "POR PAGAR · monto por revisar";

/** Lo que van diciendo los cuadros, antes de guardarse (solo lo firme lleva ✓). `telefono`:
 *  el corregido con ✎, que manda sobre lo que se lee. */
export function DatosLeyendo({
  votos,
  conDireccion = false,
  telefono,
  accionTelefono,
}: {
  votos: ResultadoVotos | null;
  conDireccion?: boolean;
  telefono?: string | null;
  accionTelefono?: ReactNode;
}) {
  const l = votos?.lectura;
  const firme = (d: string) => Boolean(l && !l.dudosos.includes(d));
  return (
    <>
      <Dato valor={l?.destinatario ?? null} firme={firme("destinatario")} vacio="Leyendo destinatario…" />
      {telefono ? (
        <Dato valor={telefono} firme vacio="" accion={accionTelefono} />
      ) : (
        <Dato valor={l?.telefono ?? null} firme={firme("telefono")} vacio="Leyendo teléfono…" accion={accionTelefono} />
      )}
      {conDireccion && l?.direccion ? <Dato valor={l.direccion} firme={firme("direccion")} vacio="" /> : null}
      <Dato valor={pagoTexto(l?.porPagar ?? null, l?.montoPorPagar ?? null)} firme={firme("pago")} vacio="Leyendo pago…" />
    </>
  );
}
