"use client";

// El botón de abajo de «Cargar la guía», según el paso (sale de cargar-guia.tsx,
// spec 033): el de las fotos (visor-guia.tsx), leer el texto pegado, crear los pedidos y, al terminar, armar
// la ruta, sumar a la ruta los nuevos (con ruta ya armada) o escanear. Cuando hay
// que confirmar algo, la pregunta va en su lugar.

import { useState } from "react";
import { ClipboardPaste, Loader2 } from "lucide-react";
import type { FinGuia } from "./fin-guia";
import { FranjaConfirmar } from "./franja-confirmar";

export const BOTON_GUIA =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[15px] font-semibold text-brand-foreground transition-transform active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export type PasoGuia = "fotos" | "pegar" | "revisar";
export type PreguntaGuia = "cerrar" | "barrido" | "deshacer";

export function PieGuia({
  fin,
  paso,
  pregunta,
  hayRuta,
  fueraDeRuta,
  leyendo,
  hayTexto,
  lineas,
  malas,
  porConfirmar,
  fotos,
  pieFotos,
  onLeer,
  onLeerFotos,
  onCrear,
  onSumar,
  onEscanear,
  armar,
  onDescartar,
  onDeshacer,
  onSeguir,
}: {
  fin: FinGuia | null;
  paso: PasoGuia;
  pregunta: PreguntaGuia | null;
  hayRuta: boolean;
  fueraDeRuta: number;
  leyendo: boolean;
  hayTexto: boolean;
  lineas: number;
  malas: number;
  porConfirmar: number;
  fotos: number;
  /** El pie del paso 1 (PieFotos). */
  pieFotos: React.ReactNode;
  onLeer: () => void;
  /** Hay fotos sin leer: «Leer n fotos» antes de crear. */
  onLeerFotos: () => void;
  onCrear: () => void;
  onSumar: () => Promise<void>;
  onEscanear: () => void;
  armar: () => React.ReactNode;
  /** Cerrar perdiendo lo leído. */
  onDescartar: () => void;
  /** Borrar los pedidos de la carga. */
  onDeshacer: () => void;
  onSeguir: () => void;
}) {
  const [sumando, setSumando] = useState(false);

  if (pregunta === "cerrar") {
    const texto =
      !fin && lineas > 0
        ? `¿Descartar ${plural(lineas, "línea leída", "líneas leídas")}?`
        : fotos > 0
          ? `¿Descartar ${plural(fotos, "foto", "fotos")}?`
          : "¿Descartar el texto pegado?";
    return <FranjaConfirmar texto={texto} si="Descartar" onSi={onDescartar} onNo={onSeguir} />;
  }
  if (pregunta === "deshacer" && fin?.tipo === "listo") {
    const n = fin.ids.length;
    const texto = n === 1 ? "¿Borrar el pedido de esta carga?" : `¿Borrar los ${n} pedidos de esta carga?`;
    return <FranjaConfirmar texto={texto} si="Borrar" onSi={onDeshacer} onNo={onSeguir} />;
  }

  if (fin) {
    if (fin.tipo !== "listo") return null;
    if (!hayRuta) return <>{armar()}</>;
    if (fueraDeRuta === 0) {
      return (
        <button type="button" onClick={onEscanear} className={BOTON_GUIA}>
          Escanear paquete
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={sumando}
        onClick={() => {
          setSumando(true);
          void onSumar().finally(() => setSumando(false));
        }}
        className={BOTON_GUIA}
      >
        {sumando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Sumar {fueraDeRuta} a la ruta
      </button>
    );
  }

  // Paso 1: Galería · disparar · «Leer n» (visor-guia.tsx).
  if (paso === "fotos") return <>{pieFotos}</>;
  if (paso === "pegar") {
    return (
      <button type="button" disabled={!hayTexto || leyendo} onClick={onLeer} className={BOTON_GUIA}>
        <ClipboardPaste className="h-4 w-4" />
        Leer la guía
      </button>
    );
  }
  if (fotos > 0) {
    return (
      <button type="button" disabled={leyendo} onClick={onLeerFotos} className={BOTON_GUIA}>
        {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Leer {plural(fotos, "foto", "fotos")}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={lineas === 0 || malas > 0 || porConfirmar > 0 || leyendo}
      onClick={onCrear}
      className={BOTON_GUIA}
    >
      {lineas === 0
          ? "Sin pedidos leídos"
          : malas > 0
            ? `Corrige ${plural(malas, "línea", "líneas")}`
            : porConfirmar > 0
              ? `Confirma ${plural(porConfirmar, "línea", "líneas")}`
              : `Crear ${plural(lineas, "pedido", "pedidos")}`}
    </button>
  );
}
