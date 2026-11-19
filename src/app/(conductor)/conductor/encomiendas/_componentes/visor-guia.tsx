"use client";

// Paso 1 de «Cargar la guía», «Como el papel» (dueño, 2026-11-13, maqueta B): un
// recuadro con el marco de la hoja y, en el pie, como la cámara del teléfono (dueño,
// 2026-11-15): las categorías «Foto» y «Nóminas físicas» se cambian deslizando, el botón
// redondo dispara la que está elegida, la galería queda a su izquierda y «Pegar» a su
// derecha.
//
// El recuadro no cambia de tamaño al sacar fotos (dueño, 2026-11-15: «se achica el
// espacio de la cámara haciendo que la referencia sea incorrecta»): no hay tira de
// miniaturas ni botón ancho. Las fotos sacadas se ven al tocar el recuadro de la galería,
// y «Leer direcciones» toma el lugar de «Pegar».
//
// La nómina se barre en este mismo recuadro (dueño, 2026-11-15: lo de «Foto» llevado a
// «Nóminas físicas», solo la pantalla): con el barrido andando, adentro van lo que falta
// confirmar y el resumen (camara-barrido.tsx), el botón redondo es «Terminar» y a su
// derecha va «Descartar». La lectura es la de siempre (use-barrido-nomina.ts).
//
// En la APK el recuadro es la cámara en vivo (`vivo`, use-visor-vivo.ts; dueño,
// 2026-11-15): un hueco transparente por el que se ve la cámara de ARES, que queda
// debajo de la pantalla, y el botón redondo saca la foto sin salir de la app. Sin ella
// (navegador, APK anterior, sin permiso, o elegido en Diagnóstico), el recuadro y el
// botón abren la cámara del sistema (`capture=environment`), de a una foto, y adentro
// se ve la última foto tomada.

import { useRef, useState } from "react";
import { Camera, ClipboardPaste, Flashlight, FlashlightOff, Images, Loader2, ScanLine, ScanText, Square, X } from "lucide-react";
import { cn } from "@/lib/comun/utils";
import { MAX_FOTOS_GUIA } from "@/lib/encomiendas/lectura/contrato";
import { FaltanBarrido, LinternaBarrido, ResumenBarrido, type VistaBarrido } from "./camara-barrido";
import type { FotoGuia } from "./fotos-guia";

const ESQUINA = "pointer-events-none absolute h-9 w-9 border-white/85";

/** Qué dispara el botón redondo: una foto de la guía o el barrido de la nómina. */
export type ModoGuia = "foto" | "nomina";

/** La cámara en vivo del recuadro (use-visor-vivo.ts): si está sacando una foto, y su
 *  linterna. */
type VisorVivo = {
  sacando: boolean;
  conLinterna: boolean;
  linterna: boolean;
  alternarLinterna: () => void;
};

