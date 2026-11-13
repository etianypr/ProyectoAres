"use client";

// Una pregunta antes de perder algo (spec 033): «¿Descartar 6 líneas leídas? ·
// Descartar · Seguir». Va en el lugar del botón principal, así el pulgar la
// encuentra donde iba a tocar. Lo que se descarta, en rojo y escrito.

import { cn } from "@/lib/comun/utils";

export function FranjaConfirmar({
  texto,
  si,
  no = "Seguir",
  onSi,
  onNo,
  className,
}: {
  texto: string;
  /** El que pierde algo («Descartar», «Borrar»). */
  si: string;
  /** El que vuelve a donde estaba. */
  no?: string;
  onSi: () => void;
  onNo: () => void;
  className?: string;
}) {
  return (
    <div role="alertdialog" aria-label={texto} className={cn("space-y-2", className)}>
      <p className="text-center text-sm font-semibold">{texto}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSi}
          className="flex h-12 items-center justify-center rounded-full border border-danger/30 bg-danger-bg text-[15px] font-semibold text-danger active:scale-[0.97]"
        >
          {si}
        </button>
        <button
          type="button"
          onClick={onNo}
          className="flex h-12 items-center justify-center rounded-full bg-brand text-[15px] font-semibold text-brand-foreground active:scale-[0.97]"
        >
          {no}
        </button>
      </div>
    </div>
  );
}
