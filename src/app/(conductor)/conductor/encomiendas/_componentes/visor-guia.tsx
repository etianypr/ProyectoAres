"use client";

// Paso 1 de «Cargar la guía», «Como el papel» (dueño, 2026-11-13, maqueta B): un
// recuadro oscuro con el marco de la hoja, las fotos tomadas apiladas abajo y, en
// el pie, la cámara y «Leer direcciones» (lee las fotos juntas); lo demás, tras «Otra
// forma» (versión simple, dueño 2026-11-14).
//
// El recuadro NO es una cámara en vivo: con la cámara de ARES abierta la app se
// traba y Android la puede cerrar (ANR, auditoría 2026-11-10, spec 028). El
// recuadro y el botón redondo abren la cámara del sistema (`capture=environment`),
// de a una foto, como siempre; adentro se ve la última foto tomada.

import { useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { MAX_FOTOS_GUIA } from "@/lib/encomiendas/lectura/contrato";
import type { FotoGuia } from "./fotos-guia";

const ESQUINA = "pointer-events-none absolute h-9 w-9 border-white/85";

export function VisorGuia({
  fotos,
  leyendo,
  lleno,
  onCamara,
  onQuitar,
}: {
  fotos: FotoGuia[];
  leyendo: boolean;
  lleno: boolean;
  onCamara: () => void;
  onQuitar: (id: string) => void;
}) {
  const ultima = fotos.at(-1);
  return (
    <div className="flex flex-1 flex-col gap-3">
      <button
        type="button"
        onClick={onCamara}
        disabled={leyendo || lleno}
        aria-label={ultima ? `Sacar otra foto (van ${fotos.length})` : "Sacar foto"}
        className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-foreground text-background disabled:cursor-default"
      >
        {ultima ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto local del teléfono
          <img src={ultima.url} alt={`Foto ${fotos.length} de la guía`} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70">
            <Camera className="h-7 w-7" />
            Guía de despacho
          </span>
        )}
        <span className={cn(ESQUINA, "left-3.5 top-3.5 rounded-tl-lg border-l-[3px] border-t-[3px]")} />
        <span className={cn(ESQUINA, "bottom-3.5 right-3.5 rounded-br-lg border-b-[3px] border-r-[3px]")} />
        {leyendo ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/75 text-sm font-semibold">
            <Loader2 className="h-7 w-7 animate-spin" />
            Leyendo la guía…
          </span>
        ) : null}
      </button>

      {fotos.length > 0 ? (
        <div className="flex items-end gap-2">
          <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto pt-1">
            {fotos.map((f, i) => (
              <li key={f.id} className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg bg-card shadow-soft">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto local del teléfono */}
                <img src={f.url} alt={`Foto ${i + 1} de la guía`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0.5 left-0.5 rounded bg-foreground/80 px-1 font-mono text-[11px] font-semibold text-background">
                  {i + 1}
                </span>
                <button
                  type="button"
                  disabled={leyendo}
                  onClick={() => onQuitar(f.id)}
                  aria-label={`Quitar la foto ${i + 1}`}
                  className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-bl-lg bg-foreground/70 text-background disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {/* El contador solo al llegar al tope (versión simple, dueño 2026-11-14). */}
          {lleno ? (
            <span className="shrink-0 pb-1 font-mono text-xs text-muted">
              {fotos.length} de {MAX_FOTOS_GUIA}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const ENLACE =
  "flex h-10 items-center justify-center rounded-full border border-separator bg-card px-3 text-sm font-semibold text-brand active:scale-[0.97] disabled:opacity-50";

/** El pie del paso 1, versión simple (dueño, 2026-11-14): la cámara y, con fotos,
 *  «Leer direcciones» (lee las fotos juntas). Los otros caminos —Galería, Nóminas físicas y
 *  Pegar texto— quedan tras «Otra forma», que se despliega en el mismo lugar. */
export function PieFotos({
  fotos,
  leyendo,
  lleno,
  onCamara,
  onGaleria,
  onLeer,
  onBarrer,
  onPegar,
}: {
  fotos: number;
  leyendo: boolean;
  lleno: boolean;
  onCamara: () => void;
  onGaleria: () => void;
  onLeer: () => void;
  /** «Nóminas físicas» (barrer la nómina), solo en una APK que lo trae. */
  onBarrer?: () => void;
  onPegar: () => void;
}) {
  const [otras, setOtras] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className={cn("flex items-center gap-3", fotos === 0 && "justify-center")}>
        <button
          type="button"
          disabled={leyendo || lleno}
          onClick={onCamara}
          aria-label="Sacar foto"
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full transition-transform active:scale-[0.94] disabled:opacity-50",
            fotos === 0
              ? "h-[72px] w-[72px] bg-brand text-brand-foreground outline outline-1 outline-brand ring-[5px] ring-inset ring-brand-soft"
              : "h-14 w-14 border-2 border-brand bg-card text-brand",
          )}
        >
          <Camera className="h-6 w-6" />
        </button>
        {fotos > 0 ? (
          <button
            type="button"
            disabled={leyendo}
            onClick={onLeer}
            className="flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {/* Nombre del dueño (2026-11-14): lee las fotos y saca OF y direcciones. */}
            Leer direcciones
          </button>
        ) : null}
      </div>
      {otras ? (
        <EnlacesGuia
          deshabilitado={leyendo}
          enlaces={[
            lleno ? null : { texto: "Galería", onClick: onGaleria },
            onBarrer ? { texto: "Nóminas físicas", onClick: onBarrer } : null,
            { texto: "Pegar texto", onClick: onPegar },
          ]}
        />
      ) : (
        <button
          type="button"
          disabled={leyendo}
          onClick={() => setOtras(true)}
          aria-expanded={false}
          className="mx-auto block rounded-full px-3 py-1.5 text-sm font-medium text-muted active:bg-card disabled:opacity-50"
        >
          Otra forma
        </button>
      )}
    </div>
  );
}

type Enlace = { texto: string; onClick: () => void };

/** Los otros caminos, en botones chicos centrados (si no caben en un renglón, el
 *  siguiente también queda centrado). */
export function EnlacesGuia({ enlaces, deshabilitado = false }: { enlaces: (Enlace | null)[]; deshabilitado?: boolean }) {
  const lista = enlaces.filter((e): e is Enlace => e != null);
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {lista.map((e) => (
        <button key={e.texto} type="button" disabled={deshabilitado} onClick={e.onClick} className={ENLACE}>
          {e.texto}
        </button>
      ))}
    </div>
  );
}
