package cl.dashund.ares;

import android.content.Context;
import android.content.res.Resources;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * Las piezas con que se arma la burbuja (spec 020 y 046): los colores, las letras y las formas de
 * «Plano» (tema-dashund.css), y la dirección que se achica sin perder el número. Salieron de
 * BurbujaVista cuando la 046 le sumó la foto, las fichas y las siguientes paradas.
 */
final class BurbujaPiezas {

    static final int TINTA = 0xFF221A15;
    static final int GRIS = 0xFF6B5F57;
    static final int PAPEL = 0xFFFDFBF9;
    static final int FONDO = 0xFFF4F0EC;
    static final int BORDE = 0xFFD9CFC6;
    static final int BORDE_FUERTE = 0xFFBFB1A5;
    /** Naranja de los botones con texto blanco (AA); el del mapa va en el círculo. */
    static final int MARCA = 0xFFC4491A;
    static final int MARCA_SUAVE = 0xFFFFF4EF;
    static final int NARANJA_MAPA = 0xFFD4531A;
    static final int OK = 0xFF0F6B45;
    static final int OK_SUAVE = 0xFFE3F1EA;
    static final int OK_BORDE = 0xFFA9D2B9;
    static final int PELIGRO = 0xFFB3261E;
    static final int AVISO = 0xFF7A5200;
    static final int AVISO_SUAVE = 0xFFFDF3D9;
    /** El POR PAGAR en amarillo (spec 046; dueño, 2026-11-20). */
    static final int COBRO = 0xFF5F4100;
    static final int COBRO_SUAVE = 0xFFFBE38E;
    static final int COBRO_BORDE = 0xFFD9B443;

    /** Los botones del paso, como los de la hoja de ARES (48 px). */
    static final int ALTO_BOTON = 48;
    /** Los íconos de la cabecera: lo mínimo para el pulgar. */
    static final int LADO_ICONO = 44;

    /** Los pesos de Manrope que usa ARES; CIFRAS es IBM Plex Mono (OF, km, horas). */
    enum Letra {
        NORMAL(400), NEGRITA(700), GRUESA(800), CIFRAS(600);

        final int peso;

        Letra(int peso) {
            this.peso = peso;
        }
    }

    private BurbujaPiezas() {}

