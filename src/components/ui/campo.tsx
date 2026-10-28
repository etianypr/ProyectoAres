"use client";

// Caja de texto con la etiqueta ADENTRO (app del conductor, terreno 2026-10-28:
// "que las cajas de texto se vean más profesionales y optimicen el espacio").
// La etiqueta encima de la caja gastaba un renglón por campo; adentro, cada
// campo es una sola pieza de 52 px y el formulario entra sin deslizar.
//
// Toda la caja es tocable: un toque en el borde o en la etiqueta pone el cursor
// en el campo, no hay que apuntarle al renglón del texto con el pulgar.

import * as React from "react";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/comun/utils";

export type TonoCampo = "normal" | "aviso";

/** El texto que se escribe: sin borde ni fondo propios, los pone la caja. */
export const entradaCampo =
  "block h-6 w-full min-w-0 bg-transparent p-0 text-base font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted/55 disabled:cursor-not-allowed disabled:opacity-60";

type Caja = {
  etiqueta: string;
  /** Lo que acompaña a la etiqueta en tono menor ("opcional"). */
  extra?: string;
  /** Al final de la caja: un ícono de estado, un spinner. */
  fin?: React.ReactNode;
  tono?: TonoCampo;
  /** 44 px en vez de 52: para editar dentro de una lista. */
  compacto?: boolean;
  cajaClassName?: string;
};

export function CajaCampo({
  etiqueta,
  extra,
  fin,
  tono = "normal",
  compacto = false,
  htmlFor,
  className,
  children,
}: Omit<Caja, "cajaClassName"> & { htmlFor: string; className?: string; children: React.ReactNode }) {
  return (
    <div
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("input,textarea,button,a,label")) return;
        document.getElementById(htmlFor)?.focus();
      }}
      className={cn(
        "group/campo flex cursor-text items-center gap-2 rounded-[14px] border bg-card px-3.5 transition-[border-color,box-shadow] duration-150 focus-within:shadow-[0_0_0_3.5px_var(--brand-ring)]",
        compacto ? "min-h-11 py-1" : "min-h-[52px] py-1.5",
        tono === "aviso" ? "border-warn/60" : "border-separator focus-within:border-brand",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className={cn(
            "block cursor-text truncate text-[11px] font-semibold leading-[14px] tracking-[0.02em] transition-colors duration-150",
            tono === "aviso" ? "text-warn" : "text-muted group-focus-within/campo:text-brand",
          )}
        >
          {etiqueta}
          {extra ? <span className="font-normal opacity-75"> · {extra}</span> : null}
        </label>
        {children}
      </div>
      {fin ? <span className="flex shrink-0 items-center">{fin}</span> : null}
    </div>
  );
}

type PropsCampo = Caja & React.InputHTMLAttributes<HTMLInputElement>;

export const Campo = React.forwardRef<HTMLInputElement, PropsCampo>(
  ({ etiqueta, extra, fin, tono, compacto, cajaClassName, id, className, ...props }, ref) => {
    const propio = React.useId();
    const idCampo = id ?? propio;
    return (
      <CajaCampo
        etiqueta={etiqueta}
        extra={extra}
        fin={fin}
        tono={tono}
        compacto={compacto}
        htmlFor={idCampo}
        className={cajaClassName}
      >
        <input ref={ref} id={idCampo} className={cn(entradaCampo, compacto && "h-5 text-sm", className)} {...props} />
      </CajaCampo>
    );
  },
);
Campo.displayName = "Campo";

type PropsCampoArea = Omit<Caja, "compacto"> & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const CampoArea = React.forwardRef<HTMLTextAreaElement, PropsCampoArea>(
  ({ etiqueta, extra, fin, tono, cajaClassName, id, className, ...props }, ref) => {
    const propio = React.useId();
    const idCampo = id ?? propio;
    return (
      <CajaCampo
        etiqueta={etiqueta}
        extra={extra}
        fin={fin}
        tono={tono}
        htmlFor={idCampo}
        className={cn("items-start py-2", cajaClassName)}
      >
        <textarea
          ref={ref}
          id={idCampo}
          className={cn(entradaCampo, "mt-0.5 h-auto resize-none leading-6", className)}
          {...props}
        />
      </CajaCampo>
    );
  },
);
CampoArea.displayName = "CampoArea";

/** El renglón de estado bajo un campo: un dato que se confirma o un aviso. */
export function NotaCampo({ tono, children }: { tono: "ok" | "aviso"; children: React.ReactNode }) {
  const Icono = tono === "ok" ? Check : AlertTriangle;
  return (
    <p className={cn("flex items-start gap-1 px-1 text-xs leading-4", tono === "ok" ? "text-ok" : "text-warn")}>
      <Icono className="mt-px h-3 w-3 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
