import * as React from "react";
import { cn } from "@/lib/utils";

export const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      // Dentro de un <Field>, la etiqueta se tiñe de marca cuando su campo
      // toma el foco (group/field). Fuera de Field, el modificador no aplica.
      "mb-1.5 block text-xs font-semibold tracking-[0.01em] text-[#48484d] transition-colors duration-150 group-focus-within/field:text-brand",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group/field", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
