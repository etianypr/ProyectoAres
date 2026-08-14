"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

// Formatea a miles chilenos: "100000" → "100.000". Toma solo la parte entera
// (CLP no usa decimales) para tolerar valores como "100000.00" desde la base.
export function formatMiles(raw: string | number): string {
  const d = String(raw).split(/[.,]/)[0].replace(/\D/g, "");
  return d ? Number(d).toLocaleString("es-CL") : "";
}

// Campo de dinero: muestra el prefijo "$" y va poniendo los puntos de miles
// mientras escribes (100000 → $100.000). El valor de `value`/`onChange` es
// siempre el número en crudo (solo dígitos), y el server lo lee con num().
export function MoneyInput({
  value,
  onChange,
  name,
  className,
  ...props
}: {
  value: string;
  onChange: (raw: string) => void;
  name?: string;
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "name" | "type"
>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
        $
      </span>
      <input
        {...props}
        inputMode="numeric"
        value={formatMiles(value)}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className={cn(inputClass, "pl-7 tabular-nums", className)}
      />
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
