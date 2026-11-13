"use client";

// Las ventanas que se abren ENCIMA de la pantalla del conductor —el menú, cargar la
// guía, el escáner, buscar por OF y el cierre del día— y su estado (sale de
// pantalla.tsx, spec 002 T037). La de "ahora carga el auto" se fue con la spec
// 027: lo pide la cabecera de la hoja.

import { useState } from "react";
import { avanceCarga, fechasConDatos, leerCola, leerDias, type Pedido, type ResumenDia } from "@/lib/encomiendas/local/almacen";
import { sinEnviarPorFecha } from "@/lib/encomiendas/local/dias-del-menu";
import type { PropuestaRuta } from "@/lib/encomiendas/local/generar-ruta";
import { problemasDelPedido } from "@/lib/encomiendas/problemas";
import { fueraDeLaRuta } from "@/lib/encomiendas/local/sumar-a-ruta";
import { usarEscanerVivo } from "@/lib/nativo/escaner-vivo";
import type { DiaEnCurso, Parada } from "../_hooks/use-dia-trabajo";
import type { useCierreDia } from "../_hooks/use-cierre-dia";
import { Ayuda } from "./ayuda";
import type { PaqueteEsperado } from "./aviso-otra-parada";
import { BuscarOf } from "./buscar-of";
import { CargarGuia } from "./cargar-guia";
import { CierreDia } from "./cierre-dia";
import { EscanearEtiqueta } from "./escanear-etiqueta";
import { EscanerVivo } from "./escaner-vivo";
import { GenerarRutaLocal } from "./generar-ruta-local";
import { MenuLateral } from "./menu-lateral";

export function useVentanas() {
  // El cajón de la izquierda y los días que muestra. Los días se leen al abrir,
  // no al montar: es una consulta al teléfono que no hace falta para repartir, y
  // así la lista está fresca aunque el día se haya cerrado con el menú ya usado.
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [dias, setDias] = useState<ResumenDia[]>([]);
  /** Fechas con pedidos o ruta en el teléfono, y la cola por fecha (spec 033, dia-sin-cerrar). */
  const [conDatos, setConDatos] = useState<Set<string>>(new Set());
  const [sinEnviar, setSinEnviar] = useState<Map<string, number>>(new Map());
  const leerMenu = () => {
    void leerDias().then(setDias, () => {});
    void fechasConDatos().then(setConDatos, () => {});
    void leerCola().then((cola) => setSinEnviar(sinEnviarPorFecha(cola)), () => {});
  };
  const [buscandoOf, setBuscandoOf] = useState(false);
  // Spec 005: cargar el día desde la guía y escanear cada etiqueta.
  const [cargandoGuia, setCargandoGuia] = useState(false);
  /** La carga de la guía está ubicando direcciones: no se puede cerrar. */
  const [guiaOcupada, setGuiaOcupada] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  /** Escaneando desde la parada: el paquete que se espera (spec 033, escanear-parada). */
  const [esperado, setEsperado] = useState<PaqueteEsperado | null>(null);
  /** Sin cámara (permiso negado): el escáner de siempre hasta cerrar (spec 028). */
  const [escanerClasico, setEscanerClasico] = useState(false);
  /** Cómo se usa la app (ver ayuda.tsx). */
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  return {
    menuAbierto,
    setMenuAbierto,
    dias,
    conDatos,
    sinEnviar,
    releerMenu: leerMenu,
    abrirMenu: () => {
      setMenuAbierto(true);
      leerMenu();
    },
    buscandoOf,
    setBuscandoOf,
    cargandoGuia,
    setCargandoGuia,
    guiaOcupada,
    setGuiaOcupada,
    escaneando,
    setEscaneando: (abierto: boolean) => {
      setEsperado(null);
      setEscaneando(abierto);
    },
    esperado,
    escanearParada: (p: Parada) => {
      setEsperado({ pedidoId: p.pedido.id, secuencia: p.secuencia, of: p.pedido.of });
      setEscaneando(true);
    },
    escanerClasico,
    setEscanerClasico,
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
  onSumar,
  onEditar,
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
  /** Suma a la ruta los pedidos de afuera con punto (spec 033, otra-guia-ruta). */
  onSumar: () => Promise<void>;
  /** Abre el formulario de un pedido (spec 033: la fila de «Buscar por OF» y
   *  «Corregir» en el resumen de la guía). */
  onEditar: (pedido: Pedido) => void;
}) {
  const conProblema = dia.pedidos.filter((p) => p.resultado === "pendiente" && problemasDelPedido(p).length > 0);
  return (
    <>
      {v.menuAbierto ? (
        <MenuLateral
          nombreConductor={nombreConductor}
          dias={v.dias}
          conDatos={v.conDatos}
          sinEnviar={v.sinEnviar}
          onReintentar={dia.intentar}
          enviando={dia.enviando}
          onReleer={v.releerMenu}
          fechaActiva={fecha}
          onCerrar={() => v.setMenuAbierto(false)}
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
          fueraDeRuta={dia.ruta ? fueraDeLaRuta(dia.pedidos, dia.ruta.orden).length : 0}
          onSumar={onSumar}
          onOcupado={v.setGuiaOcupada}
          onEscanearPaquetes={() => {
            v.setCargandoGuia(false);
            v.setEscaneando(true);
          }}
          onCerrar={() => v.setCargandoGuia(false)}
          onCreados={() => void dia.recargar()}
          onAyuda={() => v.setAyudaAbierta(true)}
          onCorregir={(id) => {
            // El formulario va en la hoja, debajo de esta ventana: se cierra primero.
            const pedido = dia.pedidos.find((p) => p.id === id);
            if (!pedido) return;
            v.setCargandoGuia(false);
            onEditar(pedido);
          }}
          armar={() => (
            <GenerarRutaLocal
              fecha={fecha}
              direccionEmpresa={direccionEmpresa}
              conProblema={conProblema.length}
              sinDesde
              onResolver={() => {
                v.setCargandoGuia(false);
                onResolver(conProblema);
              }}
              onPropuesta={(p) => {
                v.setCargandoGuia(false);
                onPropuesta(p);
              }}
            />
          )}
        />
      ) : null}

      {/* Spec 028: la cámara de ARES en vivo si la APK la trae, salvo que el
          conductor haya elegido el escáner de Google en Diagnóstico; sin permiso
          de cámara, también el de Google (lib/nativo/escaner-vivo.ts). */}
      {v.escaneando && usarEscanerVivo() && !v.escanerClasico ? (
        <EscanerVivo
          fecha={fecha}
          esperado={v.esperado}
          avance={avanceCarga(dia.pedidos)}
          onCerrar={() => v.setEscaneando(false)}
          onCambio={() => void dia.recargar()}
          onAgregarPedido={(of) => {
            v.setEscaneando(false);
            onNuevoConOf(of);
          }}
          onClasico={() => v.setEscanerClasico(true)}
        />
      ) : null}
      {v.escaneando && (!usarEscanerVivo() || v.escanerClasico) ? (
        <EscanearEtiqueta
          fecha={fecha}
          esperado={v.esperado}
          avance={avanceCarga(dia.pedidos)}
          onCerrar={() => {
            v.setEscaneando(false);
            v.setEscanerClasico(false);
          }}
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
          onAbrir={(p) => {
            v.setBuscandoOf(false);
            onEditar(p);
          }}
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
