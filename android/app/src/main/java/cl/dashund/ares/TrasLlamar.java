package cl.dashund.ares;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.util.function.BooleanSupplier;

/**
 * Las llamadas quedan de fondo (el dueño, 2026-11-06 y 2026-11-09): apenas la llamada
 * está en curso, vuelve adelante lo que el conductor estaba usando, ARES o Google Maps,
 * y la llamada sigue (se retoma desde la barra de arriba). Si la llamada no salió (sin
 * permiso, se abrió el marcador), no hace nada.
 *
 * Vigila unos segundos, no un solo intento (dueño, 2026-11-27: «hay veces que no se llama
 * en segundo plano»). Medido en el V2430 (Android 16): la pantalla de la llamada del
 * teléfono aparece hasta 3 s DESPUÉS de que el audio pasa a llamada. Antes se traía ARES
 * una vez a los 1,2 s y se terminaba: si esa pantalla llegaba después, tapaba a ARES
 * hasta colgar. Ahora, mientras dura la llamada y por {@link #MS_VIGILAR}, se vuelve a
 * traer cada vez que algo la tapa (con ARES se sabe; con Google Maps se trae a ratos).
 */
final class TrasLlamar {

    private static final long MS_PASO = 500;
    /** Lo que se espera a que la llamada empiece: elegir la SIM o un marcador lento. */
    private static final long MS_ESPERA_LLAMADA = 20_000;
    /** Desde que empieza la llamada, cuánto se vigila: la pantalla de la llamada puede
     *  llegar tarde. Después, si el conductor abre la llamada, se queda ahí. */
    private static final long MS_VIGILAR = 9_000;
    /** Sin saber si está adelante (Google Maps), cada cuánto se vuelve a traer. */
    private static final long MS_ENTRE_TRAIDAS_A_CIEGAS = 1_500;
    private static final int MAX_TRAIDAS = 6;

    private TrasLlamar() {}

    /**
     * Trae `destino` adelante con la llamada en curso. `adelante` dice si ya está adelante
     * (null = no se puede saber: Google Maps).
     */
    static void alFrente(Context contexto, Intent destino, BooleanSupplier adelante) {
        Context app = contexto.getApplicationContext();
        Handler principal = new Handler(Looper.getMainLooper());
        long inicio = SystemClock.uptimeMillis();
        long[] enLlamadaDesde = { -1 };
        long[] ultimaTraida = { -1 };
        int[] traidas = { 0 };
        Runnable[] paso = new Runnable[1];
        paso[0] = () -> {
            long ahora = SystemClock.uptimeMillis();
            boolean llamando = enLlamada(app);
            if (enLlamadaDesde[0] < 0) {
                if (!llamando) {
                    // Todavía marcando (o no salió): se espera un rato y nada más.
                    if (ahora - inicio < MS_ESPERA_LLAMADA) principal.postDelayed(paso[0], MS_PASO);
                    return;
                }
                enLlamadaDesde[0] = ahora;
            } else if (!llamando) {
                return; // Colgó: ya no hay nada que tapar.
            }
            if (ahora - enLlamadaDesde[0] > MS_VIGILAR || traidas[0] >= MAX_TRAIDAS) return;
            boolean traer = adelante != null
                ? !adelante.getAsBoolean()
                : ultimaTraida[0] < 0 || ahora - ultimaTraida[0] >= MS_ENTRE_TRAIDAS_A_CIEGAS;
            if (traer) {
                try {
                    app.startActivity(destino);
                    traidas[0]++;
                    ultimaTraida[0] = ahora;
                } catch (RuntimeException e) {
                    // Android no lo dejó: la llamada sigue igual, adelante.
                }
            }
            principal.postDelayed(paso[0], MS_PASO);
        };
        principal.postDelayed(paso[0], MS_PASO);
    }

    /** ARES tal como estaba (singleTask): no recarga la página. */
    static Intent ares(Context contexto) {
        return new Intent(contexto, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    }

    /** En llamada: el modo de audio de la llamada de teléfono o el de una por internet
     *  (algunos teléfonos usan este con VoLTE o Wi-Fi). */
    private static boolean enLlamada(Context contexto) {
        AudioManager audio = (AudioManager) contexto.getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return false;
        int modo = audio.getMode();
        return modo == AudioManager.MODE_IN_CALL || modo == AudioManager.MODE_IN_COMMUNICATION;
    }
}
