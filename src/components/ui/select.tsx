import * as React from "react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      inputClass,
      "ui-select cursor-pointer appearance-none bg-white pr-9",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
