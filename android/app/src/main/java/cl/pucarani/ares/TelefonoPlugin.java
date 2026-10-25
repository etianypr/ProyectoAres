package cl.pucarani.ares;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.CallLog;
import android.util.Base64;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Teléfono del conductor (spec 015): llamar directo, leer el registro de llamadas,
 * mantener la pantalla encendida y leer el texto de una foto (ML Kit, en el
 * teléfono; spec 005). Contrato: specs/015-app-android/contracts/nativo.md.
 *
 * Del registro de llamadas solo se devuelven las llamadas al número consultado, sin
 * el número; nada de esto sale del teléfono.
 */
@CapacitorPlugin(
    name = "Telefono",
    permissions = {
        @Permission(alias = "llamadas", strings = { Manifest.permission.CALL_PHONE }),
        @Permission(alias = "registro", strings = { Manifest.permission.READ_CALL_LOG }),
        // Solo para el diagnóstico: el WebView no trae navigator.permissions. La
        // ubicación la pide el WebView al usarla.
        @Permission(alias = "ubicacion", strings = { Manifest.permission.ACCESS_FINE_LOCATION })
    }
)
public class TelefonoPlugin extends Plugin {

    private static final int MAX_LLAMADAS = 5;

    @PluginMethod
    public void llamar(PluginCall call) {
        if (call.getString("numero", "").isEmpty()) {
            call.reject("numero_vacio");
            return;
        }
        if (getPermissionState("llamadas") != PermissionState.GRANTED) {
            requestPermissionForAlias("llamadas", call, "trasPermisoLlamar");
            return;
        }
        hacerLlamada(call);
    }

    @PermissionCallback
    private void trasPermisoLlamar(PluginCall call) {
        if (getPermissionState("llamadas") != PermissionState.GRANTED) {
            call.reject("permiso_denegado");
            return;
        }
        hacerLlamada(call);
    }

    private void hacerLlamada(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(call.getString("numero"))));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("sin_soporte");
        }
    }

    @PluginMethod
    public void llamadasDesde(PluginCall call) {
        if (getPermissionState("registro") != PermissionState.GRANTED) {
            requestPermissionForAlias("registro", call, "trasPermisoRegistro");
            return;
        }
        leerRegistro(call);
    }

    @PermissionCallback
    private void trasPermisoRegistro(PluginCall call) {
        if (getPermissionState("registro") != PermissionState.GRANTED) {
            call.reject("permiso_denegado");
            return;
        }
        leerRegistro(call);
    }

    private void leerRegistro(PluginCall call) {
        String buscado = ultimos8(call.getString("numero", ""));
        // getDouble devuelve el valor por defecto si el número llega como entero
        // largo, y una hora en milisegundos siempre llega así: se lee cualquier número.
        Object crudo = call.getData().opt("desdeMs");
        long desde = crudo instanceof Number ? ((Number) crudo).longValue() : 0L;
        JSArray llamadas = new JSArray();

        if (!buscado.isEmpty()) {
            String[] columnas = { CallLog.Calls.NUMBER, CallLog.Calls.DURATION, CallLog.Calls.TYPE, CallLog.Calls.DATE };
            try (Cursor fila = getContext().getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                columnas,
                CallLog.Calls.DATE + " >= ?",
                new String[] { String.valueOf(desde) },
                CallLog.Calls.DATE + " DESC"
            )) {
                while (fila != null && fila.moveToNext() && llamadas.length() < MAX_LLAMADAS) {
                    if (!ultimos8(fila.getString(0)).equals(buscado)) continue;
                    JSObject llamada = new JSObject();
                    llamada.put("duracionS", fila.getLong(1));
                    llamada.put("tipo", tipo(fila.getInt(2)));
                    llamada.put("fechaMs", fila.getLong(3));
                    llamadas.put(llamada);
                }
            } catch (SecurityException e) {
                call.reject("permiso_denegado");
                return;
            }
        }

        JSObject respuesta = new JSObject();
        respuesta.put("llamadas", llamadas);
        call.resolve(respuesta);
    }

    @PluginMethod
    public void pantallaEncendida(PluginCall call) {
        boolean encendida = Boolean.TRUE.equals(call.getBoolean("encendida", false));
        getActivity().runOnUiThread(() -> {
            if (encendida) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }

    /**
     * El texto de una foto (guía o etiqueta), leído en el teléfono con el modelo
     * latino de ML Kit que viaja dentro de la APK: sin red, sin costo y sin que la
     * foto salga del teléfono. Recibe el JPEG en base64 y devuelve el texto en
     * orden de lectura, un renglón por línea.
     */
    @PluginMethod
    public void leerTexto(PluginCall call) {
        String base64 = call.getString("imagen");
        if (base64 == null || base64.isEmpty()) {
            call.reject("Falta la imagen.");
            return;
        }
        Bitmap foto;
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            foto = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            foto = null;
        }
        if (foto == null) {
            call.reject("La imagen no se pudo abrir.");
            return;
        }
        TextRecognizer lector = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        lector
            .process(InputImage.fromBitmap(foto, 0))
            .addOnSuccessListener(texto -> {
                JSObject respuesta = new JSObject();
                respuesta.put("texto", texto.getText());
                call.resolve(respuesta);
            })
            .addOnFailureListener(e -> call.reject("No se pudo leer el texto."))
            .addOnCompleteListener(t -> lector.close());
    }

    /** Los últimos 8 dígitos: el mismo número con o sin +56, espacios o guiones. */
    private static String ultimos8(String numero) {
        if (numero == null) return "";
        String digitos = numero.replaceAll("\\D", "");
        return digitos.length() <= 8 ? digitos : digitos.substring(digitos.length() - 8);
    }

    private static String tipo(int tipo) {
        switch (tipo) {
            case CallLog.Calls.OUTGOING_TYPE:
                return "saliente";
            case CallLog.Calls.INCOMING_TYPE:
                return "entrante";
            case CallLog.Calls.MISSED_TYPE:
                return "perdida";
            default:
                return "otra";
        }
    }
}
