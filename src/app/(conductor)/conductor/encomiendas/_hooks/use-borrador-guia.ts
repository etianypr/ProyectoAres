"use client";

// «Cargar la guía» sobrevive a cerrar la app (dueño, 2026-11-13): lo leído de la
// guía se guarda en el teléfono (store `borradoresGuia`) mientras no se crean los
// pedidos, y al volver se recupera en el mismo paso. Leer las fotos otra vez
// gastaba la IA y Cloud Vision. Las fotos sin leer no se guardan.
//
// Se guarda poco después de cada cambio; se borra al empezar a crear los pedidos,
// al descartar lo leído y cuando ya no queda nada.
//
// Spec 034 (dueño, 2026-11-15): con el borrador va el barrido de la nómina en curso
// (sus votos), para seguir la misma lectura; al bloquearse el celular se guarda al
// tiro (`guardarYa`), sin esperar.

import { useEffect, useRef, useState } from "react";
import type { BarridoGuardado } from "@/lib/encomiendas/lectura/barrido-a-guia";
import {
  borrarBorradorGuia,
  guardarBorradorGuia,
  leerBorradorGuia,
  type BorradorGuia,
} from "@/lib/encomiendas/local/almacen";

/** Espera tras el último cambio: escribir la guía en cada tecla no hace falta. */
const ESPERA_MS = 400;

type Estado = Omit<BorradorGuia, "fecha" | "barrido">;

export function useBorradorGuia({
  fecha,
  estado,
  barrido,
  creando,
  onRecuperado,
}: {
  fecha: string;
  /** Lo que se ve ahora en la ventana. */
  estado: Estado;
  /** El barrido de la nómina en curso, o null. */
  barrido: BarridoGuardado | null;
  /** Ya se apretó «Crear pedidos»: lo leído pasa a ser pedidos y el borrador sobra. */
  creando: boolean;
  onRecuperado: (b: BorradorGuia) => void;
}) {
  // Hasta leer lo guardado no se escribe: si no, la ventana vacía lo pisaría.
  const [leido, setLeido] = useState(false);
  const recuperar = useRef(onRecuperado);
  const ahora = useRef({ estado, barrido });
  useEffect(() => {
    recuperar.current = onRecuperado;
    ahora.current = { estado, barrido };
  });

  useEffect(() => {
    let vigente = true;
    leerBorradorGuia(fecha)
      .then((b) => {
        if (vigente && b && (b.lineas.length > 0 || b.texto.trim() !== "" || b.barrido)) recuperar.current(b);
      })
      .catch(() => null)
      .finally(() => vigente && setLeido(true));
    return () => {
      vigente = false;
    };
  }, [fecha]);

  const vacio = estado.lineas.length === 0 && estado.texto.trim() === "" && !barrido;
  // Los votos no se comparan enteros: cambian cuando hay cuadros nuevos o se entregan líneas.
  const sello = barrido ? `${barrido.porFilas.cuadros}:${Object.keys(barrido.entregadas).length}` : "";
  const firma = `${JSON.stringify(estado)}|${sello}`;
  useEffect(() => {
    if (!leido) return;
    if (creando || vacio) {
      void borrarBorradorGuia(fecha).catch(() => null);
      return;
    }
    const t = setTimeout(() => {
      const { estado: e, barrido: b } = ahora.current;
      // Sin poder guardar, la ventana sigue igual: solo se pierde al cerrar la app.
      void guardarBorradorGuia({ fecha, ...e, ...(b ? { barrido: b } : {}) }).catch(() => null);
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [leido, creando, vacio, firma, fecha]);

  return {
    /** «Descartar» lo leído al cerrar la ventana. */
    descartar: () => borrarBorradorGuia(fecha).catch(() => null),
    /** El celular se bloquea a mitad del barrido: se escribe ya, con estos votos. */
    guardarYa: (b: BarridoGuardado) => {
      if (!leido || creando) return;
      void guardarBorradorGuia({ fecha, ...ahora.current.estado, barrido: b }).catch(() => null);
    },
  };
}
