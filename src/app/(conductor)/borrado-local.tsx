"use client";

// Borra del teléfono los datos de destinatarios cuando el servidor confirmó que
// esta cuenta ya no reparte: ficha desactivada o sin ficha (spec 007, FR-007).
// Solo se monta en esas pantallas, que salen de una consulta que sí respondió:
// un error de red o una base caída nunca llega acá, así que no puede borrar la
// ruta de un conductor en plena calle. Quedan la cola y los resúmenes.

import { useEffect } from "react";
import { borrarDatosDestinatarios } from "@/lib/encomiendas/local/almacen";

export function BorradoLocal() {
  useEffect(() => {
    // Si el teléfono no puede (navegador sin IndexedDB), no hay nada guardado.
    borrarDatosDestinatarios().catch(() => {});
  }, []);
  return null;
}