export function VisorGuia({
  fotos,
  leyendo,
  lleno,
  nomina = false,
  vivo,
  barrido,
  recuadro,
  paneles,
  onCamara,
}: {
  fotos: FotoGuia[];
  leyendo: boolean;
  lleno: boolean;
  /** Está elegida «Nóminas físicas»: el recuadro abre el barrido (`onCamara`). */
  nomina?: boolean;
  /** La cámara está prendida: el recuadro es un hueco y no dispara al tocarlo. */
  vivo?: VisorVivo;
  /** El barrido de la nómina está andando: lo que lleva leído (null mientras prende la
   *  cámara) y si hay linterna. El recuadro es el mismo hueco. */
  barrido?: { vista: VistaBarrido | null; conLinterna: boolean };
  /** El hueco de la cámara: la foto se recorta a él. */
  recuadro?: React.Ref<HTMLDivElement>;
  /** Lo que tapa el hueco al barrer, arriba («Falta confirmar») y abajo (el resumen):
   *  entre medio van las flechas a lo que falta (spec 036, use-zona-libre.ts). */
  paneles?: { arriba: React.Ref<HTMLDivElement>; abajo: React.Ref<HTMLDivElement> };
  onCamara: () => void;
}) {
  const ultima = fotos.at(-1);
  return (
    <div className="flex flex-1 flex-col">
      {vivo || barrido ? (
        // La sombra ancha pinta el fondo alrededor del hueco redondeado (la corta la
        // zona con scroll de la ventana); adentro no hay nada: se ve la cámara.
        <div
          ref={recuadro}
          aria-label={nomina ? "Cámara: nómina física" : "Cámara: guía de despacho"}
          className="relative min-h-[260px] flex-1 rounded-2xl shadow-[0_0_0_9999px_var(--background)]"
        >
          {barrido ? (
            <>
              {barrido.vista && barrido.vista.faltan.length > 0 ? (
                <div ref={paneles?.arriba} role="status" className="absolute inset-x-0 top-0 rounded-t-2xl bg-black/60 py-2 pl-3 pr-14 text-white">
                  <FaltanBarrido faltan={barrido.vista.faltan} />
                </div>
              ) : null}
              {barrido.conLinterna ? <LinternaBarrido className="absolute right-2 top-2 rounded-full bg-black/45 text-white" /> : null}
              <div ref={paneles?.abajo} className="absolute inset-x-0 bottom-0 space-y-0.5 rounded-b-2xl bg-black/60 px-3 py-2 text-white">
                {barrido.vista ? (
                  <ResumenBarrido vista={barrido.vista} sobreCamara />
                ) : (
                  <p className="flex items-center gap-2 text-xs">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Iniciando cámara…
                  </p>
                )}
              </div>
            </>
          ) : null}
          {barrido ? null : <span className={cn(ESQUINA, "left-3.5 top-3.5 rounded-tl-lg border-l-[3px] border-t-[3px]")} />}
          {barrido ? null : <span className={cn(ESQUINA, "bottom-3.5 right-3.5 rounded-br-lg border-b-[3px] border-r-[3px]")} />}
          {vivo?.conLinterna ? (
            <button
              type="button"
              onClick={vivo.alternarLinterna}
              aria-label={vivo.linterna ? "Apagar linterna" : "Encender linterna"}
              aria-pressed={vivo.linterna}
              className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white"
            >
              {vivo.linterna ? <FlashlightOff className="h-5 w-5" /> : <Flashlight className="h-5 w-5" />}
            </button>
          ) : null}
          {vivo?.sacando ? <span className="absolute inset-0 rounded-2xl bg-white/60" /> : null}
        </div>
      ) : (
      <button
        type="button"
        onClick={onCamara}
        disabled={leyendo || (lleno && !nomina)}
        aria-label={nomina ? "Escanear nómina" : ultima ? `Tomar otra foto (${fotos.length} tomadas)` : "Tomar foto"}
        className="relative flex min-h-[260px] flex-1 items-center justify-center overflow-hidden rounded-2xl bg-foreground text-background disabled:cursor-default"
      >
        {ultima ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto local del teléfono
          <img src={ultima.url} alt={`Foto ${fotos.length} de la guía`} className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-70">
            {nomina ? <ScanLine className="h-7 w-7" /> : <Camera className="h-7 w-7" />}
            {nomina ? "Nómina física" : "Guía de despacho"}
          </span>
        )}
        <span className={cn(ESQUINA, "left-3.5 top-3.5 rounded-tl-lg border-l-[3px] border-t-[3px]")} />
        <span className={cn(ESQUINA, "bottom-3.5 right-3.5 rounded-br-lg border-b-[3px] border-r-[3px]")} />
        {leyendo ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-foreground/75 text-sm font-semibold">
            <Loader2 className="h-7 w-7 animate-spin" />
            Leyendo guía…
          </span>
        ) : null}
      </button>
      )}
    </div>
  );
}

const MODOS: { modo: ModoGuia; nombre: string }[] = [
  { modo: "foto", nombre: "Foto" },
  { modo: "nomina", nombre: "Nóminas físicas" },
];
/** Cuánto hay que deslizar, en px, para cambiar de categoría. */
const DESLIZAR_PX = 40;
const LADO =
  "flex h-14 w-14 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-xl border border-separator bg-card text-brand active:scale-[0.96] disabled:opacity-50";

