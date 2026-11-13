"use client";

// Termina el borrado del teléfono que quedó a medias al cerrar la sesión (spec 033,
// logout-sin-senal): la sesión ya se cerró y la marca dice que el borrado falló.
// Sin la marca no hace nada: a /login también llega quien tiene la sesión vencida
// en plena ruta, y a ese no se le borra el día.

import { useEffect } from "react";
import { terminarBorradoPendiente } from "@/lib/encomiendas/local/salida";

export function BorradoPendiente() {
  useEffect(() => {
    void terminarBorradoPendiente();
  }, []);
  return null;
}
