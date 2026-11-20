package cl.dashund.ares;

import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.RectF;
import android.media.Image;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.google.mlkit.vision.text.Text;

import java.nio.ByteBuffer;
import java.util.regex.Pattern;

/**
 * El color de los íconos «PxP» y «COD» de la lista de la app de Starken (spec 045; dueño,
 * 2026-11-20: en verde, el encargo es por pagar). ML Kit da el texto y su caja, no el color:
 * aquí se promedia el color (U y V del cuadro YUV, sin el brillo) dentro de la caja de esa
 * palabra y se manda tal cual, como desvío del gris (du, dv). Qué es verde lo decide la web,
 * para ajustar el umbral sin recompilar la APK. Solo cifras: ni el texto del cuadro ni su
 * imagen salen de aquí.
 */
final class ColorIconos {

    /** «PxP», «PXP», «P x P», «COD», «C0D», con un signo pegado («COD)»). */
    private static final Pattern ICONO = Pattern.compile("^\\W*(P\\s*[xX×]\\s*P|C[O0]D)\\W*$", Pattern.CASE_INSENSITIVE);
    /** Cada cuántos píxeles de color se toma uno: la caja es chica y basta una muestra. */
    private static final int PASO = 2;

    private ColorIconos() {}

    /** Los íconos del renglón con su color, o null si no tiene ninguno (o no hay imagen). */
    static JSArray delRenglon(Text.Line linea, Image imagen, int giro) {
        if (imagen == null || imagen.getPlanes().length < 3) return null;
        JSArray iconos = null;
        for (Text.Element palabra : linea.getElements()) {
            if (!ICONO.matcher(palabra.getText()).matches() || palabra.getBoundingBox() == null) continue;
            int[] croma = croma(imagen, giro, palabra.getBoundingBox());
            if (croma == null) continue;
            JSObject icono = new JSObject();
            icono.put("texto", palabra.getText());
            icono.put("du", croma[0]);
            icono.put("dv", croma[1]);
            if (iconos == null) iconos = new JSArray();
            iconos.put(icono);
        }
        return iconos;
    }

    /** El color promedio de la caja (ya derecha, como la da ML Kit) como desvío del gris:
     *  du = U − 128 y dv = V − 128. El verde tiene los dos negativos; el gris, cerca de 0. */
    private static int[] croma(Image imagen, int giro, Rect cajaDerecha) {
        int w = imagen.getWidth();
        int h = imagen.getHeight();
        Matrix bufferADerecho = new Matrix();
        bufferADerecho.setRotate(giro);
        RectF limites = new RectF(0, 0, w, h);
        bufferADerecho.mapRect(limites);
        bufferADerecho.postTranslate(-limites.left, -limites.top);
        Matrix derechoABufer = new Matrix();
        if (!bufferADerecho.invert(derechoABufer)) return null;
        RectF caja = new RectF(cajaDerecha);
        derechoABufer.mapRect(caja);
        // El píxel de color cubre 2 × 2 del brillo (YUV 4:2:0).
        int x0 = Math.max(0, (int) caja.left / 2);
        int y0 = Math.max(0, (int) caja.top / 2);
        int x1 = Math.min(w / 2 - 1, (int) caja.right / 2);
        int y1 = Math.min(h / 2 - 1, (int) caja.bottom / 2);
        if (x1 <= x0 || y1 <= y0) return null;
        Image.Plane planoU = imagen.getPlanes()[1];
        Image.Plane planoV = imagen.getPlanes()[2];
        ByteBuffer u = planoU.getBuffer();
        ByteBuffer v = planoV.getBuffer();
        long sumaU = 0;
        long sumaV = 0;
        int cuantos = 0;
        try {
            for (int y = y0; y <= y1; y += PASO) {
                for (int x = x0; x <= x1; x += PASO) {
                    sumaU += u.get(y * planoU.getRowStride() + x * planoU.getPixelStride()) & 0xFF;
                    sumaV += v.get(y * planoV.getRowStride() + x * planoV.getPixelStride()) & 0xFF;
                    cuantos++;
                }
            }
        } catch (IndexOutOfBoundsException | IllegalStateException fueraDelCuadro) {
            return null;
        }
        if (cuantos == 0) return null;
        return new int[] { (int) (sumaU / cuantos) - 128, (int) (sumaV / cuantos) - 128 };
    }
}
