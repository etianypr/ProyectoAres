// Periodo global del panel (un mes o un año completo). Puro: lo usan el servidor
// (que lo lee de la cookie, ver ./periodo-servidor) y el selector del navegador
// (que la escribe). El formato de la cookie vive acá, una sola vez.
import { MESES } from "./fechas";

/** mes: 1-12, o null = año completo. */
export type Periodo = { anio: number; mes: number | null };

export const COOKIE_PERIODO = "periodo";

/** Valor de la cookie: "2026-08" o "2026-ALL". */
export function periodoACookie(p: Periodo): string {
  return `${p.anio}-${p.mes === null ? "ALL" : String(p.mes).padStart(2, "0")}`;
}

/** Lee la cookie; lo que no se entienda cae a `porDefecto`. */
export function periodoDeCookie(valor: string | undefined, porDefecto: Periodo): Periodo {
  if (!valor) return porDefecto;
  const [a, m] = valor.split("-");
  const anio = Number(a);
  if (!anio) return porDefecto;
  if (m === "ALL") return { anio, mes: null };
  const mes = Number(m);
  return { anio, mes: mes >= 1 && mes <= 12 ? mes : porDefecto.mes };
}

// Rango de fechas inclusivo [desde, hasta] en formato YYYY-MM-DD.
export function rangoPeriodo(p: Periodo): { desde: string; hasta: string } {
  if (p.mes === null) {
    return { desde: `${p.anio}-01-01`, hasta: `${p.anio}-12-31` };
  }
  const mm = String(p.mes).padStart(2, "0");
  const ultimo = new Date(p.anio, p.mes, 0).getDate();
  return {
    desde: `${p.anio}-${mm}-01`,
    hasta: `${p.anio}-${mm}-${String(ultimo).padStart(2, "0")}`,
  };
}

// ¿La fecha cae dentro del periodo? (para filtrar en memoria)
export function enRango(fecha: string | null | undefined, p: Periodo): boolean {
  if (!fecha) return false;
  const f = fecha.slice(0, 10);
  const { desde, hasta } = rangoPeriodo(p);
  return f >= desde && f <= hasta;
}

export function etiquetaPeriodo(p: Periodo): string {
  return p.mes === null ? `Año ${p.anio}` : `${MESES[p.mes - 1]} ${p.anio}`;
}
