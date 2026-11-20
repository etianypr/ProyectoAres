package cl.dashund.ares;

import static cl.dashund.ares.BurbujaPiezas.*;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.GradientDrawable;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;

import org.json.JSONObject;

/**
 * El paquete en la tarjeta de la burbuja (spec 046; dueño, 2026-11-20): la foto que se sacó al
 * escanearlo, con «mucha más prioridad que el POR PAGAR», y a su derecha la OF y el pago en fichas
 * iguales. Las mismas medidas que la pestaña de ARES (fichas-parada.tsx).
 */
final class BurbujaPaquete {

    /** Las fichas de la OF y del pago: el ancho de «$100.000», el mayor POR PAGAR. */
    private static final int ANCHO_FICHA = 96;
    private static final int ALTO_FICHA = 36;
    /** La foto del paquete: ocupa lo que queda a la izquierda, con este alto. */
    private static final int ALTO_FOTO = 76;

    private BurbujaPaquete() {}

    /** La foto del paquete a la izquierda y, a la derecha, la OF arriba y el pago abajo: todo
     *  con medida fija, así el monto no mueve nada (dueño, 2026-11-20). */
    static View cuerpo(Context c, JSONObject vista) {
        LinearLayout fila = new LinearLayout(c);
        LinearLayout.LayoutParams lugarFoto = new LinearLayout.LayoutParams(0, dp(c, ALTO_FOTO), 1f);
        lugarFoto.setMarginEnd(dp(c, 10));
        fila.addView(foto(c, cadena(vista, "foto")), lugarFoto);
        LinearLayout lado = new LinearLayout(c);
        lado.setOrientation(LinearLayout.VERTICAL);
        lado.addView(fichaOf(c, cadena(vista, "of")), new LinearLayout.LayoutParams(dp(c, ANCHO_FICHA), dp(c, ALTO_FICHA)));
        View pago = fichaPago(c, vista.optJSONObject("pago"));
        if (pago != null) {
            LinearLayout.LayoutParams lugarPago = new LinearLayout.LayoutParams(dp(c, ANCHO_FICHA), dp(c, ALTO_FICHA));
            lugarPago.topMargin = dp(c, 4);
            lado.addView(pago, lugarPago);
        }
        fila.addView(lado, new LinearLayout.LayoutParams(dp(c, ANCHO_FICHA), LinearLayout.LayoutParams.WRAP_CONTENT));
        return fila;
    }

    /** La foto que se sacó al escanear, recortada al centro; sin foto, su lugar con un ícono. */
    private static View foto(Context c, String base64) {
        Bitmap imagen = null;
        if (base64 != null) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                imagen = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } catch (IllegalArgumentException e) {
                // Una foto que no se pudo leer: queda su lugar, como sin foto.
            }
        }
        ImageView vista = new ImageView(c);
        vista.setBackground(fondo(c, FONDO, BORDE, 12));
        vista.setClipToOutline(true);
        if (imagen != null) {
            vista.setImageBitmap(imagen);
            vista.setScaleType(ImageView.ScaleType.CENTER_CROP);
            vista.setContentDescription("Foto del paquete");
        } else {
            vista.setImageResource(R.drawable.ic_burbuja_paquete);
            vista.setColorFilter(GRIS, android.graphics.PorterDuff.Mode.SRC_IN);
            vista.setScaleType(ImageView.ScaleType.CENTER);
            vista.setContentDescription("Sin foto del paquete");
        }
        return vista;
    }

    /** «OF» y su número en Plex Mono; sin OF, «OF» sola (dueño, 2026-11-16). */
    private static View fichaOf(Context c, String of) {
        LinearLayout ficha = ficha(c, FONDO, BORDE, false);
        ficha.addView(textoCentrado(c, "OF", 12, GRIS, Letra.GRUESA));
        if (of != null) ficha.addView(textoCentrado(c, of, 12, TINTA, Letra.CIFRAS));
        return ficha;
    }

    /** POR PAGAR en amarillo (con el monto o «Por revisar»), «✓ PAGADO» en verde, o «PAGO · Sin
     *  leer» punteado: nunca se supone pagado (spec 005). Siempre en palabras, no solo en color. */
    private static View fichaPago(Context c, JSONObject pago) {
        if (pago == null) return null;
        String monto = cadena(pago, "monto");
        switch (pago.optString("tipo")) {
            case "cobro": {
                LinearLayout ficha = ficha(c, COBRO_SUAVE, COBRO_BORDE, false);
                ficha.addView(textoCentrado(c, "POR PAGAR", 12, COBRO, Letra.GRUESA));
                ficha.addView(monto != null
                    ? textoCentrado(c, monto, 14, COBRO, Letra.GRUESA)
                    : textoCentrado(c, "Por revisar", 12, COBRO, Letra.NEGRITA));
                return ficha;
            }
            case "pagado": {
                LinearLayout ficha = ficha(c, OK_SUAVE, OK_BORDE, false);
                ficha.setOrientation(LinearLayout.HORIZONTAL);
                LinearLayout.LayoutParams lugarCheck = new LinearLayout.LayoutParams(dp(c, 16), dp(c, 16));
                lugarCheck.setMarginEnd(dp(c, 4));
                ficha.addView(imagen(c, R.drawable.ic_burbuja_check, OK), lugarCheck);
                ficha.addView(textoCentrado(c, "PAGADO", 14, OK, Letra.GRUESA));
                return ficha;
            }
            case "sin_leer": {
                LinearLayout ficha = ficha(c, PAPEL, BORDE_FUERTE, true);
                ficha.addView(textoCentrado(c, "PAGO", 12, GRIS, Letra.GRUESA));
                ficha.addView(textoCentrado(c, "Sin leer", 12, GRIS, Letra.NEGRITA));
                return ficha;
            }
            default:
                return null;
        }
    }

    private static LinearLayout ficha(Context c, int color, int borde, boolean punteado) {
        LinearLayout ficha = new LinearLayout(c);
        ficha.setOrientation(LinearLayout.VERTICAL);
        ficha.setGravity(Gravity.CENTER);
        GradientDrawable fondo = fondo(c, color, 0, 8);
        if (punteado) fondo.setStroke(dp(c, 1), borde, dp(c, 3), dp(c, 2));
        else fondo.setStroke(dp(c, 1), borde);
        ficha.setBackground(fondo);
        return ficha;
    }
}
