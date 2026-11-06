package cl.dashund.ares;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Puente entre la web y la burbuja (spec 020). La web manda la vista de la parada
 * activa y recibe cada toque como evento `toque`; quien dibuja es BurbujaServicio.
 * Le avisa al servicio cuándo ARES está adelante, para ocultar la burbuja (R7).
 * Contrato: specs/020-burbuja-google-maps/contracts/burbuja.md.
 */
@CapacitorPlugin(name = "Burbuja")
public class BurbujaPlugin extends Plugin {

    @Override
    public void load() {
        BurbujaServicio.escuchar(id -> {
            JSObject datos = new JSObject();
            datos.put("id", id);
            notifyListeners("toque", datos);
        }, () -> {
            // Con la burbuja en curso la página no se congela atrás (WebViewAres).
            if (getBridge().getWebView() instanceof WebViewAres) {
                ((WebViewAres) getBridge().getWebView()).actualizarVisibilidad();
            }
        });
    }

    /** ARES adelante: la burbuja repetiría la tarjeta. */
    @Override
    protected void handleOnResume() {
        BurbujaServicio.fijarAresAdelante(true);
    }

    /** ARES atrás (Google Maps, otra app, el teléfono bloqueado): la burbuja aparece. */
    @Override
    protected void handleOnStop() {
        BurbujaServicio.fijarAresAdelante(false);
    }

    @PluginMethod
    public void permiso(PluginCall call) {
        call.resolve(estadoPermiso());
    }

    /** Abre "Mostrar sobre otras apps" de ARES y resuelve al volver, con o sin permiso (R10). */
    @PluginMethod
    public void pedirPermiso(PluginCall call) {
        if (Settings.canDrawOverlays(getContext())) {
            call.resolve(estadoPermiso());
            return;
        }
        Intent ajuste = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:" + getContext().getPackageName()));
        try {
            startActivityForResult(call, ajuste, "trasPedirPermiso");
        } catch (ActivityNotFoundException e) {
            call.resolve(estadoPermiso());
        }
    }

    @ActivityCallback
    private void trasPedirPermiso(PluginCall call, ActivityResult resultado) {
        // El ajuste siempre vuelve "cancelado": lo que vale es si quedó dado.
        if (call != null) call.resolve(estadoPermiso());
    }

    @PluginMethod
    public void mostrar(PluginCall call) {
        JSObject vista = call.getObject("vista");
        if (vista == null || vista.optString("titulo").isEmpty()) {
            call.reject("vista_invalida");
            return;
        }
        if (!Settings.canDrawOverlays(getContext())) {
            call.reject("sin_permiso");
            return;
        }
        BurbujaServicio.mostrar(getContext(), vista);
        call.resolve();
    }

    @PluginMethod
    public void terminar(PluginCall call) {
        BurbujaServicio.terminar();
        call.resolve();
    }

    /** true mientras ARES abre una pantalla suya (escáner, cámara). */
    @PluginMethod
    public void enAres(PluginCall call) {
        BurbujaServicio.fijarEnAres(Boolean.TRUE.equals(call.getBoolean("valor", false)));
        call.resolve();
    }

    @PluginMethod
    public void navegar(PluginCall call) {
        // Como en TelefonoPlugin: getDouble no lee un número que llega como entero.
        Object lat = call.getData().opt("lat");
        Object lng = call.getData().opt("lng");
        if (!(lat instanceof Number) || !(lng instanceof Number)) {
            call.reject("sin_punto");
            return;
        }
        JSObject respuesta = new JSObject();
        respuesta.put("via", GoogleMaps.navegar(getContext(), ((Number) lat).doubleValue(), ((Number) lng).doubleValue()));
        call.resolve(respuesta);
    }

    private JSObject estadoPermiso() {
        JSObject estado = new JSObject();
        estado.put("estado", Settings.canDrawOverlays(getContext()) ? "dado" : "falta");
        return estado;
    }
}
