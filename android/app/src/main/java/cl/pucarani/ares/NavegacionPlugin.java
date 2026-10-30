package cl.pucarani.ares;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Abre la navegación de Google dentro de ARES hasta una parada (spec 019; pantalla en
 * NavegacionActivity) y devuelve cómo terminó: "llego", "volvio", "error" o
 * "no_disponible" (la APK se compiló sin clave de Google). Contrato:
 * specs/015-app-android/contracts/nativo.md.
 */
@CapacitorPlugin(name = "Navegacion")
public class NavegacionPlugin extends Plugin {

    private static final String CLAVE_MAPS = "com.google.android.geo.API_KEY";

    @PluginMethod
    public void navegar(PluginCall call) {
        Double lat = call.getDouble("lat");
        Double lng = call.getDouble("lng");
        if (lat == null || lng == null) {
            call.reject("Falta el destino");
            return;
        }
        if (!tieneClave()) {
            resolver(call, "no_disponible", "sin_clave");
            return;
        }
        Intent pantalla = new Intent(getContext(), NavegacionActivity.class)
            .putExtra(NavegacionActivity.EXTRA_LAT, lat.doubleValue())
            .putExtra(NavegacionActivity.EXTRA_LNG, lng.doubleValue())
            .putExtra(NavegacionActivity.EXTRA_TITULO, call.getString("titulo", ""))
            .putExtra(NavegacionActivity.EXTRA_DETALLE, call.getString("detalle", ""))
            .putExtra(NavegacionActivity.EXTRA_SIMULAR, Boolean.TRUE.equals(call.getBoolean("simular", false)));
        startActivityForResult(call, pantalla, "alVolver");
    }

    @ActivityCallback
    private void alVolver(PluginCall call, ActivityResult resultado) {
        if (call == null) return;
        Intent datos = resultado.getData();
        String como = datos != null ? datos.getStringExtra(NavegacionActivity.RESULTADO) : null;
        String motivo = datos != null ? datos.getStringExtra(NavegacionActivity.MOTIVO) : null;
        // Cerrada sin pasar por terminar (el sistema la mató): cuenta como volver.
        resolver(call, como != null ? como : "volvio", motivo);
    }

    private void resolver(PluginCall call, String como, String motivo) {
        JSObject r = new JSObject();
        r.put("resultado", como);
        r.put("motivo", motivo);
        call.resolve(r);
    }

    /** La clave entra al compilar (MAPS_API_KEY): sin ella no se abre la pantalla. */
    private boolean tieneClave() {
        try {
            ApplicationInfo info = getContext().getPackageManager()
                .getApplicationInfo(getContext().getPackageName(), PackageManager.GET_META_DATA);
            String clave = info.metaData != null ? info.metaData.getString(CLAVE_MAPS) : null;
            return clave != null && !clave.isEmpty();
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
