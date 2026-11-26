package cl.dashund.ares;

import android.Manifest;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.RectF;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CaptureRequest;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.util.Range;
import android.util.Rational;
import android.util.Size;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.OptIn;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExposureState;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.core.UseCaseGroup;
import androidx.camera.core.ViewPort;
import androidx.camera.core.resolutionselector.AspectRatioStrategy;
import androidx.camera.core.resolutionselector.ResolutionSelector;
import androidx.camera.core.resolutionselector.ResolutionStrategy;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Escáner de etiquetas en vivo (spec 028). La cámara queda DEBAJO de la WebView, que
 * se vuelve transparente: la pantalla la sigue dibujando ARES (React), y la WebView
 * sigue al frente, así no se congela como cuando queda atrás (spec 020). Mismo
 * patrón que startScan de @capacitor-mlkit/barcode-scanning (Apache-2.0).
 *
 * Por cada cuadro manda el evento "cuadro": los códigos que vio ML Kit y los
 * renglones de texto con su caja, ya derechos. Todo en el teléfono, sin red. Ningún
 * dato de un cuadro se escribe en el log: trae el nombre y el teléfono de una
 * persona.
 */
@CapacitorPlugin(
    name = "EscanerVivo",
    permissions = { @Permission(alias = "camara", strings = { Manifest.permission.CAMERA }) }
)
public class EscanerVivoPlugin extends Plugin {

    /** Cuadros de análisis: la letra chica de la etiqueta necesita píxeles (spec 028, medir). */
    private static final Size RESOLUCION = new Size(1920, 1080);

    /** La captura en alta: la foto del paquete y una lectura más fina (spec 028). */
    private static final int LADO_CAPTURA = 2400;

    private ProcessCameraProvider proveedor;
    private Camera camara;
    private ImageCapture captura;
    private PreviewView vista;
    private MarcasEscaner marcas;
    private BarcodeScanner codigos;
    private TextRecognizer lector;
    private ExecutorService hilo;
    /** La lectura de cada cuadro (LectorCuadros.java, spec 036). Sabe, por cada cuadro, cómo
     *  pasar del cuadro ya derecho (las cajas que van a la web) al sensor: con la del sensor
     *  a la vista previa, las marcas de la web quedan encima del texto aunque la vista previa
     *  y el análisis tengan otra forma. */
    private volatile LectorCuadros lectura;
    /** La foto del paquete sale del cuadro que se está leyendo, sin `ImageCapture` (opción
     *  `foto: "cuadro"`, fotos del dueño 2026-11-25): con las tres salidas el V2430 bajaba los
     *  cuadros a 720×960 y sacar la foto en alta congelaba la cámara unos segundos. */
    private volatile boolean fotoDelCuadro;

    @PluginMethod
    public void iniciar(PluginCall call) {
        if (getPermissionState("camara") != PermissionState.GRANTED) {
            requestPermissionForAlias("camara", call, "trasPermisoCamara");
            return;
        }
        getActivity().runOnUiThread(() -> arrancar(call));
    }

    @PermissionCallback
    private void trasPermisoCamara(PluginCall call) {
        if (getPermissionState("camara") != PermissionState.GRANTED) {
            call.reject("permiso_denegado");
            return;
        }
        getActivity().runOnUiThread(() -> arrancar(call));
    }

