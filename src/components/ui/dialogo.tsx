"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Ventana modal controlada por estado, para abrir un formulario SIN salir de la
// pantalla en la que se está trabajando.
//
// Es distinta de ui/modal.tsx: aquella es para rutas interceptadas (la URL
// cambia y cerrar es router.back()). Esta no toca la URL — se usa cuando lo que
// se edita solo tiene sentido mirando los números que quedan detrás, como las
// reglas de pago contra el panel del mes.
//
// Portal a document.body: un overlay "fixed inset-0" dentro de un ancestro con
// transform o animación se confina al área de ese ancestro y deja franjas de la
// pantalla sin cubrir.
const ANCHOS = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
} as const;

export function Dialogo({
  titulo,
  descripcion,
  ancho = "2xl",
  onCerrar,
  children,
}: {
  titulo: string;
  descripcion?: string;
  ancho?: keyof typeof ANCHOS;
  onCerrar: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", onKey);
    // Sin esto, la rueda del mouse desplaza la página de atrás mientras el
    // diálogo está abierto.
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previo;
    };
  }, [onCerrar]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "animate-scale-in flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[18px] bg-background shadow-card",
          ANCHOS[ancho],
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-white px-5 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{titulo}</h2>
            {descripcion ? <p className="mt-0.5 text-xs text-muted">{descripcion}</p> : null}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
