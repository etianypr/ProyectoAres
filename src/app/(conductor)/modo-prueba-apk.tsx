"use client";

// La APK de prueba entra siempre en modo prueba (spec 028; ver
// lib/encomiendas/local/modo-prueba.ts). Va en el layout del conductor para que
// se prenda al abrir cualquier pantalla, antes de que se mande nada a la base.

import { useEffect } from "react";
import { asegurarModoPrueba } from "@/lib/encomiendas/local/modo-prueba";
import { versionInstalada } from "@/lib/nativo/entorno";

export function ModoPruebaApk() {
  useEffect(() => {
    void versionInstalada().then(asegurarModoPrueba);
  }, []);
  return null;
}
