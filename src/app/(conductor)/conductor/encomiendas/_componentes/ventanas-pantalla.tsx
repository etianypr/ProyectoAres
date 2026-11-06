"use client";

// Las ventanas que se abren ENCIMA de la pantalla del conductor —el menú, cargar la
// guía, el escáner, buscar por OF y el cierre del día— y su estado (sale de
// pantalla.tsx, spec 002 T037). La de "ahora carga el auto" se fue con la spec
// 027: lo pide la cabecera de la hoja.

import { useState } from "react";
import { logout } from "@/lib/auth/acciones";
import { avanceCarga, leerDias, type Pedido, type ResumenDia } from "@/lib/encomiendas/local/almacen";
import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import { problemasDelPedido } from "@/lib/encomiendas/problemas";
import type { DiaEnCurso } from "../_hooks/use-dia-trabajo";
import type { useCierreDia } from "../_hooks/use-cierre-dia";
import { Ayuda } from "./ayuda";
import { BuscarOf } from "./buscar-of";
import { CargarGuia } from "./cargar-guia";
import { CierreDia } from "./cierre-dia";
import { EscanearEtiqueta } from "./escanear-etiqueta";
import { GenerarRutaLocal } from "./generar-ruta-local";
import { MenuLateral } from "./menu-lateral";

export function useVentanas() {
  // El cajón de la izquierda y los días que muestra. Los días se leen al abrir,
  // no al montar: es una consulta al teléfono que no hace falta para repartir, y
  // así la lista está fresca aunque el día se haya cerrado con el menú ya usado.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [dias, setDias] = useState<ResumenDia[]>([]);
  const [buscandoOf, setBuscandoOf] = useState(false);
  // Spec 005: cargar el día desde la guía y escanear cada etiqueta.
  const [cargandoGuia, setCargandoGuia] = useState(false);
  /** La carga de la guía está ubicando direcciones: no se puede cerrar. */
  const [guiaOcupada, setGuiaOcupada] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  /** Cómo se usa la app (ver ayuda.tsx). */
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  return {
    menuAbierto,
    setMenuAbierto,
    dias,
    abrirMenu: () => {
      setMenuAbierto(true);
      void leerDias().then(setDias);
    },
    buscandoOf,
    setBuscandoOf,
    cargandoGuia,
    setCargandoGuia,
    guiaOcupada,
    setGuiaOcupada,
    escaneando,
    setEscaneando,
    ayudaAbierta,
    setAyudaAbierta,
  };
}

export type Ventanas = ReturnType<typeof useVentanas>;

export function VentanasPantalla({
  ventanas: v,
  fecha,
  lecturaIA,
  nombreConductor,
  dia,
  cierreDia,
  onNuevoConOf,
  direccionEmpresa,
  onPropuesta,
  onResolver,
}: {
  ventanas: Ventanas;
  fecha: string;
  lecturaIA: boolean;
  nombreConductor: string;
  dia: DiaEnCurso;
  cierreDia: ReturnType<typeof useCierreDia>;
  /** El escáner leyó una OF que no está en el día: abrir un pedido nuevo con ella. */
  onNuevoConOf: (of: string) => void;
  /** Para armar la ruta al terminar de cargar la guía (spec 027). */
  direccionEmpresa: string | null;
  onPropuesta: (propuesta: PropuestaRuta) => void;
  /** Abre de a uno los pedidos con ⚠ (useResolverProblemas). */
  onResolver: (conProblema: Pedido[]) => void;
}) {
  const conProblema = dia.pedidos.filter((p) => p.resultado === "pendiente" && problemasDelPedido(p).length > 0);
  return (
    <>
      {v.menuAbierto ? (
        <MenuLateral
          nombreConductor={nombreConductor}
          dias={v.dias}
          fechaActiva={fecha}
          onCerrar={() => v.setMenuAbierto(false)}
          logout={logout}
          onBuscarOf={() => {
            v.setMenuAbierto(false);
            v.setBuscandoOf(true);
          }}
          onAyuda={() => {
            v.setMenuAbierto(false);
            v.setAyudaAbierta(true);
          }}
        />
      ) : null}

      {v.cargandoGuia ? (
        <CargarGuia
          fecha={fecha}
          lecturaIA={lecturaIA}
          hayRuta={dia.ruta != null}
          onOcupado={v.setGuiaOcupada}
          onEscanearPaquetes={() => {
            v.setCargandoGuia(false);
            v.setEscaneando(true);
          }}
          onCerrar={() => v.setCargandoGuia(false)}
          onCreados={() => void dia.recargar()}
          onAyuda={() => v.setAyudaAbierta(true)}
          conProblema={conProblema.length}
          onResolver={() => {
            v.setCargandoGuia(false);
            onResolver(conProblema);
          }}
          armar={(enlace) => (
            <GenerarRutaLocal
              fecha={fecha}
              direccionEmpresa={direccionEmpresa}
              enlace={enlace}
              onPropuesta={(p) => {
                v.setCargandoGuia(false);
                onPropuesta(p);
              }}
            />
          )}
        />
      ) : null}

      {v.escaneando ? (
        <EscanearEtiqueta
          fecha={fecha}
          lecturaIA={lecturaIA}
          avance={avanceCarga(dia.pedidos)}
          onCerrar={() => v.setEscaneando(false)}
          onCambio={() => void dia.recargar()}
          onAgregarPedido={(of) => {
            v.setEscaneando(false);
            onNuevoConOf(of);
          }}
        />
      ) : null}

      {v.buscandoOf ? (
        <BuscarOf
          pedidos={dia.pedidos}
          secuenciaDe={new Map(dia.paradas.map((p) => [p.pedido.id, p.secuencia] as const))}
          onCerrar={() => v.setBuscandoOf(false)}
        />
      ) : null}

      {v.ayudaAbierta ? <Ayuda onCerrar={() => v.setAyudaAbierta(false)} /> : null}

      {cierreDia.pendiente ? (
        <CierreDia
          cierre={cierreDia.pendiente}
          borrando={cierreDia.borrando}
          error={cierreDia.error}
          onConfirmar={() => void cierreDia.confirmar()}
          onAplazar={cierreDia.aplazar}
        />
      ) : null}
    </>
  );
}
