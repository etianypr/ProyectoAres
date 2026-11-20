package cl.dashund.ares;

import android.content.Context;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.Image;
import android.os.Debug;
import android.os.PowerManager;
import android.os.SystemClock;

import androidx.annotation.OptIn;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageProxy;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import org.json.JSONException;

import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * La lectura de cada cuadro del escáner en vivo (spec 028): los códigos y los renglones de
 * texto que lee ML Kit, ya derechos. Salió de EscanerVivoPlugin en la spec 036 (el plugin
 * pasaba de las 600 líneas) y suma lo que tarda cada parte, para Diagnóstico: ML Kit
 * (`msLector`) y armar el resultado (`msArmar`), el número de cuadro (`n`) y, cada
 * CADA_CUANTOS_ESTADO cuadros, el estado térmico y la memoria nativa.
 *
 * Con `enVuelo` 2 (spec 036; Diagnóstico → «Cuadros a la vez», apagado hasta medirlo) se
 * leen dos cuadros a la vez: el plano Y se copia a un búfer propio (con el color neutro,
 * que para leer texto no importa), el cuadro se suelta al tiro, así la cámara entrega el
 * siguiente, y cada búfer lo lee su propio lector, con su propio hilo. Si los dos están
 * ocupados, el cuadro se bota. Sirve solo si ML Kit de verdad lee los dos a la vez:
 * Diagnóstico mide el solape. Solo para el texto: con códigos de barras (la etiqueta) va de
 * a uno, como siempre.
 *
 * Ningún dato de un cuadro se escribe en el log: trae el nombre y el teléfono de una persona.
 */
final class LectorCuadros {

    /** A quién se le entrega cada cuadro leído (el evento "cuadro" del plugin). */
    interface Salida {
        void cuadro(JSObject evento);
    }

    /** Cada cuántos cuadros van el estado térmico y la memoria: es una consulta al sistema. */
    private static final int CADA_CUANTOS_ESTADO = 30;

    private final Context contexto;
    /** Null: no se buscan códigos (la nómina). */
    private final BarcodeScanner codigos;
    private final TextRecognizer lector;
    /** El hilo del análisis de CameraX: ahí se arma el resultado, no en el de la pantalla. */
    private final ExecutorService hilo;
    private final Salida salida;
    /** Con enVuelo 2: los dos lectores de los búferes (el primero es `lector`) y sus hilos. */
    private final TextRecognizer[] lectores;
    private final ExecutorService[] hilos;
    private final byte[][] buferes;
    private final ConcurrentLinkedQueue<Integer> libres = new ConcurrentLinkedQueue<>();
    private final AtomicInteger secuencia = new AtomicInteger();
    /** Del cuadro ya derecho (las cajas que van a la web) al sensor. La pone cada cuadro. */
    private volatile Matrix derechoASensor;
    /** El tamaño del último cuadro ya derecho. */
    private volatile int ancho;
    private volatile int alto;
    private volatile boolean cerrado;

    LectorCuadros(Context contexto, BarcodeScanner codigos, TextRecognizer lector, ExecutorService hilo, int enVuelo, Salida salida) {
        this.contexto = contexto;
        this.codigos = codigos;
        this.lector = lector;
        this.hilo = hilo;
        this.salida = salida;
        if (enVuelo >= 2 && codigos == null) {
            ExecutorService otroHilo = Executors.newSingleThreadExecutor();
            // Otro lector con su propio hilo: con las mismas opciones ML Kit podría usar el
            // mismo detector y leer de a uno.
            TextRecognizer otro = TextRecognition.getClient(new TextRecognizerOptions.Builder().setExecutor(otroHilo).build());
            lectores = new TextRecognizer[] { lector, otro };
            hilos = new ExecutorService[] { hilo, otroHilo };
            buferes = new byte[2][];
            libres.add(0);
            libres.add(1);
        } else {
            lectores = null;
            hilos = null;
            buferes = null;
        }
    }

    /** Cuántos cuadros se leen a la vez. */
    int enVuelo() {
        return lectores != null ? lectores.length : 1;
    }

    Matrix derechoASensor() {
        return derechoASensor;
    }

    int ancho() {
        return ancho;
    }

    int alto() {
        return alto;
    }

    /** Suelta lo que creó esta lectura (el otro lector y su hilo). El lector, los códigos y
     *  el hilo del análisis son del plugin, que los cierra. */
    void cerrar() {
        cerrado = true;
        if (lectores != null) {
            lectores[1].close();
            hilos[1].shutdown();
        }
    }

