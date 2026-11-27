package cl.dashund.ares;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

/** Abrir la app Google Maps navegando en auto (spec 020, research R5). Lo usan el
 *  plugin (los km en ARES) y la burbuja ("Navegar" con ARES atrás). */
final class GoogleMaps {

    private static final String PAQUETE = "com.google.android.apps.maps";

    private GoogleMaps() {}

    /**
     * Google Maps navegando hasta el punto (R5). Lo abre lo nativo para que funcione
     * también con ARES atrás; sin Google Maps, el enlace en el navegador. A Google va
     * el punto y, con pasos, los puntos de paso de la línea de ARES (FR-014).
     *
     * CLEAR_TASK: con la navegación en curso, un destino nuevo hace que Google Maps
     * pregunte "¿Salir de la navegación?", y si nadie toca, sigue a la parada ya
     * cerrada. Limpiando su tarea arranca derecho a la nueva (medido en el teléfono
     * del conductor, 2026-11-09).
     */
    static String navegar(Context contexto, double lat, double lng) {
        return navegar(contexto, lat, lng, java.util.Collections.emptyList());
    }

    /**
     * Con puntos de paso (dueño, 2026-11-25; APK 1.14.0): para que Google Maps llegue a
     * la parada en el sentido que planeó ARES, pasa antes por un punto de la línea de
     * ARES (geo/punto-de-paso.ts). `google.navigation:` no acepta puntos de paso: va
     * el enlace de direcciones, que la app Google Maps abre ya navegando
     * (dir_action=navigate; probado en el V2430, 2026-11-26).
     */
    static String navegar(Context contexto, double lat, double lng, java.util.List<String> pasos) {
        String punto = lat + "," + lng;
        String enlace = pasos.isEmpty()
            ? "google.navigation:q=" + punto + "&mode=d"
            : "https://www.google.com/maps/dir/?api=1&destination=" + punto
                + "&waypoints=" + android.text.TextUtils.join("%7C", pasos)
                + "&travelmode=driving&dir_action=navigate";
        Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse(enlace))
            .setPackage(PAQUETE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        try {
            contexto.startActivity(maps);
            return "maps";
        } catch (ActivityNotFoundException e) {
            // Sin Google Maps: el navegador.
        }
        Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse(pasos.isEmpty() ? "https://www.google.com/maps/dir/?api=1&destination=" + punto : enlace))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            contexto.startActivity(web);
        } catch (ActivityNotFoundException e) {
            // Nada que abra el enlace: no hay a dónde mandar al conductor.
        }
        return "navegador";
    }

    /**
     * Llamar desde la burbuja no tapa la navegación (el dueño, 2026-11-06): Google Maps
     * vuelve adelante con la llamada en curso (TrasLlamar). Se trae su tarea tal como
     * estaba, sin volver a pedirle la ruta.
     */
    static void alFrenteTrasLlamar(Context contexto) {
        Intent maps = new Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setPackage(PAQUETE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        // Si Google Maps está adelante no se puede saber: se trae a ratos (TrasLlamar).
        TrasLlamar.alFrente(contexto, maps, null);
    }
}
