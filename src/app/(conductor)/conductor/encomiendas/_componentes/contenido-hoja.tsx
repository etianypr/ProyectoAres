"use client";

// Lo de adentro de la hoja deslizable, lo que se mira parado: notas de la parada,
// cargar el auto, la ruta del día, lo dudoso, los pedidos fuera de la ruta,
// rehacer la ruta y "Tu día" (sale de pantalla.tsx, spec 002 T037).

import type { Pedido } from "@/lib/encomiendas/local/almacen";
import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import type { DiaEnCurso } from "../_hooks/use-dia-trabajo";
import { AdvertenciasRuta } from "./advertencias-ruta";
import { GenerarRutaLocal } from "./generar-ruta-local";
import { PedidosFueraDeRuta } from "./pedidos-fuera";
import { ProgresoCarga } from "./progreso-carga";
import { RutaDelDia } from "./ruta-del-dia";
import { Seccion } from "./seccion";
import { TuDia } from "./tu-dia";

export function ContenidoHoja({
  dia,
  fecha,
  direccionEmpresa,
  lecturaIA,
  guardando,
  metaBono,
  ayer,
  sinRutear,
  sinUbicar,
  entregadas,
  noEntregadas,
  porcentaje,
  onEscanear,
  onEliminar,
  onEditar,
  onSumar,
  onCargarGuia,
  onAgregar,
  onPropuesta,
}: {
  dia: DiaEnCurso;
  fecha: string;
  direccionEmpresa: string | null;
  lecturaIA: boolean;
  guardando: boolean;
  metaBono: number | null;
  ayer: { entregadas: number; noEntregadas: number } | null;
  /** Pedidos pendientes fuera de la ruta, y cuántos de ellos sin punto. */
  sinRutear: Pedido[];
  sinUbicar: number;
  /** Cifras de la ruta del día. */
  entregadas: number;
  noEntregadas: number;
  porcentaje: number;
  onEscanear: () => void;
  onEliminar: (pedidoId: string) => void;
  onEditar: (pedido: Pedido) => void;
  onSumar: () => Promise<void>;
  onCargarGuia: () => void;
  onAgregar: () => void;
  onPropuesta: (propuesta: PropuestaRuta) => void;
}) {
  const { paradas, activa, pedidos } = dia;
  const hayRuta = paradas.length > 0;
  return (
    <>
      {hayRuta ? (
        <>
          {activa?.pedido.notas ? (
            <div className="mb-4 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">{activa.pedido.notas}</div>
          ) : null}

          <ProgresoCarga pedidos={pedidos} onEscanear={onEscanear} />
          <RutaDelDia
            paradas={paradas}
            activaId={activa?.pedido.id ?? null}
            entregadas={entregadas}
            porcentaje={porcentaje}
            metaBono={metaBono}
            entregadasDelDia={pedidos.filter((p) => p.resultado === "entregado").length}
            onEliminar={onEliminar}
            onEditar={onEditar}
          />
        </>
      ) : null}

      <AdvertenciasRuta advertencias={dia.ruta?.advertencias ?? []} />

      {/* Los pedidos que no entraron en la ruta se muestran acá mismo, no detrás
          de un botón: verlos ES la explicación de qué hay que hacer con ellos
          —tocarlos para arreglar la dirección, o sumarlos a la ruta—. */}
      <PedidosFueraDeRuta
        fecha={fecha}
        sinRutear={sinRutear}
        sinUbicar={sinUbicar}
        hayRuta={hayRuta}
        lecturaIA={lecturaIA}
        guardando={guardando}
        onEditar={onEditar}
        onEliminar={onEliminar}
        onRecargar={() => void dia.recargar()}
        onSumar={onSumar}
        onCargarGuia={onCargarGuia}
        onAgregar={onAgregar}
      />

      {/* Con la ruta ya armada, rehacerla vive acá abajo y no en la cabecera:
          arriba manda la parada que toca. Sin ruta, el botón está en la
          cabecera y no se repite acá. */}
      {hayRuta ? (
        <Seccion titulo="Rehacer la ruta">
          <GenerarRutaLocal fecha={fecha} direccionEmpresa={direccionEmpresa} regenerar onPropuesta={onPropuesta} />
        </Seccion>
      ) : null}

      <TuDia
        motivoNoCerrar={
          dia.motivoNoCerrar && paradas.length > 0 && noEntregadas + entregadas === paradas.length
            ? dia.motivoNoCerrar
            : null
        }
        ayer={ayer}
        sinEnviar={dia.sinEnviar}
        errorEnvio={dia.errorEnvio}
        enviando={dia.enviando}
        onReintentar={dia.intentar}
        rechazados={dia.rechazados}
      />
    </>
  );
}
