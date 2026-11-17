"use client";

// Las líneas leídas de la guía antes de crear los pedidos (sale de
// cargar-guia.tsx, spec 033): lo leído (fotos, barrido o texto pegado) se SUMA a
// lo que ya hay y las repetidas se juntan por OF; quitar una línea se puede
// deshacer, y los avisos se vuelven a calcular.

import { useState } from "react";
import { armarGuia, type LineaGuia } from "@/lib/encomiendas/lectura/guia";
import { conPorConfirmar, enOrdenDeLaNomina } from "@/lib/encomiendas/lectura/barrido-nomina";
import { conTelefonos } from "@/lib/encomiendas/lectura/telefono-linea";

export function useLineasGuia() {
  const [lineas, setLineas] = useState<LineaGuia[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [folio, setFolio] = useState<string | null>(null);
  /** MONTO NETO de la guía (= cantidad de paquetes), de la foto que lo traiga. */
  const [total, setTotal] = useState<number | null>(null);
  /** La última línea quitada, para «Deshacer». */
  const [quitada, setQuitada] = useState<{ linea: LineaGuia; i: number } | null>(null);

  /** Suma lo leído; el MONTO NETO se conserva aunque venga en una foto anterior
   *  (spec 017, E11). Lo que no quedó firme en el barrido llega por confirmar, y con
   *  `ordenNomina` las líneas del barrido quedan en el orden de la hoja. */
  function sumar(
    nuevas: { of: string; destino: string; bultos?: number }[],
    folioNuevo: string | null,
    totalNuevo: number | null,
    porConfirmarNuevas?: Set<string>,
    ordenNomina?: string[],
  ) {
    const totalGuia = totalNuevo ?? total;
    const unida = armarGuia([...lineas, ...nuevas], folio ?? folioNuevo, totalGuia);
    // Los teléfonos anotados se conservan al sumar otra foto.
    const juntas = conTelefonos(conPorConfirmar(unida.lineas, lineas, nuevas, porConfirmarNuevas), lineas);
    setLineas(ordenNomina ? enOrdenDeLaNomina(juntas, ordenNomina) : juntas);
    setAvisos(unida.avisos);
    setFolio(unida.folio);
    setTotal(totalGuia);
    setQuitada(null);
  }

  /** Saca las líneas por confirmar de estas OF: el barrido las entregó y después resultaron
   *  ser una mala lectura de otra (spec 034). Una ya confirmada o corregida no se toca. */
  function quitarOfs(ofs: string[]) {
    if (ofs.length === 0) return;
    setLineas((ls) => ls.filter((l) => !(l.porConfirmar && ofs.includes(l.of))));
  }

  function cambiar(i: number, cambio: Partial<LineaGuia>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  function agregar() {
    setLineas((ls) => [...ls, { of: "", destino: "", dudosa: true }]);
  }

  /** Quita una línea al tiro, con «Deshacer». */
  function quitar(i: number) {
    const restantes = lineas.filter((_, j) => j !== i);
    setQuitada({ linea: lineas[i], i });
    setLineas(restantes);
    setAvisos(armarGuia(restantes, folio, total).avisos);
  }

  function deshacerQuitar() {
    if (!quitada) return;
    const vuelta = [...lineas];
    vuelta.splice(Math.min(quitada.i, vuelta.length), 0, quitada.linea);
    setLineas(vuelta);
    setAvisos(armarGuia(vuelta, folio, total).avisos);
    setQuitada(null);
  }

  /** Vuelve a lo guardado en el borrador (use-borrador-guia.ts). */
  function restaurar(b: { lineas: LineaGuia[]; avisos: string[]; folio: string | null; total: number | null }) {
    setLineas(b.lineas);
    setAvisos(b.avisos);
    setFolio(b.folio);
    setTotal(b.total);
    setQuitada(null);
  }

  return {
    lineas,
    avisos,
    folio,
    total,
    restaurar,
    hayQuitada: quitada != null,
    sumar,
    quitarOfs,
    cambiar,
    agregar,
    quitar,
    deshacerQuitar,
    olvidarQuitada: () => setQuitada(null),
  };
}