    @PluginMethod
    public void detener(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            apagar();
            call.resolve();
        });
    }

    @Override
    protected void handleOnDestroy() {
        apagar();
    }

    @PluginMethod
    public void linterna(PluginCall call) {
        Boolean encendida = call.getBoolean("encendida", false);
        getActivity().runOnUiThread(() -> {
            if (camara == null || !camara.getCameraInfo().hasFlashUnit()) {
                call.reject("sin_linterna");
                return;
            }
            camara.getCameraControl().enableTorch(Boolean.TRUE.equals(encendida));
            call.resolve();
        });
    }

    /** El texto de los cuadros siguientes se lee con este giro extra (0, 90, 180 o 270): la
     *  etiqueta al revés o de costado. Decide la web (sesion-viva.ts). */
    @PluginMethod
    public void girarTexto(PluginCall call) {
        Integer grados = call.getInt("grados", 0);
        LectorCuadros lecturaAhora = lectura;
        if (lecturaAhora != null) lecturaAhora.girarTexto(grados != null ? grados : 0);
        call.resolve();
    }

    /** Vibración corta: la etiqueta quedó leída (spec 028). El sonido lo hace la
     *  web (sonidos-escaner.ts, el que eligió el dueño), así no suena doble. */
    @PluginMethod
    public void avisar(PluginCall call) {
        Vibrator vibrador = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrador != null && vibrador.hasVibrator()) vibrador.vibrate(VibrationEffect.createOneShot(90, VibrationEffect.DEFAULT_AMPLITUDE));
        call.resolve();
    }

    /** Los recuadros de lo que está leyendo (la nómina, dueño 2026-11-11): la web manda
     *  las cajas del cuadro, en sus coordenadas ya derechas, con su tipo
     *  ("confirmada", "leyendo", "hueco" o "texto") y la etiqueta que va arriba (la OF), y
     *  se dibujan encima de la vista previa.
     *
     *  Spec 036: también las flechas a lo que falta (`flechas`: sentido, tipo y etiqueta),
     *  que van dentro de `zona`, la parte del recuadro que no tapa la pantalla (en
     *  fracciones de la WebView). Responde `pantalla`: dónde cae el cuadro entero en la
     *  WebView, en fracciones, para que la web sepa qué encargos se ven en el recuadro. Lo
     *  nuevo se lee con opt: si viene mal, los recuadros se dibujan igual. */
    @PluginMethod
    public void marcar(PluginCall call) {
        JSArray cajas = call.getArray("cajas");
        List<float[]> rects = new ArrayList<>();
        List<String> tipos = new ArrayList<>();
        List<String> etiquetas = new ArrayList<>();
        try {
            for (int i = 0; cajas != null && i < cajas.length(); i++) {
                JSONObject c = cajas.getJSONObject(i);
                float x = (float) c.getDouble("x");
                float y = (float) c.getDouble("y");
                rects.add(new float[] { x, y, x + (float) c.getDouble("ancho"), y + (float) c.getDouble("alto") });
                tipos.add(c.optString("tipo", "texto"));
                etiquetas.add(c.has("etiqueta") ? c.getString("etiqueta") : null);
            }
        } catch (JSONException e) {
            call.reject("cajas_invalidas");
            return;
        }
        JSObject zona = call.getObject("zona");
        List<MarcasEscaner.Flecha> flechas = new ArrayList<>();
        JSArray conFlechas = call.getArray("flechas");
        for (int i = 0; conFlechas != null && i < conFlechas.length(); i++) {
            JSONObject f = conFlechas.optJSONObject(i);
            String etiqueta = f != null ? f.optString("etiqueta", "") : "";
            if (!etiqueta.isEmpty()) flechas.add(new MarcasEscaner.Flecha(f.optString("sentido", "arriba"), f.optString("tipo", "falta"), etiqueta));
        }
        getActivity().runOnUiThread(() -> {
            LectorCuadros lecturaAhora = lectura;
            Matrix aSensor = lecturaAhora != null ? lecturaAhora.derechoASensor() : null;
            Matrix sensorAVista = vista != null ? vista.getSensorToViewTransform() : null;
            View web = getBridge().getWebView();
            if (marcas == null || aSensor == null || sensorAVista == null || web == null || web.getWidth() <= 0 || web.getHeight() <= 0) {
                call.resolve();
                return;
            }
            Matrix aVista = new Matrix(aSensor);
            aVista.postConcat(sensorAVista);
            List<MarcasEscaner.Marca> nuevas = new ArrayList<>();
            for (int i = 0; i < rects.size(); i++) {
                float[] r = rects.get(i);
                RectF caja = new RectF(r[0], r[1], r[2], r[3]);
                aVista.mapRect(caja);
                nuevas.add(new MarcasEscaner.Marca(caja, tipos.get(i), etiquetas.get(i)));
            }
            // La vista previa, las marcas y la WebView comparten el padre: sus coordenadas son
            // las del padre, y la WebView puede no llenarlo (los bordes del sistema).
            float wx = web.getLeft();
            float wy = web.getTop();
            float ww = web.getWidth();
            float wh = web.getHeight();
            RectF zonaEnVista = null;
            if (zona != null) {
                float zx = wx + (float) zona.optDouble("x", 0) * ww;
                float zy = wy + (float) zona.optDouble("y", 0) * wh;
                zonaEnVista = new RectF(zx, zy, zx + (float) zona.optDouble("ancho", 1) * ww, zy + (float) zona.optDouble("alto", 1) * wh);
            }
            marcas.mostrar(nuevas, zonaEnVista, flechas);
            RectF cuadro = new RectF(0, 0, lecturaAhora.ancho(), lecturaAhora.alto());
            aVista.mapRect(cuadro);
            JSObject pantalla = new JSObject();
            pantalla.put("x", (cuadro.left - wx) / ww);
            pantalla.put("y", (cuadro.top - wy) / wh);
            pantalla.put("ancho", cuadro.width() / ww);
            pantalla.put("alto", cuadro.height() / wh);
            JSObject respuesta = new JSObject();
            respuesta.put("pantalla", pantalla);
            call.resolve(respuesta);
        });
    }

    /** Una foto en alta, derecha y achicada a LADO_CAPTURA: la foto del paquete y,
     *  con ML Kit sobre ella, los códigos y el texto. Se devuelve todo junto.
     *
     *  El visor de «Cargar la guía» (spec 034) la pide con `leer: false` (la guía se lee
     *  después, con «Leer direcciones») y con `recorte`: el recuadro de la pantalla en
     *  fracciones 0–1, para que la foto sea lo que se veía en él. */
    @PluginMethod
    public void capturar(PluginCall call) {
        LectorCuadros lecturaAhora = lectura;
        if (fotoDelCuadro && lecturaAhora != null) {
            lecturaAhora.pedirFoto(new LectorCuadros.AlFoto() {
                @Override
                public void lista(byte[] jpeg, JSArray codigos, String texto) {
                    JSObject respuesta = new JSObject();
                    respuesta.put("imagen", Base64.encodeToString(jpeg, Base64.NO_WRAP));
                    respuesta.put("codigos", codigos);
                    respuesta.put("texto", texto);
                    call.resolve(respuesta);
                }

                @Override
                public void fallo(String motivo) {
                    call.reject(motivo);
                }
            });
            return;
        }
        ImageCapture ahora = captura;
        ExecutorService enHilo = hilo;
        if (ahora == null || enHilo == null) {
            call.reject("sin_captura");
            return;
        }
        boolean leer = !Boolean.FALSE.equals(call.getBoolean("leer", true));
        JSObject recorte = call.getObject("recorte");
        ahora.takePicture(enHilo, new ImageCapture.OnImageCapturedCallback() {
            @Override
            public void onCaptureSuccess(ImageProxy imagen) {
                Bitmap foto;
                try {
                    ByteBuffer datos = imagen.getPlanes()[0].getBuffer();
                    byte[] jpeg = new byte[datos.remaining()];
                    datos.get(jpeg);
                    int giro = imagen.getImageInfo().getRotationDegrees();
                    Bitmap entera = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
                    foto = derecha(entera, giro, zona(entera, imagen.getCropRect(), giro, recorte));
                } catch (RuntimeException e) {
                    call.reject("captura_ilegible");
                    return;
                } finally {
                    imagen.close();
                }
                leerCaptura(foto, call, leer);
            }

            @Override
            public void onError(ImageCaptureException e) {
                call.reject("captura_fallida");
            }
        });
    }

    /** La parte de la foto (sin girar) que se devuelve: lo que la cámara dice que calza con
     *  la vista previa (`visible`; la foto entera si no hay visor) y, dentro de eso, el
     *  `recorte` que pide la web en fracciones de la pantalla ya derecha. La foto viene
     *  como la da el sensor, así que el recorte se gira al revés que la foto. */
    private static Rect zona(Bitmap foto, Rect visible, int giro, JSObject recorte) {
        Rect v = new Rect(0, 0, foto.getWidth(), foto.getHeight());
        if (visible != null && !visible.isEmpty() && v.contains(visible)) v = visible;
        if (recorte == null) return v;
        double x = fraccion(recorte, "x", 0), y = fraccion(recorte, "y", 0);
        double ancho = Math.min(fraccion(recorte, "ancho", 1), 1 - x), alto = Math.min(fraccion(recorte, "alto", 1), 1 - y);
        if (ancho <= 0 || alto <= 0) return v;
        // (izquierda, arriba, ancho, alto) del recorte en la foto sin girar, en fracciones.
        double[] f;
        switch (((giro % 360) + 360) % 360) {
            case 90:
                f = new double[] { y, 1 - x - ancho, alto, ancho };
                break;
            case 180:
                f = new double[] { 1 - x - ancho, 1 - y - alto, ancho, alto };
                break;
            case 270:
                f = new double[] { 1 - y - alto, x, alto, ancho };
                break;
            default:
                f = new double[] { x, y, ancho, alto };
        }
        int izquierda = v.left + (int) Math.round(f[0] * v.width());
        int arriba = v.top + (int) Math.round(f[1] * v.height());
        int w = Math.max(1, Math.min((int) Math.round(f[2] * v.width()), v.right - izquierda));
        int h = Math.max(1, Math.min((int) Math.round(f[3] * v.height()), v.bottom - arriba));
        return new Rect(izquierda, arriba, izquierda + w, arriba + h);
    }

    private static double fraccion(JSObject o, String clave, double siFalta) {
        double valor = o.optDouble(clave, siFalta);
        return Double.isNaN(valor) ? siFalta : Math.max(0, Math.min(1, valor));
    }

    /** Recorta la foto a `zona`, la gira según la cámara y la achica a LADO_CAPTURA. */
    private static Bitmap derecha(Bitmap foto, int giro, Rect zona) {
        float escala = Math.min(1f, (float) LADO_CAPTURA / Math.max(zona.width(), zona.height()));
        Matrix m = new Matrix();
        m.postScale(escala, escala);
        m.postRotate(giro);
        return Bitmap.createBitmap(foto, zona.left, zona.top, zona.width(), zona.height(), m, true);
    }

    private void leerCaptura(Bitmap foto, PluginCall call, boolean leer) {
        if (!leer) {
            call.resolve(respuestaDeCaptura(foto, new JSArray(), ""));
            return;
        }
        BarcodeScanner codigosAhora = codigos;
        TextRecognizer lectorAhora = lector;
        if (codigosAhora == null || lectorAhora == null) {
            call.reject("sin_camara");
            return;
        }
        InputImage entrada = InputImage.fromBitmap(foto, 0);
        Task<List<Barcode>> conCodigos = codigosAhora.process(entrada);
        Task<Text> conTexto = lectorAhora.process(entrada);
        Tasks.whenAllComplete(conCodigos, conTexto).addOnCompleteListener(listo -> {
            JSArray valores = new JSArray();
            if (conCodigos.isSuccessful()) {
                for (Barcode codigo : conCodigos.getResult()) {
                    if (codigo.getRawValue() != null) valores.put(codigo.getRawValue());
                }
            }
            call.resolve(respuestaDeCaptura(foto, valores, conTexto.isSuccessful() ? conTexto.getResult().getText() : ""));
        });
    }

    private static JSObject respuestaDeCaptura(Bitmap foto, JSArray codigos, String texto) {
        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        foto.compress(Bitmap.CompressFormat.JPEG, 85, salida);
        JSObject respuesta = new JSObject();
        respuesta.put("imagen", Base64.encodeToString(salida.toByteArray(), Base64.NO_WRAP));
        respuesta.put("codigos", codigos);
        respuesta.put("texto", texto);
        return respuesta;
    }

    /** En el hilo de la pantalla. Con `captura: false` (la nómina) no se abre la foto en
     *  alta: con las tres salidas, el V2430 baja los cuadros de análisis a 720×960
     *  (medido 2026-11-11, pide 1920×1080), poco para la letra chica de la nómina.
     *  Sin ella se piden cuadros 16:9. Por defecto, como siempre (la etiqueta, 028). */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void arrancar(PluginCall call) {
        apagar();
        // Fotos del dueño (2026-11-25): la foto del paquete, del cuadro; sin la foto en alta, los
        // cuadros salen 16:9 a 1920×1080, como en la nómina.
        boolean delCuadro = "cuadro".equals(call.getString("foto", ""));
        boolean conFoto = !delCuadro && !Boolean.FALSE.equals(call.getBoolean("captura", true));
        // La nómina no trae códigos de barras: al barrerla no se buscan (spec 034).
        boolean leerCodigos = !Boolean.FALSE.equals(call.getBoolean("codigos", true));
        // Spec 036: cuántos cuadros se leen a la vez (1 o 2; Diagnóstico, para medirlo).
        Integer pedidos = call.getInt("enVuelo", 1);
        int enVuelo = pedidos != null && pedidos >= 2 ? 2 : 1;
        // El visor de «Cargar la guía» (spec 034): la vista previa y la foto en alta, sin
        // leer cada cuadro. No manda el evento "cuadro".
        boolean visor = Boolean.TRUE.equals(call.getBoolean("visor", false));
        // "corta": nunca más de 1/30 s por cuadro; "cortaOscura": además un punto menos
        // de exposición. El celular y la boleta se mueven, y con poca luz la cámara
        // alarga la exposición y el texto sale movido (spec 034).
        String exposicion = call.getString("exposicion", "auto");
        boolean corta = "corta".equals(exposicion) || "cortaOscura".equals(exposicion);
        codigos = BarcodeScanning.getClient();
        lector = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        hilo = Executors.newSingleThreadExecutor();
        LectorCuadros lecturaNueva = new LectorCuadros(getContext(), leerCodigos ? codigos : null, lector, hilo, enVuelo, evento -> notifyListeners("cuadro", evento));
        lectura = lecturaNueva;
        fotoDelCuadro = delCuadro && !visor;

        ResolutionSelector.Builder resolucion = new ResolutionSelector.Builder()
            .setResolutionStrategy(new ResolutionStrategy(RESOLUCION, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER));
        if (!conFoto) resolucion.setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY);
        ImageAnalysis.Builder conAnalisis = new ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setResolutionSelector(resolucion.build());

        ListenableFuture<ProcessCameraProvider> futuro = ProcessCameraProvider.getInstance(getContext());
        futuro.addListener(() -> {
            try {
                proveedor = futuro.get();
                vista = new PreviewView(getActivity());
                vista.setLayoutParams(new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                vista.setScaleType(PreviewView.ScaleType.FILL_CENTER);
                vista.setBackgroundColor(Color.BLACK);
                ViewGroup padre = (ViewGroup) getBridge().getWebView().getParent();
                padre.addView(vista, 0);
                // Las marcas, entre la vista previa y la WebView.
                marcas = new MarcasEscaner(getActivity());
                marcas.setLayoutParams(new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                padre.addView(marcas, 1);
                getBridge().getWebView().setBackgroundColor(Color.TRANSPARENT);

                Preview.Builder conPrevia = new Preview.Builder();
                Range<Integer> cuadros = corta ? cuadrosFijos(proveedor) : null;
                if (cuadros != null) {
                    new Camera2Interop.Extender<>(conPrevia).setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, cuadros);
                    new Camera2Interop.Extender<>(conAnalisis).setCaptureRequestOption(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, cuadros);
                }
                ImageAnalysis analisis = conAnalisis.build();
                analisis.setAnalyzer(hilo, lecturaNueva::analizar);
                Preview previa = conPrevia.build();
                previa.setSurfaceProvider(vista.getSurfaceProvider());
                ImageCapture conCaptura = new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build();
                if (visor) {
                    // Con la ventana de la pantalla, la foto trae el recorte (cropRect) que
                    // calza con lo que muestra la vista previa, que llena la pantalla.
                    UseCaseGroup.Builder grupo = new UseCaseGroup.Builder().addUseCase(previa).addUseCase(conCaptura);
                    if (padre.getWidth() > 0 && padre.getHeight() > 0) {
                        grupo.setViewPort(new ViewPort.Builder(new Rational(padre.getWidth(), padre.getHeight()), previa.getTargetRotation())
                            .setScaleType(ViewPort.FILL_CENTER)
                            .build());
                    }
                    camara = proveedor.bindToLifecycle((LifecycleOwner) getActivity(), CameraSelector.DEFAULT_BACK_CAMERA, grupo.build());
                    captura = conCaptura;
                } else if (!conFoto) {
                    camara = proveedor.bindToLifecycle((LifecycleOwner) getActivity(), CameraSelector.DEFAULT_BACK_CAMERA, previa, analisis);
                    captura = null;
                } else {
                    try {
                        camara = proveedor.bindToLifecycle((LifecycleOwner) getActivity(), CameraSelector.DEFAULT_BACK_CAMERA, previa, analisis, conCaptura);
                        captura = conCaptura;
                    } catch (IllegalArgumentException sinTres) {
                        // Un teléfono que no da las tres a la vez: sin captura, el texto sale
                        // solo de los cuadros.
                        camara = proveedor.bindToLifecycle((LifecycleOwner) getActivity(), CameraSelector.DEFAULT_BACK_CAMERA, previa, analisis);
                        captura = null;
                    }
                }
                if ("cortaOscura".equals(exposicion)) unPuntoMenos(camara);
                JSObject respuesta = new JSObject();
                respuesta.put("linterna", camara.getCameraInfo().hasFlashUnit());
                respuesta.put("captura", captura != null || fotoDelCuadro);
                // APK 1.13.0 (fotos del dueño, 2026-11-25): la foto sale del cuadro y el texto se
                // puede leer girado.
                respuesta.put("fotoDelCuadro", fotoDelCuadro);
                respuesta.put("giro", true);
                // Lo que de verdad quedó puesto, para Diagnóstico: los cuadros por segundo fijos.
                respuesta.put("cuadrosFijos", cuadros != null ? cuadros.getUpper() : 0);
                respuesta.put("visor", visor);
                // Spec 036: esta APK dibuja las flechas y lee de a `enVuelo` cuadros.
                respuesta.put("flechas", true);
                respuesta.put("enVuelo", lecturaNueva.enVuelo());
                call.resolve(respuesta);
            } catch (Exception e) {
                apagar();
                call.reject("sin_camara");
            }
        }, ContextCompat.getMainExecutor(getContext()));
    }

    /** El rango fijo de cuadros por segundo más alto que da la cámara de atrás, hasta 30:
     *  con él la exposición automática no puede alargar un cuadro más de 1/30 s. Null si
     *  la cámara no dice sus rangos o no tiene ninguno fijo. */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private static Range<Integer> cuadrosFijos(ProcessCameraProvider proveedor) {
        try {
            List<CameraInfo> atras = CameraSelector.DEFAULT_BACK_CAMERA.filter(proveedor.getAvailableCameraInfos());
            if (atras.isEmpty()) return null;
            Range<Integer>[] rangos = Camera2CameraInfo.from(atras.get(0))
                .getCameraCharacteristic(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
            Range<Integer> mejor = null;
            for (Range<Integer> r : rangos != null ? rangos : new Range[0]) {
                if (!r.getLower().equals(r.getUpper()) || r.getUpper() > 30) continue;
                if (mejor == null || r.getUpper() > mejor.getUpper()) mejor = r;
            }
            return mejor;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Baja la exposición un punto (1 EV), si la cámara lo permite: tiempos más cortos. */
    private static void unPuntoMenos(Camera camara) {
        ExposureState estado = camara.getCameraInfo().getExposureState();
        if (!estado.isExposureCompensationSupported()) return;
        Rational paso = estado.getExposureCompensationStep();
        if (paso.floatValue() <= 0) return;
        int indice = Math.max(estado.getExposureCompensationRange().getLower(), -Math.round(1f / paso.floatValue()));
        camara.getCameraControl().setExposureCompensationIndex(indice);
    }

    /** En el hilo de la pantalla. Deja la WebView como estaba. */
    private void apagar() {
        fotoDelCuadro = false;
        if (proveedor != null) proveedor.unbindAll();
        proveedor = null;
        camara = null;
        captura = null;
        if (vista != null && vista.getParent() != null) ((ViewGroup) vista.getParent()).removeView(vista);
        vista = null;
        if (marcas != null && marcas.getParent() != null) ((ViewGroup) marcas.getParent()).removeView(marcas);
        marcas = null;
        if (lectura != null) lectura.cerrar();
        lectura = null;
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(Color.WHITE);
        if (codigos != null) codigos.close();
        if (lector != null) lector.close();
        codigos = null;
        lector = null;
        if (hilo != null) hilo.shutdown();
        hilo = null;
    }
}
