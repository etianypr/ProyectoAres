"use client";

// Las fotos de la guía se juntan antes de leerlas (terreno 2026-10-27): se sacan
// de a una —o se eligen de la galería— y se leen TODAS en una sola consulta. Una
// consulta con tres fotos cuesta ~20 % menos que tres por separado y lee las
// líneas repetidas de una vez.

import { useEffect, useRef, useState } from "react";
import { Camera, Images, Loader2, X } from "lucide-react";
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

/** Las fotos juntadas, numeradas, con el botón para leerlas todas juntas. */
export function BandejaFotos({
  fotos,
  leyendo,
  onQuitar,
  onLeer,
  clase,
}: {
  fotos: FotoGuia[];
  leyendo: boolean;
  onQuitar: (id: string) => void;
  onLeer: () => void;
  clase: string;
}) {
  if (fotos.length === 0) return null;
  return (
    <div className="space-y-2 rounded-2xl bg-card p-3 shadow-soft">
      <p className="text-sm font-medium">
        {fotos.length} {fotos.length === 1 ? "foto lista" : "fotos listas"} para leer
        {fotos.length < MAX_FOTOS_GUIA ? " · puedes sacar más" : " · es el máximo"}
      </p>
      <ul className="grid grid-cols-3 gap-2">
        {fotos.map((f, i) => (
          <li key={f.id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-background">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto local del teléfono */}
            <img src={f.url} alt={`Foto ${i + 1} de la guía`} className="h-full w-full object-cover" />
            <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-xs font-semibold text-white">
              {i + 1}
            </span>
            <button
              type="button"
              disabled={leyendo}
              onClick={() => onQuitar(f.id)}
              aria-label={`Quitar la foto ${i + 1}`}
              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" disabled={leyendo} onClick={onLeer} className={clase}>
        {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />}
        {fotos.length === 1 ? "Leer la foto" : `Leer las ${fotos.length} fotos juntas`}
      </button>
    </div>
  );
}

const SECUNDARIO =
  "flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-separator bg-card text-sm font-semibold text-brand disabled:opacity-50";

/** Cámara y galería: las dos SUMAN fotos, ninguna lee. */
export function BotonesFoto({
  camara,
  deshabilitado,
  onCamara,
  onGaleria,
}: {
  camara: string;
  deshabilitado: boolean;
  onCamara: () => void;
  onGaleria: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button type="button" disabled={deshabilitado} onClick={onCamara} className={SECUNDARIO}>
        <Camera className="h-4 w-4" />
        {camara}
      </button>
      <button type="button" disabled={deshabilitado} onClick={onGaleria} className={SECUNDARIO}>
        <Images className="h-4 w-4" />
        Galería
      </button>
    </div>
  );
}

const GRANDE =
  "flex h-28 w-full max-w-xs flex-col items-center justify-center gap-2 rounded-3xl text-base font-semibold shadow-soft transition-transform active:scale-[0.97] disabled:opacity-50";

/** Al abrir "Cargar la guía": los dos caminos, grandes y al centro. */
export function BotonesGrandes({
  deshabilitado,
  onCamara,
  onGaleria,
}: {
  deshabilitado: boolean;
  onCamara: () => void;
  onGaleria: () => void;
}) {
  return (
    <>
      <button type="button" disabled={deshabilitado} onClick={onCamara} className={`${GRANDE} bg-brand text-brand-foreground`}>
        <Camera className="h-8 w-8" />
        Sacar foto
      </button>
      <button type="button" disabled={deshabilitado} onClick={onGaleria} className={`${GRANDE} bg-card text-brand`}>
        <Images className="h-8 w-8" />
        Galería
      </button>
    </>
  );
}
