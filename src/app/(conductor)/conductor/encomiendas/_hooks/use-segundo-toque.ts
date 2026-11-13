"use client";

// Un botón que pierde algo pide un segundo toque en el mismo lugar (spec 033:
// descartar la propuesta, salir a repartir con paquetes sin escanear). Sin
// ventana encima: el primer toque cambia el texto del botón y, si en 3 s no
// vuelve a tocar, queda como estaba.

import { useCallback, useEffect, useRef, useState } from "react";

const MS_SEGUNDO_TOQUE = 3000;

export function useSegundoToque(): {
  armado: boolean;
  /** Primer toque: arma. Segundo, dentro del plazo: corre `accion`. */
  tocar: (accion: () => void) => void;
  desarmar: () => void;
} {
  const [armado, setArmado] = useState(false);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const desarmar = useCallback(() => {
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = null;
    setArmado(false);
  }, []);
  useEffect(() => () => {
    if (reloj.current) clearTimeout(reloj.current);
  }, []);
  const tocar = useCallback(
    (accion: () => void) => {
      if (armado) {
        desarmar();
        accion();
        return;
      }
      setArmado(true);
      reloj.current = setTimeout(() => setArmado(false), MS_SEGUNDO_TOQUE);
    },
    [armado, desarmar],
  );
  return { armado, tocar, desarmar };
}
