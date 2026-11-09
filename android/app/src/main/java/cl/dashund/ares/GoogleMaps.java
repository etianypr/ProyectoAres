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
     * solo el punto (FR-014).
     *
     * CLEAR_TASK: con la navegación en curso, un destino nuevo hace que Google Maps
     * pregunte "¿Salir de la navegación?", y si nadie toca, sigue a la parada ya
     * cerrada. Limpiando su tarea arranca derecho a la nueva (medido en el teléfono
     * del conductor, 2026-11-09).
     */
    static String navegar(Context contexto, double lat, double lng) {
        String punto = lat + "," + lng;
        Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + punto + "&mode=d"))
            .setPackage(PAQUETE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        try {
            contexto.startActivity(maps);
            return "maps";
        } catch (ActivityNotFoundException e) {
            // Sin Google Maps: el navegador.
        }
        Intent web = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=" + punto))
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
        TrasLlamar.alFrente(contexto, maps);
    }
}
