"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

// Ventana modal para rutas interceptadas (crear registros sin salir de la
// lista). Se cierra con Escape, clic en el fondo o la X — todos vuelven a la
// ruta anterior (router.back()), y el redirect() del server action al guardar
// la cierra solo.
//
// Se renderiza con un PORTAL a document.body: así el overlay `fixed inset-0`
// cubre TODA la ventana (no queda atrapado dentro de un ancestro con
// transform/animación, que lo confinaría al área de contenido y dejaría
// franjas sin oscurecer).
const ANCHOS = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
} as const;

export function Modal({
  titulo,
  ancho = "3xl",
  blanco = false,
  children,
}: {
  titulo: string;
  ancho?: keyof typeof ANCHOS;
  // Cuerpo blanco (para formularios sencillos que van directo, sin tarjeta
  // interna). Por defecto gris, para formularios que traen su propia tarjeta.
  blanco?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const fondo = blanco ? "bg-white" : "bg-background";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [router]);

  // El modal solo se muestra por navegación de cliente (rutas interceptadas),
  // así que document siempre existe aquí; la guarda es por seguridad ante SSR.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={() => router.back()}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`animate-scale-in flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[18px] shadow-card ${fondo} ${ANCHOS[ancho]}`}
      >
        <div
          className={`flex items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-6 ${fondo}`}
        >
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
