import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// Casilla de verificación con el estilo del sistema. Antes era un
// <input type="checkbox"> pelado con "accent-brand": eso solo TIÑE el control
// que dibuja el sistema operativo, así que la forma, el tamaño y el borde
// seguían siendo los de Windows o los de iOS — cuadraditos grises al lado de
// campos con borde suave, esquinas redondeadas y halo de foco. Se notaba.
//
// appearance-none apaga ese dibujo y lo reemplaza por uno propio, con las
// MISMAS piezas que ui/input.tsx: el borde separator, la sombra interior, el
// hover que oscurece apenas el borde y el halo de marca al enfocar. Así una
// casilla y un campo de texto se ven de la misma familia.
export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  // El contenedor es inline-flex para que la casilla no se estire dentro de un
  // label flex, y relative para poder poner el tilde encima.
  <span className="relative inline-flex shrink-0 items-center justify-center">
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[6px] border border-separator bg-white",
        "shadow-[inset_0_1px_2px_rgba(0,0,0,0.025)] outline-none",
        "transition-[background-color,border-color,box-shadow] duration-150",
        "hover:border-[#b6b6bd]",
        // Marcada: se rellena con el color de marca y el borde acompaña.
        "checked:border-brand checked:bg-brand checked:hover:border-brand",
        // Mismo halo de foco que los campos de texto (ver inputClass).
        "focus-visible:border-brand focus-visible:shadow-[0_0_0_3.5px_rgba(15,118,110,0.18)]",
        "disabled:cursor-not-allowed disabled:bg-background disabled:opacity-60",
        className,
      )}
      {...props}
    />
    {/* Va DESPUÉS del input para que peer-checked lo alcance (Tailwind solo
        mira hermanos posteriores). pointer-events-none deja que el clic llegue
        siempre al input que tiene debajo. */}
    <Check
      aria-hidden
      strokeWidth={3.5}
      className="pointer-events-none absolute h-3 w-3 scale-75 text-brand-foreground opacity-0 transition-[opacity,transform] duration-150 peer-checked:scale-100 peer-checked:opacity-100"
    />
  </span>
));
Checkbox.displayName = "Checkbox";
