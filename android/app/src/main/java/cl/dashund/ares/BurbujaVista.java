package cl.dashund.ares;

import android.content.Context;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que se ve de la burbuja (spec 020): la tarjeta abierta y el círculo achicado.
 * Dibuja la vista que manda la web (data-model, `VistaBurbuja`) sin decidir nada:
 * los botones y sus textos vienen de botones-parada.ts, los mismos de la tarjeta de
 * ARES. Vistas armadas en código, con los colores de «Plano» (tema-dashund.css) y la
 * fuente del sistema, como la franja de la navegación de Google que se fue.
 */
final class BurbujaVista {

    /** Lo que pasa al tocar: el servicio lo resuelve (abrir ARES, Google Maps, avisar). */
    interface Toques {
        void tocar(String id, boolean abreAres);

        void achicar();
    }

    private static final int TINTA = 0xFF221A15;
    private static final int GRIS = 0xFF6B5F57;
    private static final int PAPEL = 0xFFFDFBF9;
    private static final int FONDO = 0xFFF4F0EC;
    private static final int BORDE = 0xFFD9CFC6;
    /** Naranja de los botones con texto blanco (AA); el del mapa va en el círculo. */
    private static final int MARCA = 0xFFC4491A;
    private static final int NARANJA_MAPA = 0xFFD4531A;
    private static final int OK = 0xFF0F6B45;
    private static final int PELIGRO = 0xFFB3261E;

    private static final int ALTO_BOTON = 46;

    private BurbujaVista() {}

    /** La tarjeta a lo ancho, pegada abajo. Si los botones no caben en `maxAlto`
     *  (las salidas, con su detalle), solo ellos se desplazan: lo fijo se ve siempre. */
    static View tarjeta(Context c, JSONObject vista, Toques t, int maxAlto) {
        Columna caja = new Columna(c, maxAlto);
        caja.setPadding(dp(c, 14), dp(c, 12), dp(c, 14), dp(c, 12));
        caja.setBackground(fondo(PAPEL, BORDE, dp(c, 20)));
        LinearLayout.LayoutParams lugar = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);

        // Título, a quién y dónde, y el control para achicar.
        LinearLayout cabeza = new LinearLayout(c);
        cabeza.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout textos = new LinearLayout(c);
        textos.setOrientation(LinearLayout.VERTICAL);
        textos.addView(texto(c, vista.optString("titulo"), 17, TINTA, Typeface.create(Typeface.MONOSPACE, Typeface.BOLD), 1));
        String detalle = vista.optString("detalle");
        if (!detalle.isEmpty()) textos.addView(texto(c, detalle, 13, GRIS, Typeface.DEFAULT, 2));
        cabeza.addView(textos, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        View achicar = pildora(c, "Achicar", null, "neutro", dp(c, 36));
        achicar.setOnClickListener(v -> t.achicar());
        LinearLayout.LayoutParams lugarAchicar = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(c, 36));
        lugarAchicar.setMarginStart(dp(c, 8));
        cabeza.addView(achicar, lugarAchicar);
        caja.addView(cabeza, lugar);

        // Lo que contestó el receptor: texto y color, nunca solo color.
        JSONObject estado = vista.optJSONObject("estado");
        if (estado != null) {
            TextView linea = texto(c, estado.optString("texto"), 12, colorDeEstado(estado.optString("tono")), Typeface.DEFAULT_BOLD, 1);
            linea.setPadding(0, dp(c, 4), 0, 0);
            caja.addView(linea, lugar);
        }

