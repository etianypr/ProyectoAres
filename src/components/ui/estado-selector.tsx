"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { tones, type Tone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type EstadoOpcion = {
  value: string;
  label: string;
  tone: Tone;
};

// Selector de estado del sistema de diseño: pastillas segmentadas con el
// punto de color de cada estado (misma gramática que los badges). El activo
// se pinta con su tono; tocar otro cambia el valor y dispara onCambio para
// autoguardar. Mientras `pending` es true muestra un spinner en la pastilla
// activa y bloquea clics, para dejar claro que está guardando.
export function EstadoSelector({
  name,
  defaultValue,
  opciones,
  onCambio,
  pending = false,
}: {
  name: string;
  defaultValue: string;
  opciones: EstadoOpcion[];
  // Devolver false veta el cambio (transición inválida): la pastilla revierte.
  onCambio?: (valor: string) => void | boolean;
  pending?: boolean;
}) {
  const [valor, setValor] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sincroniza con el valor del servidor cuando cambia (tras guardar y
  // revalidar): así la pastilla siempre refleja lo realmente guardado.
  const [defPrev, setDefPrev] = useState(defaultValue);
  if (defaultValue !== defPrev) {
    setDefPrev(defaultValue);
    setValor(defaultValue);
  }

  function elegir(nuevo: string) {
    if (nuevo === valor || pending) return;
    const previo = valor;
    // Fija el valor en el DOM antes del callback, para que un
    // requestSubmit() inmediato ya lea el estado nuevo.
    if (inputRef.current) inputRef.current.value = nuevo;
    setValor(nuevo);
    if (onCambio?.(nuevo) === false) {
      // Vetado: vuelve al estado anterior.
      if (inputRef.current) inputRef.current.value = previo;
      setValor(previo);
    }
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border bg-white p-1 transition-opacity",
        pending && "opacity-60",
      )}
      aria-busy={pending}
    >
      <input ref={inputRef} type="hidden" name={name} defaultValue={defaultValue} />
      {opciones.map((o) => {
        const activo = o.value === valor;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => elegir(o.value)}
            disabled={pending}
            aria-pressed={activo}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-[background-color,color,transform] duration-150 active:scale-95",
              pending ? "cursor-wait" : "cursor-pointer",
              activo
                ? tones[o.tone].wrap
                : "text-muted hover:bg-background hover:text-foreground",
            )}
          >
            {activo && pending ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <span
                className={cn("h-1.5 w-1.5 rounded-full", activo ? "" : "opacity-40")}
                style={{ background: tones[o.tone].dot }}
                aria-hidden
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
