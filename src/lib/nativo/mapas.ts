// Navegar con Google Maps (terreno 2026-10-29: "descarta cualquier error que me
// pueda dejar botado sin alternativas"; desde la spec 020 es la navegación de
// ARES): abre Google Maps ya navegando hacia la parada. Es también el respaldo
// cuando no hay burbuja (fuera de la APK o en una APK anterior, ver burbuja.ts).
//
// En la APK, `google.navigation:` lo atiende Android directo (como `tel:` al
// llamar, ver telefono.ts): no hace falta nada nativo nuevo. En el navegador, el
// enlace de direcciones de Google Maps.
//
// Con punto de paso (dueño, 2026-11-25; geo/punto-de-paso.ts) va el enlace de
// direcciones con `waypoints`: `google.navigation:` no los acepta.
import { esApp } from "./entorno";

type Punto = { lat: number; lng: number };

// El interruptor de Diagnóstico «Navegar con punto de paso»: encendido por defecto
// (dueño, 2026-11-26, tras probarlo en el V2430); se apaga ahí si en terreno molesta.
const CLAVE_PASO = "ares.navegar-con-paso";
const PASO_POR_DEFECTO = true;

/** ¿Google Maps recibe el punto de paso antes de la parada? */
export function navegarConPuntoDePaso(): boolean {
  try {
    const elegido = globalThis.localStorage?.getItem(CLAVE_PASO);
    return elegido == null ? PASO_POR_DEFECTO : elegido === "si";
  } catch {
    return PASO_POR_DEFECTO;
  }
}

export function elegirPuntoDePaso(si: boolean): void {
  try {
    globalThis.localStorage?.setItem(CLAVE_PASO, si ? "si" : "no");
  } catch {
    // Sin localStorage queda lo de por defecto.
  }
}

const enTexto = (p: Punto) => `${p.lat},${p.lng}`;

/** El enlace de Google Maps que empieza a navegar en auto hasta `destino`, pasando
 *  por `pasos`. dir_action=navigate: sin él abre la vista previa (spec 020). */
export function enlaceDeNavegacion(destino: Punto, pasos: Punto[] = []): string {
  const porDonde = pasos.length > 0 ? `&waypoints=${pasos.map(enTexto).join("%7C")}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${enTexto(destino)}${porDonde}&travelmode=driving&dir_action=navigate`;
}

export function abrirEnMapas(destino: Punto, pasos: Punto[] = []): void {
  if (esApp()) {
    // Con punto de paso, el enlace: la APK lo manda a Google Maps (no es de ARES).
    window.location.href = pasos.length > 0 ? enlaceDeNavegacion(destino, pasos) : `google.navigation:q=${enTexto(destino)}&mode=d`;
    return;
  }
  window.open(enlaceDeNavegacion(destino, pasos), "_blank", "noopener");
}
