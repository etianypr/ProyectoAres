package cl.dashund.ares;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/** El aviso fijo del servicio de la burbuja (spec 020, R2): dice solo el número de parada,
 *  porque se ve con el teléfono bloqueado. Tocarlo trae ARES. */
final class BurbujaAviso {

    private static final String CANAL = "burbuja";

    private BurbujaAviso() {}

    static void crearCanal(Context contexto) {
        NotificationManager avisos = contexto.getSystemService(NotificationManager.class);
        if (avisos == null) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Burbuja de la parada", NotificationManager.IMPORTANCE_LOW);
        canal.setShowBadge(false);
        avisos.createNotificationChannel(canal);
    }

    static Notification de(Context contexto, int secuencia, Intent abrirAres) {
        PendingIntent abrir = PendingIntent.getActivity(contexto, 0, abrirAres,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(contexto, CANAL)
            .setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle(secuencia > 0 ? "ARES · Parada " + secuencia : "ARES")
            .setContentIntent(abrir)
            .setOngoing(true)
            .setShowWhen(false)
            .build();
    }
}
