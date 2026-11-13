"use client";

// Lo de adentro de la hoja deslizable, lo que se mira parado (sale de
// pantalla.tsx, spec 002 T037). Desde la spec 027 va solo lo del paso del día
// que toca, con los ⚠ primero: la cabecera ya dice el paso y su botón.

import { AlertTriangle, ScanLine } from "lucide-react";
import { volverACargar, type Pedido } from "@/lib/encomiendas/local/almacen";
import { resultadoCerrado } from "@/lib/encomiendas/estados";
import type { ResultadoVisita } from "@/lib/encomiendas/estados";
import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import { problemasDelPedido } from "@/lib/encomiendas/problemas";
import type { DiaEnCurso } from "../_hooks/use-dia-trabajo";
import type { Paso } from "../_hooks/paso-del-dia";
import type { FaltaEscanear } from "../_hooks/use-carga-auto";
import { AdvertenciasRuta } from "./advertencias-ruta";
import { AyerHoja } from "./ayer-hoja";
import { EnlacesHoja } from "./enlaces-hoja";
import { FaltanEscanear } from "./faltan-escanear";
import { GenerarRutaLocal } from "./generar-ruta-local";
import { ListaNoEntregados } from "./lista-no-entregados";
import { PedidosFueraDeRuta } from "./pedidos-fuera";
import { Plegable } from "./plegable";
import { PorResolver } from "./por-resolver";
import { RutaDelDia } from "./ruta-del-dia";
import { Seccion } from "./seccion";
import { TuDia } from "./tu-dia";

