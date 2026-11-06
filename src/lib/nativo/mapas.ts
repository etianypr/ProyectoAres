// Seguir con Google Maps (terreno 2026-10-29: "descarta cualquier error que me
// pueda dejar botado sin alternativas"). Si la navegación de la app no carga —sin
// señal para Mapbox, un servicio caído—, el conductor igual tiene que llegar a la
// parada: esto abre Google Maps ya navegando hacia ella.
//
// En la APK, `google.navigation:` lo atiende Android directo (como `tel:` al
// llamar, ver telefono.ts): no hace falta nada nativo nuevo. En el navegador, el
// enlace de direcciones de Google Maps.
import { esApp } from "./entorno";

export function abrirEnMapas(destino: { lat: number; lng: number }): void {
  const { lat, lng } = destino;
  if (esApp()) {
    window.location.href = `google.navigation:q=${lat},${lng}&mode=d`;
    return;
  }
  // dir_action=navigate: Google Maps empieza a navegar sin que haya que tocar
  // "Iniciar" (spec 020; sin él abre la vista previa de la ruta).
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`,
    "_blank",
    "noopener",
  );
}
