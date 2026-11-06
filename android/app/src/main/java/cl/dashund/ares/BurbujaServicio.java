package cl.dashund.ares;

import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

/**
 * La burbuja de ARES sobre Google Maps (spec 020, research R1–R8). Un servicio en
 * primer plano sostiene una ventana sobre otras apps mientras ARES está atrás, y el
 * proceso con ella: sin el proceso muere el WebView que decide los botones. Es
 * "specialUse", y "location" solo para abrirse al llegar con la ubicación que ya pide
 * Google Maps (BurbujaLlegada).
 *
 * El servicio no decide nada: dibuja la última vista que mandó la web
 * (BurbujaPlugin.mostrar) y le devuelve cada toque. Visible = hay vista, hay
 * permiso, ARES no está adelante y ARES no abrió una pantalla suya (escáner).
 * Contrato: specs/020-burbuja-google-maps/contracts/burbuja.md.
 */
public class BurbujaServicio extends Service {

    /** Quien recibe los toques: el plugin, que los pasa a la web. */
    interface AlTocar {
        void toque(String id);
    }

    private static final int AVISO = 20;
    /** Dos toques seguidos al mismo botón cuentan como uno (contrato). */
    private static final long MS_DOBLE_TOQUE = 600;
    /** Si ARES no llega adelante, el toque que lo esperaba se entrega igual. */
    private static final long MS_ESPERAR_ARES = 2000;
    /** El círculo va siempre justo encima del velocímetro de Google Maps, abajo a
     *  la izquierda (el dueño, 2026-11-05): ahí no tapa el giro, los botones de la
     *  derecha ni la llegada. Medido al píxel en el vivo: el velocímetro ocupa de
     *  95 a 146 dp sobre la barra de navegación, y su anillo gris (lo que el ojo
     *  toma como borde) está centrado a 43 dp del borde izquierdo. El círculo
     *  (56 dp) va centrado ahí, 8 dp más arriba. */
    private static final int CIRCULO_DESDE_ABAJO_DP = 154;
    private static final int CIRCULO_DESDE_IZQUIERDA_DP = 15;

    // Lo comparte el plugin, en el hilo principal. Vive mientras viva el proceso:
    // sin la web no hay qué mostrar (START_NOT_STICKY).
    private static final Handler principal = new Handler(Looper.getMainLooper());
    private static BurbujaServicio activo;
    private static JSONObject vista;
    private static boolean aresAdelante = true;
    private static boolean enAres = false;
    private static AlTocar alTocar;
    /** El toque de un botón que abre ARES: se avisa cuando ARES ya está adelante. */
    private static String toqueEnEspera;
    /** La burbuja está en curso: WebViewAres no deja que la página se congele atrás. */
    private static volatile boolean enCurso;
    /** Avisa a la WebView cuando la burbuja empieza o termina. */
    private static Runnable alCambiarEnCurso;

    private WindowManager ventanas;
    /** Abre la tarjeta al llegar a la parada (BurbujaLlegada). */
    private BurbujaLlegada llegada;
    private FrameLayout raiz;
    private boolean agregada = false;
    /** Navegando va achicada; la tarjeta se abre al tocarla o con un "Deshacer". */
    private boolean abierta = false;
    /** Se abrió sola por un "Deshacer": se achica sola cuando el aviso se va. */
    private boolean abiertaPorAviso = false;
    /** El texto del último "Deshacer", para abrir solo con uno nuevo. */
    private String ultimoDeshacer;
    private String ultimoToque;
    private long ultimoToqueMs;
    private int secuenciaAviso = -1;

    // ── Lo que llama el plugin (cualquier hilo) ──────────────────────────────

    static void escuchar(AlTocar quien, Runnable alCambiar) {
        principal.post(() -> {
            alTocar = quien;
            alCambiarEnCurso = alCambiar;
        });
    }

    static boolean mantenerVisible() {
        return enCurso;
    }

    private static void fijarEnCurso(boolean valor) {
        if (enCurso == valor) return;
        enCurso = valor;
        if (alCambiarEnCurso != null) principal.post(alCambiarEnCurso);
    }

