package cl.pucarani.ares;

import android.Manifest;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.Uri;
import android.provider.CallLog;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Teléfono del conductor (spec 015): llamar directo, leer el registro de llamadas,
 * mantener la pantalla encendida, leer el texto de una foto (ML Kit, en el
 * teléfono; spec 005) y decir en voz alta las indicaciones de manejo (spec 017).
 * Contrato: specs/015-app-android/contracts/nativo.md.
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

    /** Avisos de manejo: Android baja la música en vez de pausarla y los manda
     *  por el canal de navegación (el que respeta el auto por Bluetooth). */
    private static final AudioAttributes AUDIO_NAVEGACION = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
        .build();

    private TextToSpeech voz;
    /** null = el motor de voz todavía arranca; true = listo; false = el teléfono no tiene. */
    private Boolean vozLista = null;
    /** Lo pedido mientras el motor arrancaba: [texto, "urgente" o ""]. */
    private final List<String[]> porDecir = new ArrayList<>();
    /** Avisos encolados o sonando: mientras haya alguno se baja el volumen de lo demás. */
    private final Set<String> sonando = new HashSet<>();
    private AudioFocusRequest foco;
    private int numeroAviso = 0;

    @Override
    public void load() {
        // El motor tarda alrededor de un segundo en arrancar: se prende al abrir la
        // app para que el primer aviso del día no se pierda esperándolo.
        voz = new TextToSpeech(getContext(), estado -> {
            synchronized (this) {
                vozLista = estado == TextToSpeech.SUCCESS && voz != null && elegirIdioma();
                if (Boolean.TRUE.equals(vozLista)) {
                    voz.setAudioAttributes(AUDIO_NAVEGACION);
                    voz.setOnUtteranceProgressListener(new AlTerminarAviso());
                    for (String[] p : porDecir) decir(p[0], !p[1].isEmpty());
                }
                porDecir.clear();
            }
        });
        foco = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(AUDIO_NAVEGACION)
            .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (voz != null) voz.shutdown();
    }

    /** Español de Chile si el teléfono lo tiene; si no, cualquier español. */
    private boolean elegirIdioma() {
        for (String idioma : new String[] { "es-CL", "es-US", "es-419", "es-ES", "es" }) {
            int r = voz.setLanguage(Locale.forLanguageTag(idioma));
            if (r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED) return true;
        }
        return false;
    }

    /**
     * Dice un aviso de manejo. "urgente" corta lo que esté sonando (el giro que
     * viene ya); si no, se encola detrás, para que un aviso lejano del tramo
     * siguiente no corte "gire a la derecha" a la mitad.
     */
    @PluginMethod
    public void hablar(PluginCall call) {
        String texto = call.getString("texto", "");
        boolean urgente = Boolean.TRUE.equals(call.getBoolean("urgente", false));
        synchronized (this) {
            if (Boolean.FALSE.equals(vozLista)) {
                call.reject("sin_voz");
                return;
            }
            if (texto != null && !texto.trim().isEmpty()) {
                if (vozLista == null) {
                    if (urgente) porDecir.clear();
                    porDecir.add(new String[] { texto, urgente ? "urgente" : "" });
                } else {
                    decir(texto, urgente);
                }
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void callar(PluginCall call) {
        synchronized (this) {
            porDecir.clear();
            if (Boolean.TRUE.equals(vozLista)) voz.stop();
        }
        call.resolve();
    }

    private void decir(String texto, boolean urgente) {
        String id = "aviso-" + (++numeroAviso);
        if (sonando.isEmpty()) audio().requestAudioFocus(foco);
        sonando.add(id);
        int r = voz.speak(texto, urgente ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, id);
        if (r != TextToSpeech.SUCCESS) terminado(id);
    }

    private synchronized void terminado(String id) {
        sonando.remove(id);
        if (sonando.isEmpty()) audio().abandonAudioFocusRequest(foco);
    }

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(android.content.Context.AUDIO_SERVICE);
    }

    /** Devuelve el volumen de la música al terminar el último aviso. */
    private class AlTerminarAviso extends UtteranceProgressListener {
        @Override
        public void onStart(String id) {}

        @Override
        public void onDone(String id) {
            terminado(id);
        }

        @Override
        public void onError(String id) {
            terminado(id);
        }

        @Override
        public void onStop(String id, boolean interrumpido) {
            terminado(id);
        }
    }

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
