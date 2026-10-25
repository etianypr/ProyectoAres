"use client";

// URL para mostrar la foto de un paquete (spec 003): la guardada en el teléfono o
// una recién tomada. Las URL se liberan al dejar de usarse.

import { useEffect, useMemo, useState } from "react";
import { leerFoto } from "@/lib/encomiendas/local/almacen";

/** La foto guardada con ese id, o null mientras carga o si no existe. */
export function useFotoGuardada(fotoId: string | null): string | null {
  const [cargada, setCargada] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!fotoId) return;
    let vigente = true;
    let url: string | null = null;
    void leerFoto(fotoId)
      .then((blob) => {
        if (!vigente || !blob) return;
        url = URL.createObjectURL(blob);
        setCargada({ id: fotoId, url });
      })
      .catch(() => {});
    return () => {
      vigente = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fotoId]);

  return fotoId && cargada?.id === fotoId ? cargada.url : null;
}

/** URL de una foto que todavía está en memoria (recién tomada). */
export function useFotoEnMemoria(blob: Blob | null): string | null {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}
