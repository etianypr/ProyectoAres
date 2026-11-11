package cl.dashund.ares;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

import java.util.Collections;
import java.util.List;

/**
 * Los recuadros sobre la cámara del escáner en vivo: lo que está leyendo, encima del
 * texto (dueño, 2026-11-11: «en la cámara se ve en verde lo que está leyendo»), uno
 * por encargo entero y con su OF escrita arriba («si me marcas con rectángulos
 * pequeños no entiendo qué estoy leyendo»). Va entre la vista previa y la WebView, y
 * se dibuja aquí y no en la web: con la cámara encendida, cada redibujo de la WebView
 * traba la pantalla 1 a 5 s (spec 028).
 *
 * Qué es cada recuadro lo decide la web (el lector de la nómina); esta vista solo
 * dibuja. Ningún estado depende solo del color: la recién confirmada va rellena y su
 * etiqueta empieza con ✓; la que se está leyendo va punteada y su etiqueta, con «…»;
 * cualquier otro tipo (la OF ya cargada, «cargada») va con una línea fina, sin etiqueta.
 */
final class MarcasEscaner extends View {

    /** Un recuadro ya en coordenadas de esta vista. */
    static final class Marca {
        final RectF caja;
        final String tipo;
        /** Lo que va escrito arriba del recuadro (la OF), o null. */
        final String etiqueta;

        Marca(RectF caja, String tipo, String etiqueta) {
            this.caja = caja;
            this.tipo = tipo;
            this.etiqueta = etiqueta;
        }
    }

    /** Sin marcas nuevas en este tiempo, se borran: la cámara ya no ve ese texto. */
    private static final long VIGENCIA_MS = 600;

    private static final int VERDE = Color.rgb(46, 158, 79);
    private static final int AMBAR = Color.rgb(224, 161, 0);

    private final float dp;
    private final Paint confirmadaRelleno = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint confirmadaBorde = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint leyendoBorde = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textoBorde = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint etiquetaFondo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint etiquetaTexto = new Paint(Paint.ANTI_ALIAS_FLAG);
    private List<Marca> marcas = Collections.emptyList();
    private final Runnable borrar = () -> {
        marcas = Collections.emptyList();
        invalidate();
    };

    MarcasEscaner(Context contexto) {
        super(contexto);
        dp = contexto.getResources().getDisplayMetrics().density;
        setWillNotDraw(false);
        setClickable(false);
        setFocusable(false);

        confirmadaRelleno.setStyle(Paint.Style.FILL);
        confirmadaRelleno.setColor(VERDE);
        confirmadaRelleno.setAlpha(60);
        confirmadaBorde.setStyle(Paint.Style.STROKE);
        confirmadaBorde.setColor(VERDE);
        confirmadaBorde.setStrokeWidth(4 * dp);

        leyendoBorde.setStyle(Paint.Style.STROKE);
        leyendoBorde.setColor(AMBAR);
        leyendoBorde.setStrokeWidth(3 * dp);
        leyendoBorde.setPathEffect(new DashPathEffect(new float[] { 8 * dp, 5 * dp }, 0));

        textoBorde.setStyle(Paint.Style.STROKE);
        textoBorde.setColor(Color.WHITE);
        textoBorde.setAlpha(150);
        textoBorde.setStrokeWidth(1.5f * dp);

        etiquetaFondo.setStyle(Paint.Style.FILL);
        etiquetaTexto.setFakeBoldText(true);
        etiquetaTexto.setTextSize(16 * dp);
    }

    /** En el hilo de la pantalla. */
    void mostrar(List<Marca> nuevas) {
        marcas = nuevas;
        removeCallbacks(borrar);
        postDelayed(borrar, VIGENCIA_MS);
        invalidate();
    }

    @Override
    protected void onDetachedFromWindow() {
        removeCallbacks(borrar);
        super.onDetachedFromWindow();
    }

    @Override
    protected void onDraw(Canvas lienzo) {
        float borde = 6 * dp;
        float radio = 8 * dp;
        for (Marca m : marcas) {
            RectF r = new RectF(m.caja);
            r.inset(-borde, -borde);
            switch (m.tipo) {
                case "confirmada":
                    lienzo.drawRoundRect(r, radio, radio, confirmadaRelleno);
                    lienzo.drawRoundRect(r, radio, radio, confirmadaBorde);
                    etiqueta(lienzo, r, m.etiqueta, VERDE, Color.WHITE);
                    break;
                case "leyendo":
                    lienzo.drawRoundRect(r, radio, radio, leyendoBorde);
                    etiqueta(lienzo, r, m.etiqueta, AMBAR, Color.BLACK);
                    break;
                default:
                    lienzo.drawRoundRect(r, radio, radio, textoBorde);
                    break;
            }
        }
    }

    /** La etiqueta arriba a la izquierda del recuadro, encima del borde; si no cabe
     *  arriba (el encargo toca el borde de la pantalla), por dentro. */
    private void etiqueta(Canvas lienzo, RectF r, String texto, int fondo, int color) {
        if (texto == null || texto.isEmpty()) return;
        float relleno = 6 * dp;
        float ancho = etiquetaTexto.measureText(texto) + 2 * relleno;
        float alto = etiquetaTexto.getTextSize() + 2 * relleno * 0.6f;
        float arriba = r.top - alto + 2 * dp;
        if (arriba < 0) arriba = r.top + 2 * dp;
        RectF pastilla = new RectF(r.left, arriba, r.left + ancho, arriba + alto);
        etiquetaFondo.setColor(fondo);
        lienzo.drawRoundRect(pastilla, alto / 2, alto / 2, etiquetaFondo);
        etiquetaTexto.setColor(color);
        float base = pastilla.centerY() - (etiquetaTexto.descent() + etiquetaTexto.ascent()) / 2;
        lienzo.drawText(texto, pastilla.left + relleno, base, etiquetaTexto);
    }
}
