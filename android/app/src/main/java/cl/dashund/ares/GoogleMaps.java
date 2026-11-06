package cl.dashund.ares;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;

/** Abrir la app Google Maps navegando en auto (spec 020, research R5). Lo usan el
 *  plugin (los km en ARES) y la burbuja ("Navegar" con ARES atrás). */
final class GoogleMaps {

    private static final String PAQUETE = "com.google.android.apps.maps";
    private static final long MS_ENTRE_INTENTOS = 1200;
    private static final int INTENTOS = 4;

    private GoogleMaps() {}

    /**
     * Google Maps navegando hasta el punto (R5). Lo abre lo nativo para que funcione
     * también con ARES atrás; sin Google Maps, el enlace en el navegador. A Google va
     * solo el punto (FR-014).
     */
    static String navegar(Context contexto, double lat, double lng) {
        String punto = lat + "," + lng;
        Intent maps = new Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=" + punto + "&mode=d"))
            .setPackage(PAQUETE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
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
     * Llamar desde la burbuja no tapa la navegación (el dueño, 2026-11-06): apenas la
     * llamada está en curso, Google Maps vuelve adelante y la llamada sigue de fondo.
     * Se trae la tarea de Google Maps tal como estaba, sin volver a pedirle la ruta (eso
     * mostraría "¿Salir de la navegación?"). Si la llamada no salió (sin permiso, se
     * abrió el marcador), no hace nada.
     */
    static void alFrenteTrasLlamar(Context contexto) {
        Context app = contexto.getApplicationContext();
        Handler principal = new Handler(Looper.getMainLooper());
        Runnable[] intento = new Runnable[1];
        int[] quedan = { INTENTOS };
        intento[0] = () -> {
            if (enLlamada(app)) {
                alFrente(app);
            } else if (--quedan[0] > 0) {
                principal.postDelayed(intento[0], MS_ENTRE_INTENTOS);
            }
        };
        principal.postDelayed(intento[0], MS_ENTRE_INTENTOS);
    }

    private static void alFrente(Context contexto) {
        Intent maps = new Intent(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .setPackage(PAQUETE)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try {
            contexto.startActivity(maps);
        } catch (RuntimeException e) {
            // Sin Google Maps o Android no lo dejó: la llamada sigue igual.
        }
    }

    private static boolean enLlamada(Context contexto) {
        AudioManager audio = (AudioManager) contexto.getSystemService(Context.AUDIO_SERVICE);
        return audio != null && audio.getMode() == AudioManager.MODE_IN_CALL;
    }
}