        // Los botones del paso, en filas que se reparten el ancho.
        JSONArray filas = vista.optJSONArray("filas");
        if (filas != null && filas.length() > 0) {
            LinearLayout botones = new LinearLayout(c);
            botones.setOrientation(LinearLayout.VERTICAL);
            for (int i = 0; i < filas.length(); i++) {
                JSONArray fila = filas.optJSONArray(i);
                if (fila == null || fila.length() == 0) continue;
                LinearLayout renglon = new LinearLayout(c);
                for (int j = 0; j < fila.length(); j++) {
                    JSONObject b = fila.optJSONObject(j);
                    if (b != null) agregarBoton(c, renglon, b, t, j > 0);
                }
                LinearLayout.LayoutParams lugarFila = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                lugarFila.topMargin = dp(c, 8);
                botones.addView(renglon, lugarFila);
            }
            ScrollView desplazable = new ScrollView(c);
            desplazable.addView(botones);
            caja.addView(desplazable, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        }

        // Lo último que se cerró, con "Deshacer" mientras se pueda.
        JSONObject aviso = vista.optJSONObject("aviso");
        if (aviso != null) {
            LinearLayout renglon = new LinearLayout(c);
            renglon.setGravity(Gravity.CENTER_VERTICAL);
            renglon.setPadding(dp(c, 12), dp(c, 4), dp(c, 4), dp(c, 4));
            renglon.setBackground(fondo(FONDO, 0, dp(c, 14)));
            renglon.addView(texto(c, aviso.optString("texto"), 13, TINTA, Typeface.DEFAULT, 2),
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            if (aviso.optBoolean("deshacer")) {
                View deshacer = pildora(c, "Deshacer", null, "borde-marca", dp(c, 36));
                deshacer.setOnClickListener(v -> t.tocar("deshacer", false));
                renglon.addView(deshacer, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, dp(c, 36)));
            }
            LinearLayout.LayoutParams lugarAviso = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            lugarAviso.topMargin = dp(c, 8);
            caja.addView(renglon, lugarAviso);
        }

        // Fijos: siempre se puede volver a Google Maps o a ARES (FR-003, FR-004).
        LinearLayout pie = new LinearLayout(c);
        agregarBoton(c, pie, fijo("navegar", "Navegar", "borde-marca", false), t, false);
        agregarBoton(c, pie, fijo("ares", "Volver a ARES", "neutro", true), t, true);
        LinearLayout.LayoutParams lugarPie = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lugarPie.topMargin = dp(c, 8);
        caja.addView(pie, lugarPie);
        return caja;
    }

    /** Achicada: un círculo naranja del tamaño de los botones de Google Maps, con
     *  "Parada" y el número (el número solo no decía de qué era; el vivo,
     *  2026-11-05). El servicio lo pone sobre el velocímetro de Google Maps. */
    static View circulo(Context c, int secuencia) {
        LinearLayout caja = new LinearLayout(c);
        caja.setOrientation(LinearLayout.VERTICAL);
        caja.setGravity(Gravity.CENTER);
        GradientDrawable fondo = new GradientDrawable();
        fondo.setShape(GradientDrawable.OVAL);
        fondo.setColor(NARANJA_MAPA);
        fondo.setStroke(dp(c, 2), Color.WHITE);
        caja.setBackground(fondo);
        if (secuencia > 0) {
            caja.addView(textoCirculo(c, "Parada", 10));
            caja.addView(textoCirculo(c, String.valueOf(secuencia), 18));
            caja.setContentDescription("Parada " + secuencia + " de ARES. Toca para abrir");
        } else {
            caja.addView(textoCirculo(c, "ARES", 12));
            caja.setContentDescription("ARES. Toca para abrir");
        }
        caja.setLayoutParams(new LinearLayout.LayoutParams(dp(c, 56), dp(c, 56)));
        return caja;
    }

    private static TextView textoCirculo(Context c, String valor, float sp) {
        TextView t = texto(c, valor, sp, Color.WHITE, Typeface.DEFAULT_BOLD, 1);
        t.setGravity(Gravity.CENTER);
        t.setIncludeFontPadding(false);
        return t;
    }

    private static JSONObject fijo(String id, String texto, String tono, boolean abreAres) {
        JSONObject b = new JSONObject();
        try {
            b.put("id", id).put("texto", texto).put("tono", tono).put("abreAres", abreAres);
        } catch (org.json.JSONException e) {
            // No pasa con claves fijas.
        }
        return b;
    }

    private static void agregarBoton(Context c, LinearLayout renglon, JSONObject b, Toques t, boolean conMargen) {
        String id = b.optString("id");
        String texto = b.optString("texto");
        String tono = b.optString("tono", "neutro");
        boolean soloIcono = b.optBoolean("soloIcono");
        String detalle = b.isNull("detalle") ? null : b.optString("detalle", null);
        View boton = soloIcono ? icono(c, id, texto, tono) : pildora(c, texto, detalle, tono, dp(c, ALTO_BOTON));
        boolean abreAres = b.optBoolean("abreAres");
        boton.setOnClickListener(v -> t.tocar(id, abreAres));
        LinearLayout.LayoutParams lugar = soloIcono
            ? new LinearLayout.LayoutParams(dp(c, ALTO_BOTON), dp(c, ALTO_BOTON))
            : new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        if (conMargen) lugar.setMarginStart(dp(c, 8));
        renglon.addView(boton, lugar);
    }

