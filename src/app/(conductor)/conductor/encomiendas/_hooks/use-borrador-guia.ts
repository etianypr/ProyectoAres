"use client";

// «Cargar la guía» sobrevive a cerrar la app (dueño, 2026-11-13): lo leído de la
// guía se guarda en el teléfono (store `borradoresGuia`) mientras no se crean los
// pedidos, y al volver se recupera en el mismo paso. Leer las fotos otra vez
// gastaba la IA y Cloud Vision. Las fotos sin leer no se guardan.
//
// Se guarda poco después de cada cambio; se borra al empezar a crear los pedidos,
// al descartar lo leído y cuando ya no queda nada.

import { useEffect, useRef, useState } from "react";
import {
  borrarBorradorGuia,
  guardarBorradorGuia,
  leerBorradorGuia,
  type BorradorGuia,
} from "@/lib/encomiendas/local/almacen";

/** Espera tras el último cambio: escribir la guía en cada tecla no hace falta. */
const ESPERA_MS = 400;

type Estado = Omit<BorradorGuia, "fecha">;

export function useBorradorGuia({
  fecha,
  estado,
  creando,
  onRecuperado,
}: {
  fecha: string;
  /** Lo que se ve ahora en la ventana. */
  estado: Estado;
  /** Ya se apretó «Crear pedidos»: lo leído pasa a ser pedidos y el borrador sobra. */
  creando: boolean;
  onRecuperado: (b: BorradorGuia) => void;
}) {
  // Hasta leer lo guardado no se escribe: si no, la ventana vacía lo pisaría.
  const [leido, setLeido] = useState(false);
  const recuperar = useRef(onRecuperado);
  useEffect(() => {
    recuperar.current = onRecuperado;
  });

  useEffect(() => {
    let vigente = true;
    leerBorradorGuia(fecha)
      .then((b) => {
        if (vigente && b && (b.lineas.length > 0 || b.texto.trim() !== "")) recuperar.current(b);
      })
      .catch(() => null)
      .finally(() => vigente && setLeido(true));
    return () => {
      vigente = false;
    };
  }, [fecha]);

  const vacio = estado.lineas.length === 0 && estado.texto.trim() === "";
  const firma = JSON.stringify(estado);
  useEffect(() => {
    if (!leido) return;
    if (creando || vacio) {
      void borrarBorradorGuia(fecha).catch(() => null);
      return;
    }
    const t = setTimeout(() => {
      // Sin poder guardar, la ventana sigue igual: solo se pierde al cerrar la app.
      void guardarBorradorGuia({ fecha, ...(JSON.parse(firma) as Estado) }).catch(() => null);
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [leido, creando, vacio, firma, fecha]);

  /** «Descartar» lo leído al cerrar la ventana. */
  return { descartar: () => borrarBorradorGuia(fecha).catch(() => null) };
}
