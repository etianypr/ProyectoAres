package cl.dashund.ares;

import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.libraries.navigation.CustomControlPosition;
import com.google.android.libraries.navigation.NavigationApi;
import com.google.android.libraries.navigation.NavigationView;
import com.google.android.libraries.navigation.Navigator;
import com.google.android.libraries.navigation.SimulationOptions;
import com.google.android.libraries.navigation.StylingOptions;
import com.google.android.libraries.navigation.TermsAndConditionsCheckOption;
import com.google.android.libraries.navigation.Waypoint;

/**
 * La navegación de Google dentro de ARES (spec 019: "que la app de maps se abra como
 * una pestaña dentro de ares… que siga con el mismo diseño de dashund"). El mapa, el
 * cartel y la voz son del kit de navegación de Google, con los colores Dashund; abajo
 * va la franja de la parada (OF y a quién) con "Volver a ARES".
 *
 * Al llegar se cierra sola y ARES sigue con la tarjeta de la parada. Si Google no
 * puede (sin clave, sin señal, condiciones no aceptadas), también se cierra y ARES
 * navega con OpenRouteService: el conductor nunca queda sin salida.
 *
 * A Google va solo el punto de la parada (y la ubicación del auto mientras guía). La
 * OF, el nombre y la dirección se muestran acá, en el teléfono, y no van en el
 * Waypoint.
 */
public class NavegacionActivity extends AppCompatActivity {

    static final String EXTRA_LAT = "lat";
    static final String EXTRA_LNG = "lng";
    static final String EXTRA_TITULO = "titulo";
    static final String EXTRA_DETALLE = "detalle";
    static final String EXTRA_SIMULAR = "simular";
    static final String RESULTADO = "resultado";
    static final String MOTIVO = "motivo";

    // Los colores del tema Dashund (tema-dashund.css).
    private static final int TINTA = 0xFF221A15;
    private static final int TINTA_SUAVE = 0xFF3A2E27;
    private static final int NARANJA = 0xFFD4531A;
    private static final int NARANJA_CLARO = 0xFFFFB48A;
    private static final int PAPEL = 0xFFFDFBF9;
    private static final int GRIS = 0xFF8A7D74;

    /** En el modo prueba el auto avanza solo por la ruta, a esta velocidad. */
    private static final float VELOCIDAD_SIMULADA = 5f;

    private NavigationView vista;
    private Navigator navegador;
    private Navigator.ArrivalListener alLlegar;
    private boolean simular;
    private boolean terminado;