    static TextView texto(Context c, String valor, float sp, int color, Letra letra, int lineas) {
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

    /**
     * La dirección en un renglón (spec 046): la letra baja de `maxSp` a `minSp` hasta que cabe y,
     * si aun así no cabe, se corta la calle con «…» y el número queda siempre. Se ajusta cuando
     * el texto ya tiene su ancho.
     */
    static TextView direccion(Context c, String calle, String numero, float maxSp, float minSp, int color) {
        String completa = numero == null ? calle : calle + " " + numero;
        TextView t = texto(c, completa, maxSp, color, Letra.GRUESA, 1);
        t.setEllipsize(null);
        // Cada vez que se acomoda: si ya quedó como debía, `ajustar` no cambia nada y no vuelve a
        // pedir otro acomodo.
        t.addOnLayoutChangeListener((v, izq, arriba, der, abajo, izqAntes, arribaAntes, derAntes, abajoAntes) -> {
            int ancho = der - izq - t.getPaddingLeft() - t.getPaddingRight();
            if (ancho > 0) t.post(() -> ajustar(c, t, calle, numero, maxSp, minSp, ancho));
        });
        return t;
    }

    private static void ajustar(Context c, TextView t, String calle, String numero, float maxSp, float minSp, int ancho) {
        String cola = numero == null ? "" : " " + numero;
        Paint medida = new Paint(t.getPaint());
        float sp = maxSp;
        for (; sp > minSp; sp -= 1f) {
            medida.setTextSize(spEnPx(c, sp));
            if (medida.measureText(calle + cola) <= ancho) break;
        }
        medida.setTextSize(spEnPx(c, sp));
        String texto = calle + cola;
        if (medida.measureText(texto) > ancho) {
            int n = calle.length();
            while (n > 1 && medida.measureText(calle.substring(0, n).trim() + "…" + cola) > ancho) n--;
            texto = calle.substring(0, n).trim() + "…" + cola;
        }
        if (texto.contentEquals(t.getText()) && Math.abs(t.getTextSize() - spEnPx(c, sp)) < 0.5f) return;
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setText(texto);
    }

    private static float spEnPx(Context c, float sp) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, c.getResources().getDisplayMetrics());
    }

    /** La letra de la APK; si no carga, la del sistema (nunca una burbuja sin texto). */
    private static Typeface fuente(Context c, int id, Typeface respaldo) {
        try {
            return c.getResources().getFont(id);
        } catch (Resources.NotFoundException e) {
            return respaldo;
        }
    }

    /** Un botón redondo con solo el ícono; el texto queda para TalkBack. */
    static ImageView icono(Context c, int icono, String texto, int color, GradientDrawable fondo, int ladoDp, int iconoDp) {
        ImageView boton = imagen(c, icono, color);
        int margen = dp(c, (ladoDp - iconoDp) / 2f);
        boton.setPadding(margen, margen, margen, margen);
        if (fondo != null) boton.setBackground(fondo);
        boton.setContentDescription(texto);
        boton.setClickable(true);
        boton.setFocusable(true);
        return boton;
    }

    static ImageView imagen(Context c, int icono, int color) {
        ImageView imagen = new ImageView(c);
        if (icono != 0) imagen.setImageResource(icono);
        imagen.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        imagen.setScaleType(ImageView.ScaleType.FIT_CENTER);
        return imagen;
    }

    /** El círculo de llamar (spec 046): naranja sobre naranja claro, con el borde del trazo
     *  de su ícono (1,5 dp). */
    static GradientDrawable fondoLlamar(Context c) {
        GradientDrawable fondo = ovalo(c, MARCA_SUAVE, 0);
        fondo.setStroke(dp(c, 1.5f), MARCA);
        return fondo;
    }

    static LinearLayout.LayoutParams lugarIcono(Context c) {
        LinearLayout.LayoutParams lugar = new LinearLayout.LayoutParams(dp(c, LADO_ICONO), dp(c, LADO_ICONO));
        lugar.setMarginStart(dp(c, 4));
        return lugar;
    }

    static LinearLayout.LayoutParams ancho() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    /** Un texto de la vista, o null si no vino o vino vacío (una web anterior no lo trae). */
    static String cadena(JSONObject o, String clave) {
        if (o == null || o.isNull(clave)) return null;
        String valor = o.optString(clave, "").trim();
        return valor.isEmpty() ? null : valor;
    }

    static GradientDrawable fondo(Context c, int color, int borde, int radioDp) {
        GradientDrawable fondo = new GradientDrawable();
        fondo.setColor(color);
        fondo.setCornerRadius(dp(c, radioDp));
        if (borde != 0) fondo.setStroke(dp(c, 1), borde);
        return fondo;
    }

    static GradientDrawable ovalo(Context c, int color, int borde) {
        GradientDrawable fondo = new GradientDrawable();
        fondo.setShape(GradientDrawable.OVAL);
        fondo.setColor(color);
        if (borde != 0) fondo.setStroke(dp(c, borde == 0xFFFFFFFF ? 2 : 1), borde);
        return fondo;
    }

    /** Un texto de un renglón, centrado y sin el aire de arriba de la letra (fichas, círculos). */
    static TextView textoCentrado(Context c, String valor, float sp, int color, Letra letra) {
        TextView t = texto(c, valor, sp, color, letra, 1);
        t.setGravity(android.view.Gravity.CENTER);
        t.setIncludeFontPadding(false);
        return t;
    }

    /** El círculo naranja con el número de una parada (la de la tarjeta y las siguientes). */
    static TextView numeroDeParada(Context c, int secuencia, float sp) {
        TextView numero = texto(c, String.valueOf(secuencia), sp, 0xFFFFFFFF, Letra.NEGRITA, 1);
        numero.setGravity(android.view.Gravity.CENTER);
        numero.setIncludeFontPadding(false);
        numero.setBackground(ovalo(c, MARCA, 0));
        return numero;
    }

    static int dp(Context c, float valor) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, valor, c.getResources().getDisplayMetrics()));
    }

    /** Columna con alto máximo: la burbuja abierta no tapa más de un tercio de la
     *  pantalla (SC-007). Lo que no cabe lo absorbe la fila con peso (los botones). */
    static final class Columna extends LinearLayout {
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
