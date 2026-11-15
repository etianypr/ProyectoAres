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
import android.media.Image;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.util.Range;
import android.util.Rational;
import android.util.Size;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.OptIn;
import androidx.camera.camera2.interop.Camera2CameraInfo;
import androidx.camera.camera2.interop.Camera2Interop;
import androidx.camera.camera2.interop.ExperimentalCamera2Interop;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraInfo;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ExposureState;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
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
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

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
    /** La nómina no trae códigos de barras: al barrerla no se buscan (spec 034). */
    private volatile boolean leerCodigos = true;
    /** Del cuadro ya derecho (las cajas que van a la web) al sensor: con la del sensor a
     *  la vista previa, las marcas de la web quedan encima del texto aunque la vista
     *  previa y el análisis tengan otra forma. La pone cada cuadro. */
    private volatile Matrix derechoASensor;

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
     *  ("confirmada", "leyendo" o "texto") y la etiqueta que va arriba (la OF), y se
     *  dibujan encima de la vista previa. */
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
        call.resolve();
        getActivity().runOnUiThread(() -> {
            Matrix aSensor = derechoASensor;
            Matrix sensorAVista = vista != null ? vista.getSensorToViewTransform() : null;
            if (marcas == null || aSensor == null || sensorAVista == null) return;
            Matrix aVista = new Matrix(aSensor);
            aVista.postConcat(sensorAVista);
            List<MarcasEscaner.Marca> nuevas = new ArrayList<>();
            for (int i = 0; i < rects.size(); i++) {
                float[] r = rects.get(i);
                RectF caja = new RectF(r[0], r[1], r[2], r[3]);
                aVista.mapRect(caja);
                nuevas.add(new MarcasEscaner.Marca(caja, tipos.get(i), etiquetas.get(i)));
            }
            marcas.mostrar(nuevas);
        });
    }

    /** Una foto en alta, derecha y achicada a LADO_CAPTURA: la foto del paquete y,
     *  con ML Kit sobre ella, los códigos y el texto. Se devuelve todo junto. */
    @PluginMethod
    public void capturar(PluginCall call) {
        ImageCapture ahora = captura;
        ExecutorService enHilo = hilo;
        if (ahora == null || enHilo == null) {
            call.reject("sin_captura");
            return;
        }
        ahora.takePicture(enHilo, new ImageCapture.OnImageCapturedCallback() {
            @Override
            public void onCaptureSuccess(ImageProxy imagen) {
                Bitmap foto;
                try {
                    ByteBuffer datos = imagen.getPlanes()[0].getBuffer();
                    byte[] jpeg = new byte[datos.remaining()];
                    datos.get(jpeg);
                    foto = derecha(BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length), imagen.getImageInfo().getRotationDegrees());
                } catch (RuntimeException e) {
                    call.reject("captura_ilegible");
                    return;
                } finally {
                    imagen.close();
                }
                leerCaptura(foto, call);
            }

            @Override
            public void onError(ImageCaptureException e) {
                call.reject("captura_fallida");
            }
        });
    }

    /** Gira la foto según la cámara y la achica a LADO_CAPTURA. */
    private static Bitmap derecha(Bitmap foto, int giro) {
        float escala = Math.min(1f, (float) LADO_CAPTURA / Math.max(foto.getWidth(), foto.getHeight()));
        Matrix m = new Matrix();
        m.postScale(escala, escala);
        m.postRotate(giro);
        return Bitmap.createBitmap(foto, 0, 0, foto.getWidth(), foto.getHeight(), m, true);
    }

    private void leerCaptura(Bitmap foto, PluginCall call) {
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
            ByteArrayOutputStream salida = new ByteArrayOutputStream();
            foto.compress(Bitmap.CompressFormat.JPEG, 85, salida);
            JSObject respuesta = new JSObject();
            respuesta.put("imagen", Base64.encodeToString(salida.toByteArray(), Base64.NO_WRAP));
            respuesta.put("codigos", valores);
            respuesta.put("texto", conTexto.isSuccessful() ? conTexto.getResult().getText() : "");
            call.resolve(respuesta);
        });
    }

    /** En el hilo de la pantalla. Con `captura: false` (la nómina) no se abre la foto en
     *  alta: con las tres salidas, el V2430 baja los cuadros de análisis a 720×960
     *  (medido 2026-11-11, pide 1920×1080), poco para la letra chica de la nómina.
     *  Sin ella se piden cuadros 16:9. Por defecto, como siempre (la etiqueta, 028). */
    @OptIn(markerClass = ExperimentalCamera2Interop.class)
    private void arrancar(PluginCall call) {
        apagar();
        boolean conFoto = !Boolean.FALSE.equals(call.getBoolean("captura", true));
        leerCodigos = !Boolean.FALSE.equals(call.getBoolean("codigos", true));
        // "corta": nunca más de 1/30 s por cuadro; "cortaOscura": además un punto menos
        // de exposición. El celular y la boleta se mueven, y con poca luz la cámara
        // alarga la exposición y el texto sale movido (spec 034).
        String exposicion = call.getString("exposicion", "auto");
        boolean corta = "corta".equals(exposicion) || "cortaOscura".equals(exposicion);
        codigos = BarcodeScanning.getClient();
        lector = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        hilo = Executors.newSingleThreadExecutor();

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
                analisis.setAnalyzer(hilo, this::analizar);
                Preview previa = conPrevia.build();
                previa.setSurfaceProvider(vista.getSurfaceProvider());
                ImageCapture conCaptura = new ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build();
                if (!conFoto) {
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
                respuesta.put("captura", captura != null);
                // Lo que de verdad quedó puesto, para Diagnóstico: los cuadros por segundo fijos.
                respuesta.put("cuadrosFijos", cuadros != null ? cuadros.getUpper() : 0);
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

    /** Un cuadro: códigos y texto a la vez sobre la misma imagen. El cuadro se suelta
     *  al terminar, así ML Kit nunca acumula cuadros atrasados. */
    @OptIn(markerClass = ExperimentalGetImage.class)
    private void analizar(ImageProxy cuadro) {
        Image imagen = cuadro.getImage();
        BarcodeScanner codigosAhora = codigos;
        TextRecognizer lectorAhora = lector;
        if (imagen == null || codigosAhora == null || lectorAhora == null) {
            cuadro.close();
            return;
        }
        long inicio = System.currentTimeMillis();
        int giro = cuadro.getImageInfo().getRotationDegrees();
        boolean acostado = giro == 90 || giro == 270;
        int ancho = acostado ? cuadro.getHeight() : cuadro.getWidth();
        int alto = acostado ? cuadro.getWidth() : cuadro.getHeight();
        derechoASensor = derechoASensor(cuadro, giro);
        InputImage entrada = InputImage.fromMediaImage(imagen, giro);
        Task<List<Barcode>> conCodigos = leerCodigos ? codigosAhora.process(entrada) : Tasks.forResult(Collections.emptyList());
        Task<Text> conTexto = lectorAhora.process(entrada);
        // El resultado se arma en el hilo del análisis, no en el de la pantalla: con la
        // cámara encendida cada redibujo de la WebView lo ocupa 1 a 5 s (spec 028), y el
        // cuadro siguiente no entra hasta soltar este (medido el 2026-11-15: 3 cuadros
        // por segundo con la pantalla cambiando, contra ~8).
        ExecutorService enHilo = hilo;
        Executor fueraDePantalla = tarea -> {
            try {
                enHilo.execute(tarea);
            } catch (RejectedExecutionException | NullPointerException apagado) {
                tarea.run();
            }
        };
        Tasks.whenAllComplete(conCodigos, conTexto).addOnCompleteListener(fueraDePantalla, listo -> {
            try {
                JSArray valores = new JSArray();
                if (conCodigos.isSuccessful()) {
                    for (Barcode codigo : conCodigos.getResult()) {
                        if (codigo.getRawValue() != null) valores.put(codigo.getRawValue());
                    }
                }
                JSArray renglones = new JSArray();
                if (conTexto.isSuccessful()) {
                    for (Text.TextBlock bloque : conTexto.getResult().getTextBlocks()) {
                        for (Text.Line linea : bloque.getLines()) {
                            Rect caja = linea.getBoundingBox();
                            JSObject renglon = new JSObject();
                            renglon.put("texto", linea.getText());
                            renglon.put("x", caja != null ? caja.left : 0);
                            renglon.put("y", caja != null ? caja.top : 0);
                            renglon.put("ancho", caja != null ? caja.width() : 0);
                            renglon.put("alto", caja != null ? caja.height() : 0);
                            JSArray numeros = numerosLargos(linea);
                            if (numeros.length() > 0) renglon.put("numeros", numeros);
                            renglones.put(renglon);
                        }
                    }
                }
                JSObject evento = new JSObject();
                evento.put("codigos", valores);
                evento.put("renglones", renglones);
                evento.put("ancho", ancho);
                evento.put("alto", alto);
                evento.put("ms", System.currentTimeMillis() - inicio);
                notifyListeners("cuadro", evento);
            } finally {
                cuadro.close();
            }
        });
    }

    /** Las palabras del renglón con 7 dígitos o más (una OF), con la confianza de ML Kit
     *  en cada carácter: el barrido de la nómina no deja votar a un dígito leído con
     *  poca confianza (dueño, 2026-11-11: «hay errores en números»). Solo esas palabras,
     *  para no cargar cada cuadro. */
    private static JSArray numerosLargos(Text.Line linea) {
        JSArray numeros = new JSArray();
        for (Text.Element palabra : linea.getElements()) {
            String texto = palabra.getText();
            int digitos = 0;
            for (int i = 0; i < texto.length(); i++) if (Character.isDigit(texto.charAt(i))) digitos++;
            if (digitos < 7) continue;
            List<Text.Symbol> simbolos = palabra.getSymbols();
            StringBuilder caracteres = new StringBuilder();
            JSArray confianzas = new JSArray();
            for (Text.Symbol s : simbolos) {
                caracteres.append(s.getText());
                try {
                    confianzas.put((double) s.getConfidence());
                } catch (JSONException e) {
                    confianzas.put(0);
                }
            }
            JSObject numero = new JSObject();
            numero.put("texto", caracteres.toString());
            numero.put("confianzas", confianzas);
            numeros.put(numero);
        }
        return numeros;
    }

    /** Del cuadro ya derecho (como lo leyó ML Kit, girado `giro`) al sensor: se deshace
     *  el giro y se pasa del búfer al sensor. Null si la cámara no da la del búfer. */
    private static Matrix derechoASensor(ImageProxy cuadro, int giro) {
        Matrix bufferADerecho = new Matrix();
        bufferADerecho.setRotate(giro);
        RectF limites = new RectF(0, 0, cuadro.getWidth(), cuadro.getHeight());
        bufferADerecho.mapRect(limites);
        bufferADerecho.postTranslate(-limites.left, -limites.top);
        Matrix resultado = new Matrix();
        Matrix bufferASensor = new Matrix();
        if (!bufferADerecho.invert(resultado)) return null;
        if (!cuadro.getImageInfo().getSensorToBufferTransformMatrix().invert(bufferASensor)) return null;
        resultado.postConcat(bufferASensor);
        return resultado;
    }

    /** En el hilo de la pantalla. Deja la WebView como estaba. */
    private void apagar() {
        if (proveedor != null) proveedor.unbindAll();
        proveedor = null;
        camara = null;
        captura = null;
        if (vista != null && vista.getParent() != null) ((ViewGroup) vista.getParent()).removeView(vista);
        vista = null;
        if (marcas != null && marcas.getParent() != null) ((ViewGroup) marcas.getParent()).removeView(marcas);
        marcas = null;
        derechoASensor = null;
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().setBackgroundColor(Color.WHITE);
        if (codigos != null) codigos.close();
        if (lector != null) lector.close();
        codigos = null;
        lector = null;
        if (hilo != null) hilo.shutdown();
        hilo = null;
    }
}