    @Override
    protected void onCreate(Bundle guardado) {
        super.onCreate(guardado);
        // Manejando no se toca la pantalla: no puede apagarse.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Intent pedido = getIntent();
        final double lat = pedido.getDoubleExtra(EXTRA_LAT, Double.NaN);
        final double lng = pedido.getDoubleExtra(EXTRA_LNG, Double.NaN);
        simular = pedido.getBooleanExtra(EXTRA_SIMULAR, false);

        vista = new NavigationView(this);
        vista.onCreate(guardado);
        setContentView(vista);
        vista.setStylingOptions(estiloDashund());
        vista.setReportIncidentButtonEnabled(false);
        vista.setCustomControl(
            franja(pedido.getStringExtra(EXTRA_TITULO), pedido.getStringExtra(EXTRA_DETALLE)),
            CustomControlPosition.FOOTER
        );

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                terminar("volvio", null);
            }
        });

        if (Double.isNaN(lat) || Double.isNaN(lng)) {
            terminar("error", "sin_destino");
            return;
        }
        // Las condiciones de Google se aceptan una vez; sin eso el kit no guía.
        NavigationApi.getNavigator(this, new NavigationApi.NavigatorListener() {
            @Override
            public void onNavigatorReady(Navigator listo) {
                navegador = listo;
                guiar(lat, lng);
            }

            @Override
            public void onError(int codigo) {
                terminar("error", motivoDe(codigo));
            }
        }, TermsAndConditionsCheckOption.ENABLED);
    }

    private void guiar(double lat, double lng) {
        if (terminado) return;
        // Si el conductor cierra ARES desde recientes, Google deja de guiar.
        navegador.setTaskRemovedBehavior(Navigator.TaskRemovedBehavior.QUIT_SERVICE);
        Waypoint destino = Waypoint.builder().setLatLng(lat, lng).setTitle("Parada").build();
        navegador.setDestination(destino).setOnResultListener(estado -> {
            if (terminado) return;
            if (estado != Navigator.RouteStatus.OK) {
                terminar("error", estado.name());
                return;
            }
            navegador.setAudioGuidance(Navigator.AudioGuidance.VOICE_ALERTS_AND_GUIDANCE);
            alLlegar = evento -> terminar("llego", null);
            navegador.addArrivalListener(alLlegar);
            if (simular) {
                navegador.getSimulator().simulateLocationsAlongExistingRoute(new SimulationOptions().speedMultiplier(VELOCIDAD_SIMULADA));
            }
            navegador.startGuidance();
        });
    }

    private static String motivoDe(int codigo) {
        switch (codigo) {
            case NavigationApi.ErrorCode.NOT_AUTHORIZED: return "clave";
            case NavigationApi.ErrorCode.TERMS_NOT_ACCEPTED: return "condiciones";
            case NavigationApi.ErrorCode.NETWORK_ERROR: return "red";
            case NavigationApi.ErrorCode.LOCATION_PERMISSION_MISSING: return "ubicacion";
            default: return "kit_" + codigo;
        }
    }

    /** Devuelve el resultado a ARES y cierra. Una sola vez. */
    private void terminar(String resultado, String motivo) {
        if (terminado) return;
        terminado = true;
        if (navegador != null) {
            if (alLlegar != null) navegador.removeArrivalListener(alLlegar);
            navegador.stopGuidance();
            navegador.clearDestinations();
            if (simular) navegador.getSimulator().unsetUserLocation();
        }
        setResult(RESULT_OK, new Intent().putExtra(RESULTADO, resultado).putExtra(MOTIVO, motivo));
        finish();
    }

    // ---------------------------------------------------------------- aspecto

    private static StylingOptions estiloDashund() {
        return new StylingOptions()
            .primaryDayModeThemeColor(TINTA)
            .secondaryDayModeThemeColor(TINTA_SUAVE)
            .primaryNightModeThemeColor(TINTA)
            .secondaryNightModeThemeColor(TINTA_SUAVE)
            .headerLargeManeuverIconColor(NARANJA_CLARO)
            .headerSmallManeuverIconColor(NARANJA_CLARO)
            .headerDistanceValueTextColor(Color.WHITE)
            .headerDistanceUnitsTextColor(NARANJA_CLARO)
            .headerInstructionsTextColor(Color.WHITE)
            .headerNextStepTextColor(NARANJA_CLARO)
            .headerGuidanceRecommendedLaneColor(NARANJA_CLARO);
    }

    private int dp(float valor) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, valor, getResources().getDisplayMetrics()));
    }

    /** La franja de abajo: qué paquete es, a quién, y volver a ARES. */
    private View franja(String titulo, String detalle) {
        LinearLayout caja = new LinearLayout(this);
        caja.setOrientation(LinearLayout.HORIZONTAL);
        caja.setGravity(Gravity.CENTER_VERTICAL);
        caja.setPadding(dp(16), dp(12), dp(12), dp(12));
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(PAPEL);
        fondo.setCornerRadius(dp(22));
        caja.setBackground(fondo);

        LinearLayout textos = new LinearLayout(this);
        textos.setOrientation(LinearLayout.VERTICAL);
        caja.addView(textos, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        TextView arriba = new TextView(this);
        arriba.setText(TextUtils.isEmpty(titulo) ? "Parada" : titulo);
        arriba.setTextColor(TINTA);
        arriba.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        arriba.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        arriba.setSingleLine(true);
        arriba.setEllipsize(TextUtils.TruncateAt.END);
        textos.addView(arriba);

        if (!TextUtils.isEmpty(detalle)) {
            TextView abajo = new TextView(this);
            abajo.setText(detalle);
            abajo.setTextColor(GRIS);
            abajo.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            abajo.setSingleLine(true);
            abajo.setEllipsize(TextUtils.TruncateAt.END);
            textos.addView(abajo);
        }

        Button volver = new Button(this);
        volver.setText("Volver a ARES");
        volver.setAllCaps(false);
        volver.setTextColor(Color.WHITE);
        volver.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        volver.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable boton = new GradientDrawable();
        boton.setColor(NARANJA);
        boton.setCornerRadius(dp(18));
        volver.setBackground(boton);
        volver.setPadding(dp(14), 0, dp(14), 0);
        volver.setMinHeight(dp(40));
        volver.setMinimumHeight(dp(40));
        volver.setOnClickListener(v -> terminar("volvio", null));
        LinearLayout.LayoutParams lugarBoton = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(40));
        lugarBoton.setMarginStart(dp(10));
        caja.addView(volver, lugarBoton);
        return caja;
    }

    // ---------------------------------------------------------------- ciclo de vida
    // El NavigationView necesita cada paso del ciclo de vida de la pantalla.

    @Override
    protected void onStart() {
        super.onStart();
        vista.onStart();
    }

    @Override
    protected void onResume() {
        super.onResume();
        vista.onResume();
    }

    @Override
    protected void onPause() {
        vista.onPause();
        super.onPause();
    }

    @Override
    protected void onStop() {
        vista.onStop();
        super.onStop();
    }

    @Override
    protected void onSaveInstanceState(Bundle estado) {
        super.onSaveInstanceState(estado);
        vista.onSaveInstanceState(estado);
    }

    @Override
    public void onConfigurationChanged(Configuration nueva) {
        super.onConfigurationChanged(nueva);
        vista.onConfigurationChanged(nueva);
    }

    @Override
    public void onTrimMemory(int nivel) {
        super.onTrimMemory(nivel);
        vista.onTrimMemory(nivel);
    }

    @Override
    protected void onDestroy() {
        vista.onDestroy();
        // Libera el GPS y el servicio de Google al salir de verdad.
        if (isFinishing() && navegador != null) navegador.cleanup();
        super.onDestroy();
    }
}