    /** Dibuja la vista. La primera vez arranca el servicio: la web lo pide con ARES
     *  adelante (el toque a los km), que es cuando Android lo permite. */
    static void mostrar(Context contexto, JSONObject nueva) {
        Context app = contexto.getApplicationContext();
        // Antes de abrir Google Maps: cuando ARES quede atrás, la página ya no se congela.
        fijarEnCurso(true);
        principal.post(() -> {
            vista = nueva;
            if (activo != null) {
                activo.recibir();
                return;
            }
            try {
                ContextCompat.startForegroundService(app, new Intent(app, BurbujaServicio.class));
            } catch (RuntimeException e) {
                // Con ARES atrás Android no deja arrancarlo: sin burbuja, la navegación
                // sigue igual y los km la vuelven a intentar.
            }
        });
    }

    static void terminar() {
        fijarEnCurso(false);
        principal.post(() -> {
            vista = null;
            toqueEnEspera = null;
            if (activo != null) activo.apagar();
        });
    }

    static void fijarAresAdelante(boolean valor) {
        principal.post(() -> {
            aresAdelante = valor;
            if (valor && toqueEnEspera != null) entregarEnEspera();
            if (activo != null) activo.dibujar();
        });
    }

    static void fijarEnAres(boolean valor) {
        principal.post(() -> {
            enAres = valor;
            if (activo != null) activo.dibujar();
        });
    }

