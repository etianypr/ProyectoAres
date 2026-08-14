import type { Chofer } from "@/types/db";
import { hoyChile } from "@/lib/format";

// Vencimientos que se vigilan. Acá solo está la licencia del conductor: los
// documentos del vehículo (revisión técnica, SOAP, permiso de circulación) los
// vigilaba el sistema del que salió este proyecto, que administraba la flota.
// Este no la administra. Si algún día las camionetas de reparto pasan a ser de
// la empresa, este archivo es donde se agregan.

export type VencEstado = "vencido" | "por_vencer" | "ok";

const DIAS_AVISO = 30;

// Evalúa una fecha de vencimiento respecto a hoy.
export function evaluarVenc(
  fecha: string | null | undefined,
  diasAviso = DIAS_AVISO,
): { estado: VencEstado; dias: number } | null {
  if (!fecha) return null;
  // Anclado al día de Chile (el servidor corre en UTC).
  const hoy = new Date(`${hoyChile()}T00:00:00`);
  const d = new Date(fecha.length === 10 ? `${fecha}T00:00:00` : fecha);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((d.getTime() - hoy.getTime()) / 86400000);
  if (dias < 0) return { estado: "vencido", dias };
  if (dias <= diasAviso) return { estado: "por_vencer", dias };
  return { estado: "ok", dias };
}

export type Alerta = {
  tipo: "Conductor";
  refId: string;
  nombre: string; // nombre del conductor
  documento: string; // "Licencia de conducir"
  fecha: string;
  estado: VencEstado;
  dias: number;
};

// Construye la lista de alertas (solo vencidos o por vencer).
export function construirAlertas(
  choferes: Chofer[],
  diasAviso = DIAS_AVISO,
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const c of choferes) {
    const ev = evaluarVenc(c.licencia_vencimiento, diasAviso);
    if (ev && ev.estado !== "ok") {
      alertas.push({
        tipo: "Conductor",
        refId: c.id,
        nombre: c.nombre,
        documento: "Licencia de conducir",
        fecha: c.licencia_vencimiento as string,
        estado: ev.estado,
        dias: ev.dias,
      });
    }
  }

  // Ordenar: primero los vencidos, luego por días restantes (más urgente primero).
  return alertas.sort((a, b) => a.dias - b.dias);
}
