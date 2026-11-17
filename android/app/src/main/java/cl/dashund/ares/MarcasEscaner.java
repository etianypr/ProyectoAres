package cl.dashund.ares;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
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
 * un hueco (un encargo que la cámara se saltó, spec 036) va punteado en blanco con «?»;
 * cualquier otro tipo (la OF ya cargada, «cargada») va con una línea fina, sin etiqueta.
 *
 * Spec 036 (dueño, 2026-11-16: «si me salté una OF, que marque con un ícono hacia dónde se
 * encuentra, en la cámara en vivo y no como texto»): las flechas. Una pastilla centrada en
 * el borde de arriba (▲, más arriba en la nómina) o de abajo (▼) de la zona libre del
 * recuadro, con la flecha dibujada y la OF y cuántos encargos hay hasta ella. Ámbar si es
 * una OF que falta confirmar; oscura, con borde punteado y «?», si es un hueco.
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

    /** Una flecha a lo que falta: "arriba" o "abajo", "falta" o "hueco", y lo que dice. */
    static final class Flecha {
        final String sentido;
        final String tipo;
        final String etiqueta;

        Flecha(String sentido, String tipo, String etiqueta) {
            this.sentido = sentido;
            this.tipo = tipo;
            this.etiqueta = etiqueta;
        }
    }

    /** Sin marcas nuevas en este tiempo, se borran: la cámara ya no ve ese texto. */
    private static final long VIGENCIA_MS = 600;

    private static final int VERDE = Color.rgb(46, 158, 79);
    private static final int AMBAR = Color.rgb(224, 161, 0);
    /** El fondo de la pastilla de un hueco: un neutro cálido oscuro, como el resto de ARES. */
    private static final int OSCURO = Color.argb(225, 32, 27, 24);

    private final float dp;
    private final Paint confirmadaRelleno = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint confirmadaBorde = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint leyendoBorde = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint huecoBorde = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textoBorde = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint etiquetaFondo = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint etiquetaTexto = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint flechaTexto = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint flechaForma = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path punta = new Path();
    private List<Marca> marcas = Collections.emptyList();
    private List<Flecha> flechas = Collections.emptyList();
    /** La parte del recuadro que se ve y no tapa la pantalla; null: toda la vista. */
    private RectF zona;
    private final Runnable borrar = () -> {
        marcas = Collections.emptyList();
        flechas = Collections.emptyList();
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

        huecoBorde.setStyle(Paint.Style.STROKE);
        huecoBorde.setColor(Color.WHITE);
        huecoBorde.setStrokeWidth(2.5f * dp);
        huecoBorde.setPathEffect(new DashPathEffect(new float[] { 4 * dp, 4 * dp }, 0));

        textoBorde.setStyle(Paint.Style.STROKE);
        textoBorde.setColor(Color.WHITE);
        textoBorde.setAlpha(150);
        textoBorde.setStrokeWidth(1.5f * dp);

        etiquetaFondo.setStyle(Paint.Style.FILL);
        etiquetaTexto.setFakeBoldText(true);
        etiquetaTexto.setTextSize(16 * dp);
        flechaTexto.setFakeBoldText(true);
        flechaTexto.setTextSize(18 * dp);
        flechaForma.setStyle(Paint.Style.FILL);
    }

    /** En el hilo de la pantalla. */
    void mostrar(List<Marca> nuevas, RectF zonaLibre, List<Flecha> nuevasFlechas) {
        marcas = nuevas;
        flechas = nuevasFlechas != null ? nuevasFlechas : Collections.emptyList();
        zona = zonaLibre;
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
                case "hueco":
                    lienzo.drawRoundRect(r, radio, radio, huecoBorde);
                    etiqueta(lienzo, r, m.etiqueta != null ? m.etiqueta : "?", OSCURO, Color.WHITE);
                    break;
                default:
                    lienzo.drawRoundRect(r, radio, radio, textoBorde);
                    break;
            }
        }
        // Las flechas, al final: encima de los recuadros.
        RectF donde = zona != null ? zona : new RectF(0, 0, getWidth(), getHeight());
        for (Flecha f : flechas) flecha(lienzo, donde, f);
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

    /** La pastilla de una flecha, centrada a 8 dp del borde de arriba (▲) o de abajo (▼) de
     *  la zona libre: la punta dibujada y, a su derecha, lo que dice. */
    private void flecha(Canvas lienzo, RectF donde, Flecha f) {
        boolean sube = !"abajo".equals(f.sentido);
        boolean falta = !"hueco".equals(f.tipo);
        int color = falta ? Color.BLACK : Color.WHITE;
        float relleno = 10 * dp;
        float lado = flechaTexto.getTextSize();
        float separacion = 8 * dp;
        float alto = lado + 2 * relleno * 0.7f;
        float ancho = relleno + lado + separacion + flechaTexto.measureText(f.etiqueta) + relleno;
        float izquierda = Math.max(donde.left + 4 * dp, donde.centerX() - ancho / 2);
        float arriba = sube ? donde.top + 8 * dp : donde.bottom - 8 * dp - alto;
        RectF pastilla = new RectF(izquierda, arriba, izquierda + ancho, arriba + alto);
        etiquetaFondo.setColor(falta ? AMBAR : OSCURO);
        lienzo.drawRoundRect(pastilla, alto / 2, alto / 2, etiquetaFondo);
        if (!falta) lienzo.drawRoundRect(pastilla, alto / 2, alto / 2, huecoBorde);
        // La punta: un triángulo que apunta hacia donde hay que mover el celular.
        float cx = pastilla.left + relleno + lado / 2;
        float cy = pastilla.centerY();
        float m = lado / 2;
        punta.reset();
        if (sube) {
            punta.moveTo(cx, cy - m);
            punta.lineTo(cx + m, cy + m * 0.7f);
            punta.lineTo(cx - m, cy + m * 0.7f);
        } else {
            punta.moveTo(cx, cy + m);
            punta.lineTo(cx + m, cy - m * 0.7f);
            punta.lineTo(cx - m, cy - m * 0.7f);
        }
        punta.close();
        flechaForma.setColor(color);
        lienzo.drawPath(punta, flechaForma);
        flechaTexto.setColor(color);
        float base = cy - (flechaTexto.descent() + flechaTexto.ascent()) / 2;
        lienzo.drawText(f.etiqueta, pastilla.left + relleno + lado + separacion, base, flechaTexto);
    }
}