    // ── El servicio ─────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        activo = this;
        ventanas = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        raiz = new FrameLayout(this);
        BurbujaAviso.crearCanal(this);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // "location" solo con el permiso dado: sin él, Android no deja arrancar
                // el servicio con ese tipo, y la burbuja igual sirve (sin abrirse al llegar).
                int tipo = ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    | (BurbujaLlegada.hayPermiso(this) ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
                startForeground(AVISO, BurbujaAviso.de(this, secuenciaActual(), intentAres()), tipo);
            } else {
                startForeground(AVISO, BurbujaAviso.de(this, secuenciaActual(), intentAres()));
            }
        } catch (RuntimeException e) {
            // Android no dejó ponerlo en primer plano: sin servicio no hay burbuja,
            // y la navegación sigue igual.
            activo = null;
            stopSelf();
            return;
        }
        llegada = new BurbujaLlegada(this, this::alLlegar);
        llegada.empezar(this);
    }

    /** Llegó a la parada: la tarjeta se abre con sus botones. */
    private void alLlegar() {
        abierta = true;
        abiertaPorAviso = false;
        dibujar();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (activo == this) recibir();
        return START_NOT_STICKY;
    }

    /** Cerrar ARES desde recientes la quita (borde de la spec): los km la reabren. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        vista = null;
        apagar();
    }

    @Override
    public void onDestroy() {
        if (llegada != null) llegada.parar();
        quitarVentana();
        if (activo == this) activo = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void apagar() {
        fijarEnCurso(false);
        if (llegada != null) llegada.parar();
        quitarVentana();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
        if (activo == this) activo = null;
    }

    /**
     * Llegó una vista. Navegando, la burbuja va achicada: abierta tapa la
     * navegación y sirve al llegar (el dueño, 2026-11-05). Se abre sola solo con
     * un "Deshacer" nuevo, para que se pueda deshacer lo recién cerrado, y se
     * achica sola cuando ese aviso se va.
     */
    private void recibir() {
        if (vista == null) {
            apagar();
            return;
        }
        JSONObject aviso = vista.optJSONObject("aviso");
        String deshacer = aviso != null && aviso.optBoolean("deshacer") ? aviso.optString("texto") : null;
        if (deshacer != null && !deshacer.equals(ultimoDeshacer)) {
            abierta = true;
            abiertaPorAviso = true;
        } else if (deshacer == null && abiertaPorAviso) {
            abierta = false;
            abiertaPorAviso = false;
        } else if (deshacer == null && vista.optBoolean("nueva")) {
            abierta = false;
        }
        ultimoDeshacer = deshacer;
        if (llegada != null) llegada.destino(vista.optInt("secuencia", 0), vista.optJSONObject("destino"));
        int secuencia = vista.optInt("secuencia", 0);
        if (secuencia != secuenciaAviso) {
            secuenciaAviso = secuencia;
            NotificationManager avisos = getSystemService(NotificationManager.class);
            if (avisos != null) avisos.notify(AVISO, BurbujaAviso.de(this, secuencia, intentAres()));
        }
        dibujar();
    }

    private void dibujar() {
        boolean visible = vista != null && !aresAdelante && !enAres && Settings.canDrawOverlays(this);
        if (!visible) {
            quitarVentana();
            return;
        }
        View contenido;
        if (abierta) {
            int tercio = getResources().getDisplayMetrics().heightPixels / 3;
            contenido = BurbujaVista.tarjeta(this, vista, new BurbujaVista.Toques() {
                @Override
                public void tocar(String id, boolean abreAres) {
                    BurbujaServicio.this.tocar(id, abreAres);
                }

                @Override
                public void achicar() {
                    abierta = false;
                    abiertaPorAviso = false;
                    dibujar();
                }
            }, tercio);
        } else {
            contenido = BurbujaVista.circulo(this, vista.optInt("secuencia", 0));
            contenido.setOnClickListener(v -> {
                abierta = true;
                abiertaPorAviso = false;
                dibujar();
            });
        }
        raiz.removeAllViews();
        raiz.addView(contenido);
        try {
            if (agregada) {
                ventanas.updateViewLayout(raiz, parametros());
            } else {
                ventanas.addView(raiz, parametros());
                agregada = true;
            }
        } catch (RuntimeException e) {
            // Sin permiso, o Android no dejó poner la ventana: sin burbuja.
            agregada = false;
        }
    }

    private void quitarVentana() {
        if (!agregada) return;
        try {
            ventanas.removeView(raiz);
        } catch (RuntimeException e) {
            // Ya no estaba.
        }
        agregada = false;
    }

    /** Abierta: a lo ancho, pegada abajo. Achicada: el círculo sobre la velocidad. Nunca
     *  toma el foco: el teclado y el botón atrás siguen siendo de Google Maps. */
    private WindowManager.LayoutParams parametros() {
        WindowManager.LayoutParams p = new WindowManager.LayoutParams(
            abierta ? WindowManager.LayoutParams.MATCH_PARENT : WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT);
        if (abierta) {
            p.gravity = Gravity.BOTTOM;
            int margen = BurbujaVista.dp(this, 8);
            raiz.setPadding(margen, 0, margen, margen);
        } else {
            p.gravity = Gravity.BOTTOM | Gravity.START;
            p.x = BurbujaVista.dp(this, CIRCULO_DESDE_IZQUIERDA_DP);
            p.y = BurbujaVista.dp(this, CIRCULO_DESDE_ABAJO_DP);
            raiz.setPadding(0, 0, 0, 0);
        }
        return p;
    }

    private void tocar(String id, boolean abreAres) {
        long ahora = SystemClock.elapsedRealtime();
        if (id.equals(ultimoToque) && ahora - ultimoToqueMs < MS_DOBLE_TOQUE) return;
        ultimoToque = id;
        ultimoToqueMs = ahora;

        JSONObject destino = vista != null ? vista.optJSONObject("destino") : null;
        if (id.equals("navegar") && destino != null) {
            // Con punto lo abre lo nativo; la web solo se entera.
            GoogleMaps.navegar(this, destino.optDouble("lat"), destino.optDouble("lng"));
        } else if (abreAres || id.equals("ares") || id.equals("navegar")) {
            // Escanear, Teléfono, Volver a ARES y Navegar sin punto necesitan la
            // pantalla de ARES: se avisa cuando ya esté adelante (R4).
            abrirAres();
            toqueEnEspera = id;
            principal.postDelayed(BurbujaServicio::entregarEnEspera, MS_ESPERAR_ARES);
            return;
        }
        avisar(id);
        if (id.equals("llamar")) GoogleMaps.alFrenteTrasLlamar(this);
    }

    private static void entregarEnEspera() {
        String id = toqueEnEspera;
        toqueEnEspera = null;
        if (id != null) avisar(id);
    }

    private static void avisar(String id) {
        if (alTocar != null) alTocar.toque(id);
    }

    /** ARES adelante; ya es singleTask. Android permite abrirlo desde atrás porque la
     *  burbuja tocada es una ventana visible con "Mostrar sobre otras apps". */
    private void abrirAres() {
        try {
            startActivity(intentAres());
        } catch (RuntimeException e) {
            // Si Android no lo deja, el aviso fijo lo trae.
        }
    }

    private static int secuenciaActual() {
        return vista != null ? vista.optInt("secuencia", 0) : 0;
    }

    private Intent intentAres() {
        return new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    }
}
