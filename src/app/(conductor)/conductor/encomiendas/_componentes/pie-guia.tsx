"use client";

// El botón de abajo de «Cargar la guía», según el paso (sale de cargar-guia.tsx,
// spec 033): el de las fotos (visor-guia.tsx), leer el texto pegado, crear los pedidos y, al
// terminar, «Optimizar ruta». Siempre, aunque el día ya tenga ruta: el flujo es guía → ⚠ →
// elegir la ruta → escanear (dueño, 2026-11-26; antes, con ruta, saltaba a «Escanear paquete»
// o «Sumar N a la ruta»). Cuando hay que confirmar algo, la pregunta va en su lugar.

import { ClipboardPaste, Loader2 } from "lucide-react";
import type { FinGuia } from "./fin-guia";
import { FranjaConfirmar } from "./franja-confirmar";
import { BOTON_PRINCIPAL } from "./botones";

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export type PasoGuia = "fotos" | "pegar" | "revisar";
export type PreguntaGuia = "cerrar" | "barrido" | "medias" | "deshacer";

export function PieGuia({
  fin,
  paso,
  pregunta,
  leyendo,
  hayTexto,
  lineas,
  malas,
  porConfirmar,
  fotos,
  aMedias,
  pieFotos,
  onLeer,
  onLeerFotos,
  onCrear,
  armar,
  onDescartar,
  onDeshacer,
  onDescartarBarrido,
  onTerminarBarrido,
  onSeguir,
}: {
  fin: FinGuia | null;
  paso: PasoGuia;
  pregunta: PreguntaGuia | null;
  leyendo: boolean;
  hayTexto: boolean;
  lineas: number;
  malas: number;
  porConfirmar: number;
  fotos: number;
  /** Encargos a medias del barrido en curso (la pregunta al terminar). */
  aMedias: number;
  /** El pie del paso 1 (PieFotos). */
  pieFotos: React.ReactNode;
  onLeer: () => void;
  /** Hay fotos sin leer: «Leer n fotos» antes de crear. */
  onLeerFotos: () => void;
  onCrear: () => void;
  armar: () => React.ReactNode;
  /** Cerrar perdiendo lo leído. */
  onDescartar: () => void;
  /** Borrar los pedidos de la carga. */
  onDeshacer: () => void;
  /** «¿Descartar lo escaneado?»: sí. */
  onDescartarBarrido: () => void;
  /** «N a medias»: terminar igual. */
  onTerminarBarrido: () => void;
  onSeguir: () => void;
}) {
  if (pregunta === "cerrar") {
    const texto =
      !fin && lineas > 0
        ? `¿Descartar ${plural(lineas, "línea leída", "líneas leídas")}?`
        : fotos > 0
          ? `¿Descartar ${plural(fotos, "foto", "fotos")}?`
          : "¿Descartar el texto pegado?";
    return <FranjaConfirmar texto={texto} si="Descartar" onSi={onDescartar} onNo={onSeguir} />;
  }
  // Las dos preguntas del barrido de la nómina, que ahora va en esta misma ventana.
  if (pregunta === "barrido") {
    return <FranjaConfirmar texto="¿Descartar lo escaneado?" si="Descartar" onSi={onDescartarBarrido} onNo={onSeguir} />;
  }
  if (pregunta === "medias") {
    return (
      <FranjaConfirmar
        texto={`${aMedias} sin completar: se agregan sin dirección para completarlas`}
        si="Terminar ahora"
        no="Seguir escaneando"
        onSi={onTerminarBarrido}
        onNo={onSeguir}
      />
    );
  }
  if (pregunta === "deshacer" && fin?.tipo === "listo") {
    const n = fin.ids.length;
    const texto = n === 1 ? "¿Borrar el pedido de esta carga?" : `¿Borrar los ${n} pedidos de esta carga?`;
    return <FranjaConfirmar texto={texto} si="Borrar" onSi={onDeshacer} onNo={onSeguir} />;
  }

  if (fin) return fin.tipo === "listo" ? <>{armar()}</> : null;

  // Paso 1: Galería · disparar · «Leer n» (visor-guia.tsx).
  if (paso === "fotos") return <>{pieFotos}</>;
  if (paso === "pegar") {
    return (
      <button type="button" disabled={!hayTexto || leyendo} onClick={onLeer} className={BOTON_PRINCIPAL}>
        <ClipboardPaste className="h-4 w-4" />
        Leer guía
      </button>
    );
  }
  if (fotos > 0) {
    return (
      <button type="button" disabled={leyendo} onClick={onLeerFotos} className={BOTON_PRINCIPAL}>
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
      className={BOTON_PRINCIPAL}
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