export function ContenidoHoja({
  paso,
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
  faltan,
  onEliminar,
  onEditar,
  onCambiar,
  onSumar,
  onCargarGuia,
  onAgregar,
  onPropuesta,
  onResolver,
}: {
  paso: Paso;
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
  /** Paquetes de la guía sin escanear (use-carga-auto.ts). */
  faltan: FaltaEscanear[];
  onEliminar: (pedidoId: string) => void;
  onEditar: (pedido: Pedido) => void;
  /** Pasar una parada cerrada a otro estado (spec 033, G5). */
  onCambiar: (pedidoId: string, nuevo: ResultadoVisita) => void;
  onSumar: () => Promise<void>;
  onCargarGuia: () => void;
  onAgregar: () => void;
  onPropuesta: (propuesta: PropuestaRuta) => void;
  /** Abre de a uno los pedidos pendientes con ⚠. */
  onResolver: () => void;
}) {
  const { paradas, activa, pedidos } = dia;

  // Con la ruta armada igual, los ⚠ se siguen resolviendo desde acá (spec 027).
  const conProblema = pedidos.filter((p) => p.resultado === "pendiente" && problemasDelPedido(p).length > 0).length;
  const porResolver =
    conProblema > 0 ? (
      <Seccion titulo={`Por resolver · ${conProblema}`}>
        <button
          type="button"
          onClick={onResolver}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-warn-bg py-3.5 text-sm font-semibold text-warn"
        >
          <AlertTriangle className="h-4 w-4" />
          {conProblema === 1 ? "Resolver el ⚠" : `Resolver los ${conProblema} ⚠`}
        </button>
      </Seccion>
    ) : null;

  const tuDia = (
    <TuDia
      motivoNoCerrar={
        dia.motivoNoCerrar && paradas.length > 0 && noEntregadas + entregadas === paradas.length
          ? dia.motivoNoCerrar
          : null
      }
      sinEnviar={dia.sinEnviar}
      errorEnvio={dia.errorEnvio}
      enviando={dia.enviando}
      onReintentar={dia.intentar}
      rechazados={dia.rechazados}
      correccionesRechazadas={dia.correccionesRechazadas}
    />
  );

  // Los pedidos que no entraron en la ruta se muestran acá mismo, no detrás de
  // un botón: verlos ES la explicación de qué hay que hacer con ellos —tocarlos
  // para arreglar la dirección, o sumarlos a la ruta—. Sin ninguno, no hay sección.
  const fuera = (titulo: string) => (
    <PedidosFueraDeRuta
      titulo={titulo}
      fecha={fecha}
      pedidos={sinRutear}
      sinUbicar={sinUbicar}
      hayRuta={paradas.length > 0}
      lecturaIA={lecturaIA}
      guardando={guardando}
      onEditar={onEditar}
      onEliminar={onEliminar}
      onRecargar={() => void dia.recargar()}
      onSumar={onSumar}
    />
  );

  const enlaces = (conRehacer: boolean) => (
    <EnlacesHoja
      onAgregar={onAgregar}
      onCargarGuia={onCargarGuia}
      rehacer={
        conRehacer ? (
          <GenerarRutaLocal fecha={fecha} direccionEmpresa={direccionEmpresa} regenerar onPropuesta={onPropuesta} />
        ) : undefined
      }
    />
  );

  const ruta = (soloLista = false) => (
    <RutaDelDia
      paradas={paradas}
      activaId={activa?.pedido.id ?? null}
      entregadas={entregadas}
      porcentaje={porcentaje}
      metaBono={metaBono}
      entregadasDelDia={pedidos.filter((p) => p.resultado === "entregado").length}
      onEliminar={onEliminar}
      onEditar={onEditar}
      onCambiar={onCambiar}
      soloLista={soloLista}
    />
  );

  if (paso === "guia") {
    return (
      <>
        {ayer ? <AyerHoja ayer={ayer} /> : <p className="px-1 text-xs text-muted">Sin pedidos para hoy.</p>}
        {tuDia}
      </>
    );
  }

  if (paso === "resolver") {
    const conProblema = sinRutear.filter((p) => problemasDelPedido(p).length > 0);
    return (
      <>
        <PorResolver
          fecha={fecha}
          conProblema={conProblema}
          listos={sinRutear.filter((p) => !conProblema.includes(p))}
          sinUbicar={sinUbicar}
          lecturaIA={lecturaIA}
          onEditar={onEditar}
          onEliminar={onEliminar}
          onRecargar={() => void dia.recargar()}
        />
        {enlaces(false)}
        {tuDia}
      </>
    );
  }

  if (paso === "ruta") {
    return (
      <>
        {fuera(`Pedidos · ${sinRutear.length}`)}
        {enlaces(false)}
        {tuDia}
      </>
    );
  }

  if (paso === "carga") {
    return (
      <>
        {porResolver}
        <Seccion titulo={`Faltan · ${faltan.length}`}>
          <FaltanEscanear faltan={faltan} onAbrir={onEditar} />
        </Seccion>
        <AdvertenciasRuta advertencias={dia.ruta?.advertencias ?? []} />
        {fuera("Pedidos fuera de la ruta")}
        {enlaces(true)}
        {tuDia}
      </>
    );
  }

  if (paso === "cierre") {
    const enRuta = paradas.map((p) => p.pedido);
    const ids = new Set(enRuta.map((p) => p.id));
    // Los que llegaron tarde con la ruta completa van arriba, para sumarlos
    // (spec 033, llega-tarde); no son «no entregados» mientras se puedan sumar.
    const tarde = new Set(sinRutear.map((p) => p.id));
    const noEntregados = [...enRuta, ...pedidos.filter((p) => !ids.has(p.id))].filter(
      (p) => p.resultado !== "entregado" && !tarde.has(p.id),
    );
    return (
      <>
        {fuera("Pedidos fuera de la ruta")}
        <Seccion titulo={`No entregados · ${noEntregados.length}`}>
          <ListaNoEntregados pedidos={noEntregados} />
        </Seccion>
        {tuDia}
        <Seccion titulo={`Ruta del día · ${paradas.length}`}>
          <Plegable
            resumen={`${entregadas} ${entregadas === 1 ? "entregado" : "entregados"} · ${noEntregadas} ${noEntregadas === 1 ? "no entregado" : "no entregados"}`}
          >
            {ruta(true)}
          </Plegable>
        </Seccion>
      </>
    );
  }

  // Recorriendo: la parada activa está en la cabecera (spec 020).
  return (
    <>
      {activa?.pedido.notas ? (
        <div className="mb-4 rounded-2xl bg-warn-bg px-3.5 py-3 text-sm text-warn">{activa.pedido.notas}</div>
      ) : null}
      {porResolver}
      {faltan.length > 0 ? (
        <Seccion titulo={`Sin escanear · ${faltan.length}`}>
          <Plegable
            resumen={faltan.length === 1 ? "1 paquete de la guía sin escanear" : `${faltan.length} paquetes de la guía sin escanear`}
          >
            <FaltanEscanear faltan={faltan} onAbrir={onEditar} />
          </Plegable>
          {/* Salió a repartir antes de tiempo (spec 033, salir-repartir): mientras
              no cierre ninguna parada, vuelve la cabecera de la carga. */}
          {dia.ruta?.inicioReparto && !pedidos.some((p) => resultadoCerrado(p.resultado)) ? (
            <button
              type="button"
              disabled={guardando}
              onClick={() => void volverACargar(fecha).then(() => dia.recargar())}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50"
            >
              <ScanLine className="h-4 w-4" />
              Volver a cargar
            </button>
          ) : null}
        </Seccion>
      ) : null}
      {ruta()}
      <AdvertenciasRuta advertencias={dia.ruta?.advertencias ?? []} />
      {fuera("Pedidos fuera de la ruta")}
      {enlaces(true)}
      {tuDia}
    </>
  );
}
