"use client";

// Las fotos de la guía se juntan antes de leerlas (terreno 2026-10-27): se sacan
// de a una —o se eligen de la galería— y se leen TODAS en una sola consulta. Una
// consulta con tres fotos cuesta ~20 % menos que tres por separado y lee las
// líneas repetidas de una vez. Cómo se ven: visor-guia.tsx.

import { useEffect, useRef, useState } from "react";
import { MAX_FOTOS_GUIA } from "@/lib/encomiendas/lectura/contrato";

export type FotoGuia = { id: string; archivo: File; url: string };

/** Las fotos juntadas, con su miniatura. */
export function useFotosGuia() {
  const [fotos, setFotos] = useState<FotoGuia[]>([]);
  /** Las miniaturas vivas, para soltarlas al cerrar. */
  const urlsRef = useRef(new Set<string>());
  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  const soltar = (f: FotoGuia) => {
    URL.revokeObjectURL(f.url);
    urlsRef.current.delete(f.url);
  };

  return {
    fotos,
    lleno: fotos.length >= MAX_FOTOS_GUIA,
    /** Suma fotos sin leerlas. Devuelve un aviso si no cupieron todas. */
    agregar(archivos: File[]): string | null {
      const caben = Math.max(0, MAX_FOTOS_GUIA - fotos.length);
      const nuevas = archivos.slice(0, caben).map((archivo) => {
        const url = URL.createObjectURL(archivo);
        urlsRef.current.add(url);
        return { id: crypto.randomUUID(), archivo, url };
      });
      setFotos((antes) => [...antes, ...nuevas]);
      return archivos.length > caben
        ? `Se leen hasta ${MAX_FOTOS_GUIA} fotos juntas. Lee estas y después agrega las que faltan.`
        : null;
    },
    quitar(id: string) {
      const foto = fotos.find((f) => f.id === id);
      if (foto) soltar(foto);
      setFotos((antes) => antes.filter((f) => f.id !== id));
    },
    vaciar() {
      for (const f of fotos) soltar(f);
      setFotos([]);
    },
  };
}
