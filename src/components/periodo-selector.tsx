"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

// Selector de periodo global. Guarda la elección en una cookie y refresca
// la página actual (los Server Components la leen y re-filtran los datos).
export function PeriodoSelector({
  anio,
  mes,
}: {
  anio: number;
  mes: number | null;
}) {
  const router = useRouter();
  // Cambiar de periodo vuelve a pedir los datos al servidor y eso tarda cerca
  // de un segundo. Sin ningún aviso parecía que el clic no había hecho nada y
  // la gente apretaba de nuevo; con esto la pastilla se atenúa mientras carga.
  const [cargando, iniciar] = useTransition();

  function aplicar(a: number, m: number | null) {
    const val = `${a}-${m === null ? "ALL" : String(m).padStart(2, "0")}`;
    document.cookie = `periodo=${val}; path=/; max-age=${60 * 60 * 24 * 365}`;
    iniciar(() => router.refresh());
  }

  function anterior() {
    if (mes === null) return aplicar(anio - 1, null);
    if (mes === 1) return aplicar(anio - 1, 12);
    aplicar(anio, mes - 1);
  }
  function siguiente() {
    if (mes === null) return aplicar(anio + 1, null);
    if (mes === 12) return aplicar(anio + 1, 1);
    aplicar(anio, mes + 1);
  }

  const esAnio = mes === null;
  const label = esAnio ? `Año ${anio}` : `${MESES[mes - 1]} ${anio}`;

  return (
    <div className={cn("flex items-center gap-2 transition-opacity", cargando && "opacity-60")}>
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1 py-0.5">
        <button
          onClick={anterior}
          disabled={cargando}
          aria-label="Periodo anterior"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-background disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="flex min-w-[112px] items-center justify-center gap-1.5 text-center text-sm font-semibold capitalize">
          {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" /> : null}
          {label}
        </span>
        <button
          onClick={siguiente}
          disabled={cargando}
          aria-label="Periodo siguiente"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-background disabled:pointer-events-none"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <button
        onClick={() => aplicar(anio, esAnio ? new Date().getMonth() + 1 : null)}
        disabled={cargando}
        className={cn(
          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none",
          esAnio
            ? "border-brand bg-brand text-brand-foreground"
            : "border-border bg-card text-foreground hover:bg-background",
        )}
      >
        {esAnio ? "Ver mes" : "Año completo"}
      </button>
    </div>
  );
}
