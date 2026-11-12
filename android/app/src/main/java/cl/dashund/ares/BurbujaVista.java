package cl.dashund.ares;

import android.content.Context;
import android.content.res.Resources;
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
 * ARES. Vistas armadas en código con «Plano» (tema-dashund.css): sus colores, Manrope,
 * IBM Plex Mono para la OF y los íconos de lucide que usa ARES.
 *
 * La tarjeta es la propuesta B que eligió el dueño (2026-11-12): Navegar, Volver a
 * ARES y Achicar como íconos en la cabecera, y el paquete con su POR PAGAR y el
 * destinatario en un renglón cada uno, para no tapar más de un tercio de Google Maps.
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
    private static final int MARCA_SUAVE = 0xFFFFF4EF;
    private static final int NARANJA_MAPA = 0xFFD4531A;
    private static final int OK = 0xFF0F6B45;
    private static final int PELIGRO = 0xFFB3261E;
    private static final int PELIGRO_SUAVE = 0xFFFBE7E4;
    private static final int AVISO = 0xFF7A5200;
    private static final int AVISO_SUAVE = 0xFFFDF3D9;

    /** Los botones del paso, como los de la hoja de ARES (48 px). */
    private static final int ALTO_BOTON = 48;
    /** Los íconos de la cabecera: lo mínimo para el pulgar. */
    private static final int LADO_ICONO = 44;

    /** Los pesos de Manrope que usa ARES; CIFRAS es IBM Plex Mono (OF, km, horas). */
    private enum Letra {
        NORMAL(400), NEGRITA(700), GRUESA(800), CIFRAS(600);

        final int peso;

        Letra(int peso) {
            this.peso = peso;
        }
    }

    private BurbujaVista() {}

    /** La tarjeta a lo ancho, pegada abajo. Si los botones no caben en `maxAlto`
     *  (las salidas, con su detalle), solo ellos se desplazan: lo fijo se ve siempre. */
    static View tarjeta(Context c, JSONObject vista, Toques t, int maxAlto) {
        Columna caja = new Columna(c, maxAlto);
        caja.setPadding(dp(c, 14), dp(c, 8), dp(c, 10), dp(c, 12));
        caja.setBackground(fondo(c, PAPEL, BORDE, 20));

        // Cabecera: el número de parada, la OF y los tres íconos fijos. Navegar y
        // Volver a ARES se alcanzan siempre (FR-003, FR-004).
        LinearLayout cabeza = new LinearLayout(c);
        cabeza.setGravity(Gravity.CENTER_VERTICAL);
        int secuencia = vista.optInt("secuencia", 0);
        if (secuencia > 0) {
            TextView numero = texto(c, String.valueOf(secuencia), 13, Color.WHITE, Letra.NEGRITA, 1);
            numero.setGravity(Gravity.CENTER);
            numero.setBackground(ovalo(c, MARCA, 0));
            LinearLayout.LayoutParams lugarNumero = new LinearLayout.LayoutParams(dp(c, 32), dp(c, 32));
            lugarNumero.setMarginEnd(dp(c, 10));
            cabeza.addView(numero, lugarNumero);
        }
        cabeza.addView(texto(c, vista.optString("titulo"), 18, TINTA, Letra.CIFRAS, 1),
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        View navegar = icono(c, R.drawable.ic_burbuja_navegar, "Navegar", MARCA, ovalo(c, MARCA_SUAVE, 0), LADO_ICONO, 18);
        navegar.setOnClickListener(v -> t.tocar("navegar", false));
        cabeza.addView(navegar, lugarIcono(c));
        View ares = icono(c, R.drawable.ic_burbuja_ares, "Volver a ARES", TINTA, ovalo(c, PAPEL, BORDE), LADO_ICONO, 18);
        ares.setOnClickListener(v -> t.tocar("ares", true));
        cabeza.addView(ares, lugarIcono(c));
        View achicar = icono(c, R.drawable.ic_burbuja_achicar, "Achicar", GRIS, null, LADO_ICONO, 24);
        achicar.setOnClickListener(v -> t.achicar());
        cabeza.addView(achicar, lugarIcono(c));
        caja.addView(cabeza, ancho());

        // Cómo es el paquete, para sacarlo de la camioneta sin leer etiquetas (spec
        // 003), y lo que hay que cobrar, en palabras y no solo en color (spec 005).
        String paquete = cadena(vista, "paquete");
        String porPagar = cadena(vista, "porPagar");
        if (paquete != null || porPagar != null) {
            LinearLayout renglon = new LinearLayout(c);
            renglon.setGravity(Gravity.CENTER_VERTICAL);
            if (paquete != null) {
                renglon.addView(texto(c, paquete, 16, MARCA, Letra.NEGRITA, 1),
                    new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            }
            if (porPagar != null) {
                TextView cobro = texto(c, porPagar, 13, PELIGRO, Letra.GRUESA, 1);
                cobro.setPadding(dp(c, 8), dp(c, 2), dp(c, 8), dp(c, 2));
                cobro.setBackground(fondo(c, PELIGRO_SUAVE, 0, 8));
                LinearLayout.LayoutParams lugarCobro = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
                if (paquete != null) lugarCobro.setMarginStart(dp(c, 8));
                renglon.addView(cobro, lugarCobro);
            }
            LinearLayout.LayoutParams lugar = ancho();
            lugar.topMargin = dp(c, 2);
            caja.addView(renglon, lugar);
        }

        // A quién y dónde, en un renglón.
        String detalle = cadena(vista, "detalle");
        if (detalle != null) caja.addView(texto(c, detalle, 13, GRIS, Letra.NORMAL, 1), ancho());

        // Lo que contestó el receptor: texto y color, nunca solo color.
        JSONObject estado = vista.optJSONObject("estado");
        if (estado != null) {
            TextView linea = texto(c, estado.optString("texto"), 12, colorDeEstado(estado.optString("tono")), Letra.NEGRITA, 1);
            linea.setPadding(0, dp(c, 2), 0, 0);
            caja.addView(linea, ancho());
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
                renglon.setGravity(Gravity.CENTER_VERTICAL);
                for (int j = 0; j < fila.length(); j++) {
                    JSONObject b = fila.optJSONObject(j);
                    if (b != null) agregarBoton(c, renglon, b, t, j > 0);
                }
                LinearLayout.LayoutParams lugarFila = ancho();
                lugarFila.topMargin = dp(c, 8);
                botones.addView(renglon, lugarFila);
            }
            ScrollView desplazable = new ScrollView(c);
            desplazable.addView(botones);
            caja.addView(desplazable, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        }

        // Lo último que se cerró, con "Deshacer" mientras se pueda, o el ⚠ de una
        // parada que viene (spec 022: ya trae el ⚠ escrito, el color lo acompaña).
        JSONObject aviso = vista.optJSONObject("aviso");
        if (aviso != null) {
            String texto = aviso.optString("texto");
            boolean advertencia = texto.startsWith("⚠");
            LinearLayout renglon = new LinearLayout(c);
            renglon.setGravity(Gravity.CENTER_VERTICAL);
            renglon.setPadding(dp(c, 12), dp(c, 4), dp(c, 4), dp(c, 4));
            renglon.setMinimumHeight(dp(c, 44));
            renglon.setBackground(fondo(c, advertencia ? AVISO_SUAVE : FONDO, 0, 14));
            renglon.addView(texto(c, texto, 13, advertencia ? AVISO : TINTA, advertencia ? Letra.NEGRITA : Letra.NORMAL, 2),
                new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
            if (aviso.optBoolean("deshacer")) {
                View deshacer = pildora(c, R.drawable.ic_burbuja_deshacer, "Deshacer", null, "borde-marca", dp(c, 36), 13);
                deshacer.setOnClickListener(v -> t.tocar("deshacer", false));
                renglon.addView(deshacer, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT, dp(c, 36)));
            }
            LinearLayout.LayoutParams lugarAviso = ancho();
            lugarAviso.topMargin = dp(c, 8);
            caja.addView(renglon, lugarAviso);
        }
        return caja;
    }

    /** Achicada: un círculo naranja del tamaño de los botones de Google Maps, con
     *  "Parada" y el número (el número solo no decía de qué era; el vivo,
     *  2026-11-05). El servicio lo pone sobre el velocímetro de Google Maps. */
    static View circulo(Context c, int secuencia) {
        LinearLayout caja = new LinearLayout(c);
        caja.setOrientation(LinearLayout.VERTICAL);
        caja.setGravity(Gravity.CENTER);
        caja.setBackground(ovalo(c, NARANJA_MAPA, Color.WHITE));
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
        TextView t = texto(c, valor, sp, Color.WHITE, Letra.GRUESA, 1);
        t.setGravity(Gravity.CENTER);
        t.setIncludeFontPadding(false);
        return t;
    }

    private static void agregarBoton(Context c, LinearLayout renglon, JSONObject b, Toques t, boolean conMargen) {
        String id = b.optString("id");
        String texto = b.optString("texto");
        String tono = b.optString("tono", "neutro");
        boolean soloIcono = b.optBoolean("soloIcono");
        View boton = soloIcono
            ? icono(c, iconoDe(id), texto, colorDeTexto(tono), fondoDeTono(c, tono, true), ALTO_BOTON, 20)
            : pildora(c, iconoDe(id), texto, cadena(b, "detalle"), tono, dp(c, ALTO_BOTON), 14);
        boolean abreAres = b.optBoolean("abreAres");
        boton.setOnClickListener(v -> t.tocar(id, abreAres));
        LinearLayout.LayoutParams lugar = soloIcono
            ? new LinearLayout.LayoutParams(dp(c, ALTO_BOTON), dp(c, ALTO_BOTON))
            : new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        if (conMargen) lugar.setMarginStart(dp(c, 8));
        renglon.addView(boton, lugar);
    }

    /** El ícono de cada botón, el mismo de la tarjeta de ARES (parada-activa.tsx). */
    private static int iconoDe(String id) {
        switch (id) {
            case "entregado":
                return R.drawable.ic_burbuja_paquete;
            case "llamar":
                return R.drawable.ic_burbuja_telefono;
            case "escanear":
                return R.drawable.ic_burbuja_escanear;
            case "telefono":
                return R.drawable.ic_burbuja_lapiz;
            case "pendiente":
                return R.drawable.ic_burbuja_reintentar;
            case "no_se_pudo":
            case "no_entregado":
                return R.drawable.ic_burbuja_cerrar;
            default:
                return 0;
        }
    }

    /** Un botón redondeado: el ícono y el texto y, en las salidas, la consecuencia debajo. */
    private static View pildora(Context c, int icono, String texto, String detalle, String tono, int altoMinimo, float sp) {
        LinearLayout caja = new LinearLayout(c);
        caja.setOrientation(LinearLayout.VERTICAL);
        caja.setGravity(Gravity.CENTER);
        caja.setMinimumHeight(altoMinimo);
        caja.setPadding(dp(c, 12), dp(c, 4), dp(c, 12), dp(c, 4));
        caja.setBackground(fondoDeTono(c, tono, false));
        caja.setClickable(true);
        int color = colorDeTexto(tono);
        LinearLayout renglon = new LinearLayout(c);
        renglon.setGravity(Gravity.CENTER);
        if (icono != 0) {
            int lado = dp(c, sp + 4);
            LinearLayout.LayoutParams lugarIcono = new LinearLayout.LayoutParams(lado, lado);
            lugarIcono.setMarginEnd(dp(c, 6));
            renglon.addView(imagen(c, icono, color), lugarIcono);
        }
        TextView principal = texto(c, texto, sp, color, Letra.NEGRITA, 2);
        principal.setGravity(Gravity.CENTER);
        renglon.addView(principal);
        caja.addView(renglon);
        if (detalle != null) {
            TextView abajo = texto(c, detalle, 12, tono.equals("neutro") ? GRIS : color, Letra.NORMAL, 2);
            abajo.setGravity(Gravity.CENTER);
            caja.addView(abajo);
        }
        return caja;
    }

    /** Un botón redondo con solo el ícono; el texto queda para TalkBack. */
    private static View icono(Context c, int icono, String texto, int color, GradientDrawable fondo, int ladoDp, int iconoDp) {
        ImageView boton = imagen(c, icono, color);
        int margen = dp(c, (ladoDp - iconoDp) / 2f);
        boton.setPadding(margen, margen, margen, margen);
        if (fondo != null) boton.setBackground(fondo);
        boton.setContentDescription(texto);
        boton.setClickable(true);
        boton.setFocusable(true);
        return boton;
    }

    private static ImageView imagen(Context c, int icono, int color) {
        ImageView imagen = new ImageView(c);
        if (icono != 0) imagen.setImageResource(icono);
        imagen.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        imagen.setScaleType(ImageView.ScaleType.FIT_CENTER);
        return imagen;
    }

    private static LinearLayout.LayoutParams lugarIcono(Context c) {
        LinearLayout.LayoutParams lugar = new LinearLayout.LayoutParams(dp(c, LADO_ICONO), dp(c, LADO_ICONO));
        lugar.setMarginStart(dp(c, 4));
        return lugar;
    }

    private static LinearLayout.LayoutParams ancho() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    /** Un texto de la vista, o null si no vino o vino vacío (una APK nueva con una
     *  web anterior no trae `paquete` ni `porPagar`). */
    private static String cadena(JSONObject o, String clave) {
        if (o.isNull(clave)) return null;
        String valor = o.optString(clave, "").trim();
        return valor.isEmpty() ? null : valor;
    }

    /** Los tonos de botones-parada.ts: relleno con texto blanco, o borde con texto de color. */
    private static GradientDrawable fondoDeTono(Context c, String tono, boolean redondo) {
        int relleno;
        int borde = 0;
        switch (tono) {
            case "marca":
                relleno = MARCA;
                break;
            case "ok":
                relleno = OK;
                break;
            case "peligro":
                relleno = PELIGRO;
                break;
            default:
                relleno = PAPEL;
                borde = BORDE;
        }
        return redondo ? ovalo(c, relleno, borde) : fondo(c, relleno, borde, ALTO_BOTON / 2);
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

    private static GradientDrawable fondo(Context c, int color, int borde, int radioDp) {
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(color);
        fondo.setCornerRadius(dp(c, radioDp));
        if (borde != 0) fondo.setStroke(dp(c, 1), borde);
        return fondo;
    }

    private static GradientDrawable ovalo(Context c, int color, int borde) {
        GradientDrawable fondo = new GradientDrawable();
        fondo.setShape(GradientDrawable.OVAL);
        fondo.setColor(color);
        if (borde != 0) fondo.setStroke(dp(c, borde == Color.WHITE ? 2 : 1), borde);
        return fondo;
    }

    private static TextView texto(Context c, String valor, float sp, int color, Letra letra, int lineas) {
        TextView t = new TextView(c);
        t.setText(valor);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (letra == Letra.CIFRAS) {
            t.setTypeface(fuente(c, R.font.ibm_plex_mono_semibold, Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)));
        } else {
            t.setTypeface(fuente(c, R.font.manrope, Typeface.DEFAULT));
            // Manrope viene variable: el peso se elige acá, como font-weight en la web.
            t.setFontVariationSettings("'wght' " + letra.peso);
        }
        t.setMaxLines(lineas);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    /** La letra de la APK; si no carga, la del sistema (nunca una burbuja sin texto). */
    private static Typeface fuente(Context c, int id, Typeface respaldo) {
        try {
            return c.getResources().getFont(id);
        } catch (Resources.NotFoundException e) {
            return respaldo;
        }
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
