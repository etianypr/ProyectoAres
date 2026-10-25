import * as React from "react";
import { cn } from "@/lib/comun/utils";

// Badge genérico. El de vencimiento de la licencia vive con la pantalla de
// conductores (_componentes/vencimiento-badge.tsx): una primitiva de ui no
// conoce reglas del negocio.

export const tones = {
  gray: { wrap: "bg-[#ececef] text-[#6e6e73]", dot: "#86868b" },
  blue: { wrap: "bg-info-bg text-info", dot: "var(--info)" },
  green: { wrap: "bg-ok-bg text-ok", dot: "var(--ok)" },
  amber: { wrap: "bg-warn-bg text-warn", dot: "var(--warn)" },
  red: { wrap: "bg-danger-bg text-danger", dot: "var(--danger)" },
  violet: { wrap: "bg-[#ece8f8] text-[#5b3aa8]", dot: "#5b3aa8" },
} as const;

export type Tone = keyof typeof tones;

export function Badge({
  tone = "gray",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  const t = tones[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
        t.wrap,
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: t.dot }}
        aria-hidden
      />
      {children}
    </span>
  );
}
