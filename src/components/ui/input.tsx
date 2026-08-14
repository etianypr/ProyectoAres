import * as React from "react";
import { cn } from "@/lib/utils";

// Compacto (40px): la app es densa en datos y así editar es más cómodo.
// El foco es el momento clave: borde de marca + halo suave, con transición
// corta. El hover oscurece apenas el borde para invitar a hacer clic.
export const inputClass =
  "flex h-10 w-full rounded-lg border border-separator bg-white px-3 text-sm text-foreground shadow-[inset_0_1px_2px_rgba(0,0,0,0.025)] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted/70 hover:border-[#b6b6bd] focus:border-brand focus:shadow-[inset_0_1px_2px_rgba(0,0,0,0),0_0_0_3.5px_rgba(15,118,110,0.18)] disabled:cursor-not-allowed disabled:bg-background disabled:opacity-60";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";
