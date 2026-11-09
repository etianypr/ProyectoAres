package cl.dashund.ares;

import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;

/**
 * Las llamadas quedan de fondo (el dueño, 2026-11-06 y 2026-11-09): apenas la llamada
 * está en curso, vuelve adelante lo que el conductor estaba usando, ARES o Google Maps,
 * y la llamada sigue (se retoma desde la barra de arriba). Si la llamada no salió (sin
 * permiso, se abrió el marcador), no hace nada.
 */
final class TrasLlamar {

    private static final long MS_ENTRE_INTENTOS = 1200;
    private static final int INTENTOS = 4;

    private TrasLlamar() {}

    static void alFrente(Context contexto, Intent destino) {
        Context app = contexto.getApplicationContext();
        Handler principal = new Handler(Looper.getMainLooper());
        Runnable[] intento = new Runnable[1];
        int[] quedan = { INTENTOS };
        intento[0] = () -> {
            if (enLlamada(app)) {
                try {
                    app.startActivity(destino);
                } catch (RuntimeException e) {
                    // Android no lo dejó: la llamada sigue igual, adelante.
                }
            } else if (--quedan[0] > 0) {
                principal.postDelayed(intento[0], MS_ENTRE_INTENTOS);
            }
        };
        principal.postDelayed(intento[0], MS_ENTRE_INTENTOS);
    }

    /** ARES tal como estaba (singleTask): no recarga la página. */
    static Intent ares(Context contexto) {
        return new Intent(contexto, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    }

    private static boolean enLlamada(Context contexto) {
        AudioManager audio = (AudioManager) contexto.getSystemService(Context.AUDIO_SERVICE);
        return audio != null && audio.getMode() == AudioManager.MODE_IN_CALL;
    }
}
