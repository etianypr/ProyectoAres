"use client";

// La cabecera de la hoja según el paso del día (spec 027): lo único que se ve con
// la hoja cerrada. Recorriendo es la parada activa con sus botones (spec 020).

import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import type { Paso } from "../_hooks/paso-del-dia";
import type { CargaAuto } from "../_hooks/use-carga-auto";
import { CabeceraCarga } from "./cabecera-carga";
import { CabeceraCierre } from "./cabecera-cierre";
import { CabeceraSinParada } from "./cabecera-sin-parada";
import { GenerarRutaLocal } from "./generar-ruta-local";
import { ParadaActiva } from "./parada-activa";

export function CabeceraHoja({
  paso,
  parada,
  carga,
  guardando,
  cargando,
  cifras: { pendientes, conProblema, entregadas, noEntregadas },
  diaCerrado,
  nombreConductor,
  fecha,
  direccionEmpresa,
  onCargarGuia,
  onAgregar,
  onResolver,
  onPropuesta,
  onEscanear,
  onSalir,
  onCerrarDia,
}: {
  paso: Paso;
  /** La parada activa y sus acciones, o null sin parada. */
  parada: React.ComponentProps<typeof ParadaActiva> | null;
  carga: CargaAuto;
  guardando: boolean;
  /** Se está cargando un pedido nuevo, sin ruta: la cabecera es el contador. */
  cargando: boolean;
  /** Pendientes sin ruta y cuántos con ⚠; cómo terminó la ruta. */
  cifras: { pendientes: number; conProblema: number; entregadas: number; noEntregadas: number };
  diaCerrado: boolean;
  nombreConductor: string;
  fecha: string;
  direccionEmpresa: string | null;
  onCargarGuia: () => void;
  onAgregar: () => void;
  onResolver: () => void;
  onPropuesta: (propuesta: PropuestaRuta) => void;
  onEscanear: () => void;
  onSalir: () => void;
  onCerrarDia: () => void;
}) {
  if (paso === "reparto" && parada) return <ParadaActiva {...parada} />;
  if (paso === "carga") return <CabeceraCarga carga={carga} guardando={guardando} onEscanear={onEscanear} onSalir={onSalir} />;
  if (paso === "cierre") {
    return (
      <CabeceraCierre entregadas={entregadas} noEntregadas={noEntregadas} diaCerrado={diaCerrado} onCerrarDia={onCerrarDia} />
    );
  }
  const armar = (enlace?: string) => (
    <GenerarRutaLocal fecha={fecha} direccionEmpresa={direccionEmpresa} enlace={enlace} onPropuesta={onPropuesta} />
  );
  return (
    <CabeceraSinParada
      paso={paso === "guia" || paso === "resolver" ? paso : "ruta"}
      cargando={cargando}
      pendientes={pendientes}
      conProblema={conProblema}
      nombreConductor={nombreConductor}
      fecha={fecha}
      onCargarGuia={onCargarGuia}
      onAgregar={onAgregar}
      onResolver={onResolver}
      armarRuta={armar()}
      armarIgual={armar("Armar la ruta igual")}
    />
  );
}