    /** Un botón redondeado: el texto y, en las salidas, la consecuencia debajo. */
    private static View pildora(Context c, String texto, String detalle, String tono, int altoMinimo) {
        LinearLayout caja = new LinearLayout(c);
        caja.setOrientation(LinearLayout.VERTICAL);
        caja.setGravity(Gravity.CENTER);
        caja.setMinimumHeight(altoMinimo);
        caja.setPadding(dp(c, 12), dp(c, 4), dp(c, 12), dp(c, 4));
        caja.setBackground(fondoDeTono(c, tono));
        caja.setClickable(true);
        int color = colorDeTexto(tono);
        TextView principal = texto(c, texto, 14, color, Typeface.DEFAULT_BOLD, 2);
        principal.setGravity(Gravity.CENTER);
        caja.addView(principal);
        if (detalle != null && !detalle.isEmpty()) {
            TextView abajo = texto(c, detalle, 12, tono.equals("neutro") ? GRIS : color, Typeface.DEFAULT, 2);
            abajo.setGravity(Gravity.CENTER);
            caja.addView(abajo);
        }
        return caja;
    }

    /** El botón redondo del medio (llamar, o escanear la etiqueta si no hay
     *  teléfono): solo el ícono; el texto queda para TalkBack. */
    private static View icono(Context c, String id, String texto, String tono) {
        ImageView imagen = new ImageView(c);
        imagen.setImageResource("escanear".equals(id) ? android.R.drawable.ic_menu_camera : android.R.drawable.ic_menu_call);
        imagen.setColorFilter(colorDeTexto(tono), PorterDuff.Mode.SRC_IN);
        imagen.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        imagen.setPadding(dp(c, 10), dp(c, 10), dp(c, 10), dp(c, 10));
        GradientDrawable fondo = fondoDeTono(c, tono);
        fondo.setShape(GradientDrawable.OVAL);
        imagen.setBackground(fondo);
        imagen.setContentDescription(texto);
        imagen.setClickable(true);
        return imagen;
    }

    /** Los tonos de botones-parada.ts: relleno con texto blanco, o borde con texto de color. */
    private static GradientDrawable fondoDeTono(Context c, String tono) {
        switch (tono) {
            case "marca":
                return fondo(MARCA, 0, dp(c, ALTO_BOTON / 2));
            case "ok":
                return fondo(OK, 0, dp(c, ALTO_BOTON / 2));
            case "peligro":
                return fondo(PELIGRO, 0, dp(c, ALTO_BOTON / 2));
            default:
                return fondo(PAPEL, BORDE, dp(c, ALTO_BOTON / 2));
        }
    }

    private static int colorDeTexto(String tono) {
        switch (tono) {
            case "marca":
            case "ok":
            case "peligro":
                return Color.WHITE;
            case "borde-marca":
                return MARCA;
            case "borde-ok":
                return OK;
            case "borde-peligro":
                return PELIGRO;
            default:
                return TINTA;
        }
    }

    private static int colorDeEstado(String tono) {
        switch (tono) {
            case "marca":
                return MARCA;
            case "ok":
                return OK;
            default:
                return GRIS;
        }
    }

    private static GradientDrawable fondo(int color, int borde, int radio) {
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(color);
        fondo.setCornerRadius(radio);
        if (borde != 0) fondo.setStroke(2, borde);
        return fondo;
    }

    private static TextView texto(Context c, String valor, float sp, int color, Typeface letra, int lineas) {
        TextView t = new TextView(c);
        t.setText(valor);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(letra);
        t.setMaxLines(lineas);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    static int dp(Context c, float valor) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, valor, c.getResources().getDisplayMetrics()));
    }

    /** Columna con alto máximo: la burbuja abierta no tapa más de un tercio de la
     *  pantalla (SC-007). Lo que no cabe lo absorbe la fila con peso (los botones). */
    private static final class Columna extends LinearLayout {
        private final int maxAlto;

        Columna(Context c, int maxAlto) {
            super(c);
            this.maxAlto = maxAlto;
            setOrientation(VERTICAL);
        }

        @Override
        protected void onMeasure(int anchoSpec, int altoSpec) {
            int alto = MeasureSpec.getSize(altoSpec);
            int tope = MeasureSpec.getMode(altoSpec) == MeasureSpec.UNSPECIFIED ? maxAlto : Math.min(alto, maxAlto);
            super.onMeasure(anchoSpec, MeasureSpec.makeMeasureSpec(tope, MeasureSpec.AT_MOST));
        }
    }
}
