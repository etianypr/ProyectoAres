import "server-only";
import { cookies } from "next/headers";
import { hoyChile } from "./fechas";
import { COOKIE_PERIODO, periodoDeCookie, type Periodo } from "./periodo";

// Lee el periodo desde la cookie (server-side). Por defecto, el mes actual
// EN CHILE (el servidor corre en UTC: de noche ya sería el mes siguiente).
export async function getPeriodo(): Promise<Periodo> {
  const [anio, mes] = hoyChile().split("-").map(Number);
  return periodoDeCookie((await cookies()).get(COOKIE_PERIODO)?.value, { anio, mes });
}
