import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatDateLong, sumarDias, hoyChile } from "@/lib/format";

// Navegación día a día, compartida entre el panel admin (/encomiendas) y la
// app del conductor (/conductor/encomiendas) — mismo componente, mismo
// comportamiento en los dos lados.
export function DiaNav({ fecha, basePath }: { fecha: string; basePath: string }) {
  const hoy = hoyChile();
  const esHoy = fecha === hoy;
  const anterior = sumarDias(fecha, -1);
  const siguiente = sumarDias(fecha, 1);

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-card px-2 py-2 shadow-soft">
      <Link
        href={`${basePath}?fecha=${anterior}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background"
        aria-label="Día anterior"
      >
        <ChevronLeft className="h-5 w-5" />
      </Link>

      <div className="text-center">
        <p className="text-sm font-semibold capitalize">{formatDateLong(fecha)}</p>
        {!esHoy ? (
          <Link href={basePath} className="text-xs text-brand hover:underline">
            Volver a hoy
          </Link>
        ) : (
          <p className="text-xs text-muted">Hoy</p>
        )}
      </div>

      {esHoy ? (
        <span className="h-10 w-10 shrink-0" />
      ) : (
        <Link
          href={`${basePath}?fecha=${siguiente}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background"
          aria-label="Día siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </Link>
      )}
    </div>
  );
}
