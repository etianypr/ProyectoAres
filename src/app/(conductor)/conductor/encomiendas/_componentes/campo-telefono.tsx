"use client";

// «Teléfono · opcional» y «Llamar» en «Cargar la guía» (dueño, 2026-11-13): en la
// línea con ⚠ (paso 2) y en cada corrección de la IA (paso 3). «Llamar» aparece
// solo con un número válido y usa la misma llamada que la parada: de fondo en la
// APK, `tel:` sin ella. El número no sale del teléfono.

import { useState } from "react";
import { Check, Phone } from "lucide-react";
import { Campo } from "@/components/ui/campo";
import { cn } from "@/lib/comun/utils";
import { normalizarTelefono } from "@/lib/comun/telefono";
import { llamar } from "@/lib/nativo/telefono";

export function CampoTelefono({ valor, onCambiar }: { valor: string; onCambiar: (telefono: string) => void }) {
  const [llamando, setLlamando] = useState(false);
  const r = normalizarTelefono(valor);
  const numero = r.ok ? r.telefono.e164 : null;
  const conAviso = r.ok ? r.aviso != null : valor.trim() !== "";
  return (
    <div className="flex items-stretch gap-2">
      <Campo
        compacto
        etiqueta="Teléfono"
        extra="opcional"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        tono={conAviso ? "aviso" : "normal"}
        fin={numero && !conAviso ? <Check aria-label="válido" className="h-4 w-4 text-ok" /> : null}
        cajaClassName="min-w-0 flex-1"
        className="font-mono tabular-nums"
      />
      {numero ? (
        <button
          type="button"
          disabled={llamando}
          onClick={() => {
            // Un segundo toque mientras sale la llamada no vuelve a llamar.
            setLlamando(true);
            void llamar(numero).finally(() => setTimeout(() => setLlamando(false), 3000));
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-sm font-semibold text-brand-foreground active:scale-[0.97] disabled:opacity-60"
        >
          <Phone className="h-4 w-4" />
          Llamar
        </button>
      ) : null}
    </div>
  );
}

/** El botón que abre y cierra «Teléfono · opcional» (dueño, 2026-11-13): el campo
 *  no está siempre a la vista; con un teléfono ya anotado se abre de entrada. */
export function BotonTelefono({ abierto, onClick }: { abierto: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Teléfono"
      aria-expanded={abierto}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border active:scale-[0.97]",
        abierto ? "border-brand bg-brand-soft text-brand" : "border-separator bg-card text-brand",
      )}
    >
      <Phone className="h-4 w-4" />
    </button>
  );
}
