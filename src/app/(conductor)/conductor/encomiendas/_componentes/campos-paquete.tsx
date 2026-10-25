"use client";

// El paquete en el formulario del pedido (spec 003): cómo es (tipo, tamaño y
// color, un toque cada uno), una nota corta y la foto. La OF va arriba de todo en
// el formulario, junto al nombre, porque es lo primero que se lee de la etiqueta.
//
// Nada de esto es obligatorio: con un solo toque ya ayuda a encontrar el paquete.

import { useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import {
  COLORES_PAQUETE,
  TAMANOS_PAQUETE,
  TIPOS_PAQUETE,
  type ColorPaquete,
  type TamanoPaquete,
  type TipoPaquete,
} from "@/lib/encomiendas/catalogos";
import { LARGO_NOTA_PAQUETE, textoReferencia } from "@/lib/encomiendas/paquete";
import { comprimirFoto } from "@/lib/encomiendas/local/foto";
import type { Pedido } from "@/lib/encomiendas/local/almacen";
import { useFotoEnMemoria, useFotoGuardada } from "../_hooks/use-foto-paquete";

export type EstadoPaquete = {
  /** Como lo escribe el conductor; se valida al guardar. */
  of: string;
  tipo: TipoPaquete | null;
  tamano: TamanoPaquete | null;
  color: ColorPaquete | null;
  nota: string;
  /** Foto tomada en este formulario, todavía sin guardar. */
  fotoNueva: Blob | null;
  /** Sacar la foto que ya tenía el pedido. */
  quitarFoto: boolean;
};

export function paqueteDe(pedido?: Pedido): EstadoPaquete {
  return {
    of: pedido?.of ?? "",
    tipo: pedido?.referencia?.tipo ?? null,
    tamano: pedido?.referencia?.tamano ?? null,
    color: pedido?.referencia?.color ?? null,
    nota: pedido?.referencia?.nota ?? "",
    fotoNueva: null,
    quitarFoto: false,
  };
}

// Muestra del color en el botón: a pleno sol se reconoce antes que la palabra.
const MUESTRA: Record<ColorPaquete, string> = {
  cafe: "#8b5a2b",
  blanco: "#ffffff",
  negro: "#1f1f1f",
  gris: "#9ca3af",
  amarillo: "#facc15",
  azul: "#2563eb",
  rojo: "#dc2626",
  verde: "#16a34a",
  transparente: "transparent",
};

function Opciones<K extends string>({
  catalogo,
  elegida,
  onElegir,
  muestra,
}: {
  catalogo: Record<K, string>;
  elegida: K | null;
  onElegir: (k: K | null) => void;
  muestra?: Record<K, string>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(catalogo) as K[]).map((k) => {
        const activa = elegida === k;
        return (
          <button
            key={k}
            type="button"
            aria-pressed={activa}
            // Tocar la elegida la suelta: equivocarse no obliga a elegir otra.
            onClick={() => onElegir(activa ? null : k)}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
              activa ? "bg-brand text-brand-foreground" : "border border-separator bg-card text-foreground",
            )}
          >
            {muestra ? (
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/15"
                style={{ background: muestra[k] }}
                aria-hidden
              />
            ) : null}
            {catalogo[k]}
          </button>
        );
      })}
    </div>
  );
}

export function CamposPaquete({
  valor,
  onCambiar,
  fotoGuardadaId,
  deshabilitado,
}: {
  valor: EstadoPaquete;
  onCambiar: (cambio: Partial<EstadoPaquete>) => void;
  /** La foto que ya tiene el pedido que se está editando. */
  fotoGuardadaId: string | null;
  deshabilitado: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [procesando, setProcesando] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const urlNueva = useFotoEnMemoria(valor.fotoNueva);
  const urlGuardada = useFotoGuardada(valor.quitarFoto ? null : fotoGuardadaId);
  const urlFoto = urlNueva ?? urlGuardada;

  const vista = textoReferencia({
    tipo: valor.tipo,
    tamano: valor.tamano,
    color: valor.color,
    nota: valor.nota,
  });

  async function alElegirFoto(archivo: File | undefined) {
    if (!archivo) return;
    setProcesando(true);
    setErrorFoto(null);
    try {
      onCambiar({ fotoNueva: await comprimirFoto(archivo), quitarFoto: false });
    } catch (e) {
      setErrorFoto(e instanceof Error ? e.message : "No se pudo usar la foto.");
    } finally {
      setProcesando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="grid gap-2.5 rounded-2xl border border-separator p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium">Cómo es el paquete</p>
        {vista ? <p className="truncate text-xs font-medium text-brand">{vista}</p> : null}
      </div>

      <Opciones catalogo={TIPOS_PAQUETE} elegida={valor.tipo} onElegir={(tipo) => onCambiar({ tipo })} />
      <Opciones catalogo={TAMANOS_PAQUETE} elegida={valor.tamano} onElegir={(tamano) => onCambiar({ tamano })} />
      <Opciones
        catalogo={COLORES_PAQUETE}
        elegida={valor.color}
        onElegir={(color) => onCambiar({ color })}
        muestra={MUESTRA}
      />

      <input
        aria-label="Algo distintivo del paquete"
        value={valor.nota}
        maxLength={LARGO_NOTA_PAQUETE}
        onChange={(e) => onCambiar({ nota: e.target.value })}
        placeholder="Algo distintivo: cinta roja, dice FRÁGIL…"
        className="h-10 rounded-xl border border-separator bg-card px-3 text-sm outline-none focus:border-brand"
        enterKeyHint="done"
      />

      {/* Solo en el teléfono: la foto puede mostrar la etiqueta, que es dato
          personal, y se borra al cerrarse el pedido (spec 003, FR-008/009). */}
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void alElegirFoto(e.target.files?.[0])}
      />
      {urlFoto ? (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL local del teléfono */}
          <img src={urlFoto} alt="Foto del paquete" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
          <button
            type="button"
            disabled={deshabilitado || procesando}
            onClick={() => entrada.current?.click()}
            className="text-sm font-medium text-brand disabled:opacity-50"
          >
            Cambiar
          </button>
          <button
            type="button"
            disabled={deshabilitado || procesando}
            onClick={() => onCambiar({ fotoNueva: null, quitarFoto: true })}
            className="flex items-center gap-1 text-sm font-medium text-muted disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={deshabilitado || procesando}
          onClick={() => entrada.current?.click()}
          className="flex items-center gap-2 rounded-xl border border-dashed border-separator px-3 py-2.5 text-sm font-medium text-muted active:bg-background disabled:opacity-50"
        >
          <Camera className="h-4 w-4 shrink-0 text-brand" />
          {procesando ? "Procesando la foto…" : "Foto del paquete"}
        </button>
      )}
      {errorFoto ? <p className="text-xs text-danger">{errorFoto}</p> : null}
    </div>
  );
}
