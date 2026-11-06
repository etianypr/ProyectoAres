package cl.dashund.ares;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * Avisa cuando el auto llega a la parada activa, para abrir la burbuja: navegando va
 * achicada y abierta sirve al llegar (el dueño, 2026-11-05; spec 020, FR-016).
 *
 * Escucha la ubicación PASIVA de Android: la que Google Maps ya está pidiendo para
 * navegar, sin prender el GPS por su cuenta. Solo mientras la burbuja está en curso, y
 * solo para esto: la posición se compara acá con el punto de la parada y no se guarda
 * ni sale del teléfono.
 */
final class BurbujaLlegada implements LocationListener {

    interface AlLlegar {
        void llego();
    }

    /** "Llegó" = a esta distancia del punto de la parada o menos. */
    private static final float METROS_LLEGADA = 50f;
    /** Una lectura con más error que esto no dice si llegó. */
    private static final float PRECISION_MAXIMA_M = 100f;
    private static final long MS_ENTRE_LECTURAS = 2000;
    private static final float METROS_ENTRE_LECTURAS = 5f;

    private final LocationManager ubicaciones;
    private final AlLlegar alLlegar;
    private String parada;
    private double lat;
    private double lng;
    private boolean avisado;

    BurbujaLlegada(Context contexto, AlLlegar alLlegar) {
        this.ubicaciones = (LocationManager) contexto.getSystemService(Context.LOCATION_SERVICE);
        this.alLlegar = alLlegar;
    }

    static boolean hayPermiso(Context contexto) {
        return ContextCompat.checkSelfPermission(contexto, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(contexto, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    /** Sin permiso de ubicación no hay aviso: la burbuja se abre tocándola. */
    void empezar(Context contexto) {
        if (ubicaciones == null || !hayPermiso(contexto)) return;
        try {
            ubicaciones.requestLocationUpdates(
                LocationManager.PASSIVE_PROVIDER, MS_ENTRE_LECTURAS, METROS_ENTRE_LECTURAS, this, Looper.getMainLooper());
        } catch (SecurityException | IllegalArgumentException e) {
            // Sin proveedor pasivo o sin permiso: sin aviso de llegada.
        }
    }

    void parar() {
        if (ubicaciones == null) return;
        try {
            ubicaciones.removeUpdates(this);
        } catch (RuntimeException e) {
            // Ya no escuchaba.
        }
    }

    /** La parada a la que se va. Una distinta vuelve a habilitar el aviso: se abre una
     *  vez por parada, y si el conductor la achica no se vuelve a abrir sola. */
    void destino(int secuencia, JSONObject punto) {
        if (punto == null) {
            parada = null;
            return;
        }
        String clave = secuencia + ":" + punto.optDouble("lat") + "," + punto.optDouble("lng");
        if (clave.equals(parada)) return;
        parada = clave;
        lat = punto.optDouble("lat");
        lng = punto.optDouble("lng");
        avisado = false;
    }

    @Override
    public void onLocationChanged(Location aqui) {
        if (parada == null || avisado) return;
        if (aqui.hasAccuracy() && aqui.getAccuracy() > PRECISION_MAXIMA_M) return;
        float[] metros = new float[1];
        Location.distanceBetween(aqui.getLatitude(), aqui.getLongitude(), lat, lng, metros);
        if (metros[0] > METROS_LLEGADA) return;
        avisado = true;
        alLlegar.llego();
    }

    // En Android 10 estos tres no tienen cuerpo por defecto: sin ellos, el sistema
    // los llamaría y la app se caería.
    @Override
    public void onStatusChanged(String proveedor, int estado, Bundle extras) {}

    @Override
    public void onProviderEnabled(String proveedor) {}

    @Override
    public void onProviderDisabled(String proveedor) {}
}
