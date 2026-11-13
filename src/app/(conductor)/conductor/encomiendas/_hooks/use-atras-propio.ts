"use client";

// Una ventana que quiere decidir ella qué hace el botón atrás de Android (spec
// 033): «Cargar la guía» con líneas leídas o el formulario con cambios sin
// guardar preguntan antes de cerrar, en vez de perder lo escrito. La última que
// se anotó es la que atiende; useBotonAtras le pregunta primero a esta pila.

import { useEffect, useRef } from "react";

const pila: { atender: () => void }[] = [];

/** Mientras `activo`, el botón atrás llama a `atender` (y nada más). */
export function useAtrasPropio(activo: boolean, atender: () => void): void {
  const ref = useRef(atender);
  useEffect(() => {
    ref.current = atender;
  });
  useEffect(() => {
    if (!activo) return;
    const entrada = { atender: () => ref.current() };
    pila.push(entrada);
    return () => {
      const i = pila.indexOf(entrada);
      if (i >= 0) pila.splice(i, 1);
    };
  }, [activo]);
}

/** true si alguna ventana se hizo cargo del botón atrás. */
export function atenderAtrasPropio(): boolean {
  const ultima = pila[pila.length - 1];
  if (!ultima) return false;
  ultima.atender();
  return true;
}
