import { cookies } from "next/headers";
import { hoyChile } from "@/lib/format";

// Periodo global de la app. mes: 1-12, o null = año completo.
export type Periodo = { anio: number; mes: number | null };

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

// Lee el periodo desde la cookie (server-side). Por defecto, el mes actual
// EN CHILE (el servidor corre en UTC: de noche ya sería el mes siguiente).
export async function getPeriodo(): Promise<Periodo> {
  const raw = (await cookies()).get("periodo")?.value;
  const [hAnio, hMes] = hoyChile().split("-").map(Number);
  const fallback: Periodo = { anio: hAnio, mes: hMes };
  if (!raw) return fallback;
  const [a, m] = raw.split("-");
  const anio = Number(a);
  if (!anio) return fallback;
  if (m === "ALL") return { anio, mes: null };
  const mes = Number(m);
  return { anio, mes: mes >= 1 && mes <= 12 ? mes : fallback.mes };
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

// Periodo inmediatamente anterior (mes anterior, o año anterior en vista anual).
export function periodoAnterior(p: Periodo): Periodo {
  if (p.mes === null) return { anio: p.anio - 1, mes: null };
  if (p.mes === 1) return { anio: p.anio - 1, mes: 12 };
  return { anio: p.anio, mes: p.mes - 1 };
}

// Etiqueta corta para comparaciones: "mayo" o "2025".
export function etiquetaCorta(p: Periodo): string {
  return p.mes === null ? String(p.anio) : MESES[p.mes - 1];
}