    /** Un cuadro de CameraX. El cuadro se suelta al terminar (o, con dos a la vez, apenas se
     *  copia), así ML Kit nunca acumula cuadros atrasados. */
    @OptIn(markerClass = ExperimentalGetImage.class)
    void analizar(ImageProxy cuadro) {
        Image imagen = cuadro.getImage();
        if (imagen == null || cerrado) {
            cuadro.close();
            return;
        }
        long inicio = SystemClock.elapsedRealtime();
        int giro = cuadro.getImageInfo().getRotationDegrees();
        boolean acostado = giro == 90 || giro == 270;
        int anchoDerecho = acostado ? cuadro.getHeight() : cuadro.getWidth();
        int altoDerecho = acostado ? cuadro.getWidth() : cuadro.getHeight();
        derechoASensor = derechoASensor(cuadro, giro);
        ancho = anchoDerecho;
        alto = altoDerecho;
        int n = secuencia.incrementAndGet();
        if (lectores != null) {
            aLaVez(cuadro, imagen, giro, n, inicio, anchoDerecho, altoDerecho);
            return;
        }
        InputImage entrada = InputImage.fromMediaImage(imagen, giro);
        Task<List<Barcode>> conCodigos;
        Task<Text> conTexto;
        try {
            conCodigos = codigos != null ? codigos.process(entrada) : Tasks.forResult(Collections.emptyList());
            conTexto = lector.process(entrada);
        } catch (RuntimeException apagado) {
            cuadro.close();
            return;
        }
        // El resultado se arma en el hilo del análisis, no en el de la pantalla: con la
        // cámara encendida cada redibujo de la WebView lo ocupa 1 a 5 s (spec 028), y el
        // cuadro siguiente no entra hasta soltar este (medido el 2026-11-15: 3 cuadros
        // por segundo con la pantalla cambiando, contra ~8).
        Executor fueraDePantalla = tarea -> {
            try {
                hilo.execute(tarea);
            } catch (RejectedExecutionException apagado) {
                tarea.run();
            }
        };
        Tasks.whenAllComplete(conCodigos, conTexto).addOnCompleteListener(fueraDePantalla, listo -> {
            try {
                long msLector = SystemClock.elapsedRealtime() - inicio;
                // La imagen sigue abierta hasta soltar el cuadro: con ella se mide el color de
                // los íconos de la lista de Starken (ColorIconos, spec 045).
                if (!cerrado) salida.cuadro(evento(n, inicio, msLector, conCodigos, conTexto, anchoDerecho, altoDerecho, imagen, giro));
            } finally {
                cuadro.close();
            }
        });
    }

    /** Dos cuadros a la vez: se copia el plano Y (el brillo) a un búfer libre y se suelta el
     *  cuadro; sin búfer libre, el cuadro se bota. */
    @OptIn(markerClass = ExperimentalGetImage.class)
    private void aLaVez(ImageProxy cuadro, Image imagen, int giro, int n, long inicio, int anchoDerecho, int altoDerecho) {
        Integer ranura = libres.poll();
        if (ranura == null) {
            cuadro.close();
            return;
        }
        int w = cuadro.getWidth();
        int h = cuadro.getHeight();
        byte[] bufer = buferes[ranura];
        if (bufer == null || bufer.length != w * h * 3 / 2) {
            bufer = new byte[w * h * 3 / 2];
            // El color neutro: para leer texto basta el brillo.
            Arrays.fill(bufer, w * h, bufer.length, (byte) 0x80);
            buferes[ranura] = bufer;
        }
        try {
            Image.Plane plano = imagen.getPlanes()[0];
            ByteBuffer brillo = plano.getBuffer();
            int paso = plano.getRowStride();
            for (int fila = 0; fila < h; fila++) {
                brillo.position(fila * paso);
                brillo.get(bufer, fila * w, w);
            }
        } catch (RuntimeException ilegible) {
            libres.offer(ranura);
            return;
        } finally {
            cuadro.close();
        }
        Task<Text> conTexto;
        try {
            conTexto = lectores[ranura].process(InputImage.fromByteArray(bufer, w, h, giro, InputImage.IMAGE_FORMAT_NV21));
        } catch (RuntimeException apagado) {
            libres.offer(ranura);
            return;
        }
        int r = ranura;
        Executor suHilo = tarea -> {
            try {
                hilos[r].execute(tarea);
            } catch (RejectedExecutionException apagado) {
                tarea.run();
            }
        };
        conTexto.addOnCompleteListener(suHilo, listo -> {
            try {
                long msLector = SystemClock.elapsedRealtime() - inicio;
                // El búfer copiado no trae el color (el plano Y solo): sin íconos.
                if (!cerrado) salida.cuadro(evento(n, inicio, msLector, null, conTexto, anchoDerecho, altoDerecho, null, giro));
            } finally {
                libres.offer(r);
            }
        });
    }

    private JSObject evento(int n, long inicio, long msLector, Task<List<Barcode>> conCodigos, Task<Text> conTexto, int anchoDerecho, int altoDerecho, Image imagen, int giro) {
        long armar = SystemClock.elapsedRealtime();
        JSArray valores = new JSArray();
        if (conCodigos != null && conCodigos.isSuccessful()) {
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
                    JSArray iconos = ColorIconos.delRenglon(linea, imagen, giro);
                    if (iconos != null) renglon.put("iconos", iconos);
                    renglones.put(renglon);
                }
            }
        }
        JSObject evento = new JSObject();
        evento.put("codigos", valores);
        evento.put("renglones", renglones);
        evento.put("ancho", anchoDerecho);
        evento.put("alto", altoDerecho);
        evento.put("n", n);
        evento.put("msLector", msLector);
        if (n % CADA_CUANTOS_ESTADO == 1) {
            evento.put("termico", termico());
            evento.put("nativoMB", Debug.getNativeHeapAllocatedSize() / (1024 * 1024));
        }
        long fin = SystemClock.elapsedRealtime();
        evento.put("msArmar", fin - armar);
        evento.put("ms", fin - inicio);
        return evento;
    }

    /** El estado térmico del teléfono (0 normal … 6 apagándose): un teléfono caliente baja
     *  la velocidad de la lectura. -1 si no se sabe. */
    private int termico() {
        PowerManager energia = (PowerManager) contexto.getSystemService(Context.POWER_SERVICE);
        return energia != null ? energia.getCurrentThermalStatus() : -1;
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
}
