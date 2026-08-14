import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "dangerOutline";
type Size = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-foreground shadow-[0_1px_2px_rgba(11,93,86,0.3)] hover:bg-brand-dark hover:shadow-[0_4px_14px_rgba(11,93,86,0.28)]",
  secondary: "bg-[#ececef] text-foreground hover:bg-[#e2e2e6]",
  outline:
    "border border-separator bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-[#b6b6bd] hover:bg-background",
  ghost: "text-brand hover:bg-brand-soft",
  danger:
    "bg-danger text-white shadow-[0_1px_2px_rgba(192,54,44,0.3)] hover:bg-[#a32a21] hover:shadow-[0_4px_14px_rgba(192,54,44,0.28)]",
  // Acción destructiva secundaria (el "Eliminar" que convive con otros
  // controles en un panel): pesa menos que el rojo sólido, pero usa el rojo
  // del sistema y la misma altura que el resto de los botones.
  dangerOutline:
    "border border-danger/25 bg-card text-danger shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-danger/40 hover:bg-danger-bg",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-[34px] px-[15px] text-[13px] gap-1.5",
  md: "h-[42px] px-[21px] text-[14.5px] gap-2",
  lg: "h-[50px] px-[27px] text-base gap-2",
  icon: "h-[42px] w-[42px]",
};

export function buttonClass(opts?: { variant?: Variant; size?: Size; className?: string }) {
  const { variant = "primary", size = "md", className } = opts ?? {};
  // El active:scale da el "clic" físico; la transición corta lo hace nítido.
  return cn(
    "inline-flex select-none items-center justify-center rounded-full font-medium transition-[background-color,box-shadow,border-color,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={buttonClass({ variant, size, className })}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