/** El pie del paso 1, como la cámara del teléfono (dueño, 2026-11-15): arriba las
 *  categorías, que se cambian deslizando o tocándolas; abajo, la galería, el botón
 *  redondo (saca la foto o abre el barrido, según la categoría) y «Pegar». Con fotos, la
 *  galería muestra la última y cuántas van (al tocarla se abren, para quitar una o sumar
 *  de la galería) y «Leer direcciones» (lee las fotos juntas) toma el lugar de «Pegar»:
 *  el pie mide siempre lo mismo. Con el barrido andando (`barriendo`), el botón redondo
 *  es «Terminar», las categorías quedan apagadas y a la derecha va «Descartar». */
export function PieFotos({
  fotos,
  leyendo,
  lleno,
  modo,
  onModo,
  barriendo = false,
  onTerminar,
  onDescartar,
  onCamara,
  onGaleria,
  onQuitar,
  onLeer,
  onBarrer,
  onPegar,
}: {
  fotos: FotoGuia[];
  leyendo: boolean;
  lleno: boolean;
  modo: ModoGuia;
  onModo: (modo: ModoGuia) => void;
  /** El barrido de la nómina está andando. */
  barriendo?: boolean;
  /** «Terminar»: suma lo barrido. */
  onTerminar?: () => void;
  /** «Descartar» lo de esta pasada. */
  onDescartar?: () => void;
  onCamara: () => void;
  onGaleria: () => void;
  onQuitar: (id: string) => void;
  onLeer: () => void;
  /** «Nóminas físicas» (barrer la nómina), solo en una APK que lo trae. */
  onBarrer?: () => void;
  onPegar: () => void;
}) {
  const modos = MODOS.filter((m) => m.modo === "foto" || onBarrer);
  const actual = Math.max(0, modos.findIndex((m) => m.modo === modo));
  const nomina = modos[actual].modo === "nomina";
  const desde = useRef<{ x: number; y: number } | null>(null);
  const [abiertas, setAbiertas] = useState(false);
  const ultima = fotos.at(-1);
  const verFotos = abiertas && ultima != null && !barriendo;

  /** Deslizar hacia un lado pasa a la categoría que sigue, y da la vuelta: con dos
   *  categorías, cualquier deslizada cambia a la otra. */
  function alSoltar(x: number, y: number) {
    const inicio = desde.current;
    desde.current = null;
    if (!inicio || leyendo || barriendo || verFotos || modos.length < 2) return;
    const dx = x - inicio.x;
    if (Math.abs(dx) < DESLIZAR_PX || Math.abs(dx) < Math.abs(y - inicio.y)) return;
    onModo(modos[(actual + (dx < 0 ? 1 : -1) + modos.length) % modos.length].modo);
  }

  return (
    <div
      className="relative touch-pan-y select-none space-y-2"
      onTouchStart={(e) => (desde.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => alSoltar(e.changedTouches[0].clientX, e.changedTouches[0].clientY)}
    >
      {/* Las fotos sacadas, sobre el pie: se abren y se cierran con el recuadro de la galería. */}
      {verFotos ? (
        <div className="absolute inset-x-0 bottom-full mb-5 flex items-stretch gap-2 rounded-2xl bg-card p-2 shadow-soft">
          <ul aria-label="Fotos tomadas" className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {fotos.map((f, i) => (
              <li key={f.id} className="relative aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg bg-background">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto local del teléfono */}
                <img src={f.url} alt={`Foto ${i + 1} de la guía`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0.5 left-0.5 rounded bg-foreground/80 px-1 text-xs font-bold tabular-nums text-background">
                  {i + 1}
                </span>
                <button
                  type="button"
                  disabled={leyendo}
                  onClick={() => onQuitar(f.id)}
                  aria-label={`Quitar foto ${i + 1}`}
                  className="absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-bl-lg bg-foreground/70 text-background disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {lleno ? (
            <span className="flex shrink-0 items-center px-1 text-xs tabular-nums text-muted">
              {fotos.length} de {MAX_FOTOS_GUIA}
            </span>
          ) : (
            // Del alto de las miniaturas: llena la tarjeta (dueño, 2026-11-15).
            <button type="button" disabled={leyendo} onClick={onGaleria} aria-label="Agregar desde la galería" className={cn(LADO, "h-auto shrink-0 gap-1")}>
              <Images className="h-5 w-5" />
              <span className="text-xs font-semibold leading-none">Galería</span>
            </button>
          )}
        </div>
      ) : null}
      {/* La categoría elegida queda al centro, sobre el botón redondo; la otra, a su lado. */}
      {modos.length > 1 ? (
        <div role="tablist" aria-label="Tipo de carga" className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          {modos.map((m, i) => (
            <button
              key={m.modo}
              type="button"
              role="tab"
              aria-selected={i === actual}
              disabled={leyendo || barriendo}
              onClick={() => onModo(m.modo)}
              style={{ gridColumn: i === actual ? 2 : i < actual ? 1 : 3, gridRow: 1 }}
              className={cn(
                "h-9 whitespace-nowrap text-xs font-semibold uppercase tracking-wider disabled:opacity-50",
                i === actual ? "border-b-2 border-brand text-brand" : "text-muted",
                i < actual ? "justify-self-end" : i > actual ? "justify-self-start" : "",
              )}
            >
              {m.nombre}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
        {barriendo ? (
          <span />
        ) : ultima ? (
          <button
            type="button"
            onClick={() => setAbiertas(!verFotos)}
            aria-label={`Fotos tomadas: ${fotos.length}`}
            aria-expanded={verFotos}
            className={cn(LADO, "relative justify-self-start")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- foto local del teléfono */}
            <img src={ultima.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute bottom-0.5 right-0.5 rounded bg-foreground/80 px-1 text-xs font-bold tabular-nums text-background">
              {fotos.length}
            </span>
          </button>
        ) : (
          <button type="button" disabled={leyendo} onClick={onGaleria} aria-label="Galería" className={cn(LADO, "justify-self-start")}>
            <Images className="h-5 w-5" />
            <span className="text-xs font-semibold leading-none">Galería</span>
          </button>
        )}
        <button
          type="button"
          disabled={!barriendo && (leyendo || (lleno && !nomina))}
          onClick={barriendo ? onTerminar : nomina ? onBarrer : onCamara}
          aria-label={barriendo ? "Terminar" : nomina ? "Escanear nómina" : "Tomar foto"}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-brand text-brand-foreground outline outline-1 outline-brand ring-[5px] ring-inset ring-brand-soft transition-transform active:scale-[0.94] disabled:opacity-50"
        >
          {barriendo ? <Square className="h-6 w-6 fill-current" /> : nomina ? <ScanLine className="h-6 w-6" /> : <Camera className="h-6 w-6" />}
        </button>
        {barriendo ? (
          <button type="button" onClick={onDescartar} aria-label="Descartar lo escaneado" className={cn(LADO, "w-auto justify-self-end px-2")}>
            <X className="h-5 w-5" />
            <span className="text-xs font-semibold leading-none">Descartar</span>
          </button>
        ) : ultima ? (
          <button
            type="button"
            disabled={leyendo}
            onClick={onLeer}
            aria-label="Leer direcciones"
            className="ml-2 flex h-14 items-center gap-2 justify-self-stretch rounded-full bg-brand py-1 pl-1.5 pr-3 text-left text-brand-foreground shadow-soft transition-transform active:scale-[0.97] disabled:opacity-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
              {leyendo ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanText className="h-5 w-5" />}
            </span>
            {/* Nombre del dueño (2026-11-14): lee las fotos y saca OF y direcciones. */}
            <span className="min-w-0 flex-1 leading-none">
              <span className="block text-[15px] font-bold">Leer</span>
              <span className="mt-1 block text-xs font-medium opacity-90">direcciones</span>
            </span>
          </button>
        ) : (
          <button type="button" disabled={leyendo} onClick={onPegar} aria-label="Pegar texto" className={cn(LADO, "justify-self-end")}>
            <ClipboardPaste className="h-5 w-5" />
            <span className="text-xs font-semibold leading-none">Pegar</span>
          </button>
        )}
      </div>
    </div>
  );
}
