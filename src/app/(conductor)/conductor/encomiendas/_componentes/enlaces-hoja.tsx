"use client";

// Lo que se usa de vez en cuando, al pie de la hoja y en una línea (spec 027):
// agregar un pedido a mano, sumar otra guía y rehacer la ruta. Antes eran
// botones grandes que ocupaban la hoja en pleno reparto.

import { useState } from "react";
import { Plus } from "lucide-react";

export function EnlacesHoja({
  onAgregar,
  onCargarGuia,
  rehacer,
}: {
  onAgregar: () => void;
  onCargarGuia: () => void;
  /** Rehacer la ruta (GenerarRutaLocal): se abre debajo al tocar el enlace. */
  rehacer?: React.ReactNode;
}) {
  const [rehaciendo, setRehaciendo] = useState(false);
  const enlace = "px-1 py-1.5 text-xs font-semibold text-brand active:opacity-60";
  return (
    <div className="mt-4 space-y-2">
      {/* Sin puntos entre medio: a 360 px los tres no caben en una línea, y el
          punto quedaba colgando al final de la primera (recorrido, 2026-11-06). */}
      <div className="flex flex-wrap items-center justify-center gap-x-4">
        <button type="button" onClick={onAgregar} className={`${enlace} flex items-center gap-1`}>
          <Plus className="h-3.5 w-3.5" />
          Agregar pedido
        </button>
        <button type="button" onClick={onCargarGuia} className={enlace}>
          Sumar otra guía
        </button>
        {rehacer ? (
          <button type="button" onClick={() => setRehaciendo((v) => !v)} aria-expanded={rehaciendo} className={enlace}>
            Rehacer la ruta
          </button>
        ) : null}
      </div>
      {rehacer && rehaciendo ? <div className="animate-expand">{rehacer}</div> : null}
    </div>
  );
}
