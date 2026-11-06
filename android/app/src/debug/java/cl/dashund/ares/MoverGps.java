package cl.dashund.ares;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Criteria;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.SystemClock;

/**
 * Solo en la APK de depuración: pone la ubicación de todo el teléfono donde dice adb,
 * para probar en un teléfono real que Google Maps navega y la burbuja se abre al llegar,
 * sin manejar (spec 020, T017). Lo usa scripts/simular-recorrido.mjs.
 *
 * ARES tiene que ser la "app de ubicación de prueba" (el script lo deja así con
 * `appops set … android:mock_location allow`). PARAR_GPS devuelve el GPS real.
 */
public class MoverGps extends BroadcastReceiver {

    private static final String PARAR = "cl.dashund.ares.PARAR_GPS";

    /** Google Maps toma la ubicación de los proveedores de Android: se reemplazan todos. */
    private static String[] proveedores() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.FUSED_PROVIDER }
            : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER };
    }

    @Override
    public void onReceive(Context contexto, Intent intento) {
        LocationManager ubicaciones = (LocationManager) contexto.getSystemService(Context.LOCATION_SERVICE);
        if (ubicaciones == null) return;
        try {
            if (PARAR.equals(intento.getAction())) {
                for (String p : proveedores()) quitar(ubicaciones, p);
                setResultCode(0);
                return;
            }
            double lat = Double.parseDouble(intento.getStringExtra("lat"));
            double lng = Double.parseDouble(intento.getStringExtra("lng"));
            float rumbo = numero(intento.getStringExtra("rumbo"), -1f);
            float velocidad = numero(intento.getStringExtra("velocidad"), 0f);
            for (String p : proveedores()) {
                asegurar(ubicaciones, p);
                ubicaciones.setTestProviderLocation(p, ubicacion(p, lat, lng, rumbo, velocidad));
            }
            setResultCode(0);
        } catch (SecurityException e) {
            // ARES no es la app de ubicación de prueba.
            setResultCode(2);
        } catch (RuntimeException e) {
            setResultCode(1);
        }
    }

    @SuppressWarnings("deprecation")
    private static void asegurar(LocationManager ubicaciones, String proveedor) {
        try {
            ubicaciones.addTestProvider(proveedor, false, false, false, false, true, true, true,
                Criteria.POWER_LOW, Criteria.ACCURACY_FINE);
        } catch (IllegalArgumentException yaEstaba) {
            // Ya era de prueba.
        }
        ubicaciones.setTestProviderEnabled(proveedor, true);
    }

    private static void quitar(LocationManager ubicaciones, String proveedor) {
        try {
            ubicaciones.removeTestProvider(proveedor);
        } catch (IllegalArgumentException noEstaba) {
            // No era de prueba.
        }
    }

    private static Location ubicacion(String proveedor, double lat, double lng, float rumbo, float velocidad) {
        Location l = new Location(proveedor);
        l.setLatitude(lat);
        l.setLongitude(lng);
        l.setAltitude(30);
        l.setAccuracy(5f);
        l.setVerticalAccuracyMeters(5f);
        l.setSpeed(velocidad);
        l.setSpeedAccuracyMetersPerSecond(1f);
        if (rumbo >= 0) {
            l.setBearing(rumbo);
            l.setBearingAccuracyDegrees(5f);
        }
        l.setTime(System.currentTimeMillis());
        l.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
        return l;
    }

    private static float numero(String texto, float siNo) {
        if (texto == null) return siNo;
        try {
            return Float.parseFloat(texto);
        } catch (NumberFormatException e) {
            return siNo;
        }
    }
}
