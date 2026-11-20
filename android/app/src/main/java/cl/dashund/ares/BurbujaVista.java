package cl.dashund.ares;

import static cl.dashund.ares.BurbujaPiezas.*;

import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Lo que se ve de la burbuja (spec 020): la tarjeta abierta y el círculo achicado.
 * Dibuja la vista que manda la web (data-model, `VistaBurbuja`) sin decidir nada:
 * los botones y sus textos vienen de botones-parada.ts, los mismos de la tarjeta de
 * ARES. Vistas armadas en código con «Plano» (BurbujaPiezas).
 *
 * Desde la spec 046 (APK 1.11.0; dueño, 2026-11-20, `specs/046-burbuja-siguientes/maqueta.html`):
 * arriba la dirección y el nombre, sin «Navegar»; la foto del paquete con la OF y el pago en
 * fichas; y «Siguientes paradas» para llamar a las que vienen (BurbujaSiguientes).
 */
final class BurbujaVista {

    /** Lo que pasa al tocar: el servicio lo resuelve (abrir ARES, Google Maps, avisar). */
    interface Toques {
        void tocar(String id, boolean abreAres);

        void achicar();

        /** «Siguientes paradas»: la lista toma el lugar de la parada (true), y vuelve. */
        void lista(boolean abierta);
    }

    private BurbujaVista() {}

    /** La tarjeta a lo ancho, pegada abajo. Si los botones no caben en `maxAlto`
     *  (las salidas, con su detalle), solo ellos se desplazan: lo fijo se ve siempre. */
    static View tarjeta(Context c, JSONObject vista, Toques t, int maxAlto) {
        Columna caja = new Columna(c, maxAlto);
        caja.setPadding(dp(c, 14), dp(c, 8), dp(c, 10), dp(c, 12));
        caja.setBackground(fondo(c, PAPEL, BORDE, 20));
        boolean nueva = vista.has("calle");

        // Cabecera: el número de parada, la dirección con el nombre debajo, y Volver a ARES y
        // Achicar. Sin «Navegar»: ARES manda Google Maps a la siguiente al cerrar cada parada.
        LinearLayout cabeza = new LinearLayout(c);
        cabeza.setGravity(Gravity.CENTER_VERTICAL);
        int secuencia = vista.optInt("secuencia", 0);
        if (secuencia > 0) {
            LinearLayout.LayoutParams lugarNumero = new LinearLayout.LayoutParams(dp(c, 32), dp(c, 32));
            lugarNumero.setMarginEnd(dp(c, 10));
            cabeza.addView(numeroDeParada(c, secuencia, 13), lugarNumero);
        }
        LinearLayout titulos = new LinearLayout(c);
        titulos.setOrientation(LinearLayout.VERTICAL);
        if (nueva) {
            titulos.addView(direccion(c, vista.optString("calle"), cadena(vista, "numero"), 18, 14, TINTA), ancho());
            String nombre = cadena(vista, "nombre");
            if (nombre != null) titulos.addView(texto(c, nombre, 13, GRIS, Letra.NORMAL, 1), ancho());
        } else {
            titulos.addView(texto(c, vista.optString("titulo"), 18, TINTA, Letra.CIFRAS, 1), ancho());
        }
        cabeza.addView(titulos, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        View ares = icono(c, R.drawable.ic_burbuja_ares, "Volver a ARES", TINTA, ovalo(c, PAPEL, BORDE), LADO_ICONO, 18);
        ares.setOnClickListener(v -> t.tocar("ares", true));
        cabeza.addView(ares, lugarIcono(c));
        View achicar = icono(c, R.drawable.ic_burbuja_achicar, "Achicar", GRIS, null, LADO_ICONO, 24);
        achicar.setOnClickListener(v -> t.achicar());
        cabeza.addView(achicar, lugarIcono(c));
        caja.addView(cabeza, ancho());

        if (nueva) {
            caja.addView(BurbujaPaquete.cuerpo(c, vista), conMargen(c, 4));
        } else {
            String detalle = cadena(vista, "detalle");
            if (detalle != null) caja.addView(texto(c, detalle, 13, GRIS, Letra.NORMAL, 1), ancho());
        }

        // El horario que pidió el receptor o el ⚠ de una parada que viene: texto y color.
        JSONObject estado = vista.optJSONObject("estado");
        if (estado != null) {
            TextView linea = texto(c, estado.optString("texto"), 12, colorDeEstado(estado.optString("tono")), Letra.NEGRITA, 1);
            linea.setPadding(0, dp(c, 4), 0, 0);
            caja.addView(linea, ancho());
        }

        // Los botones del paso, en filas que se reparten el ancho, y la barra de las siguientes.
        LinearLayout botones = new LinearLayout(c);
        botones.setOrientation(LinearLayout.VERTICAL);
        JSONArray filas = vista.optJSONArray("filas");
        for (int i = 0; filas != null && i < filas.length(); i++) {
            JSONArray fila = filas.optJSONArray(i);
            if (fila == null || fila.length() == 0) continue;
            LinearLayout renglon = new LinearLayout(c);
            renglon.setGravity(Gravity.CENTER_VERTICAL);
            for (int j = 0; j < fila.length(); j++) {
                JSONObject b = fila.optJSONObject(j);
                if (b != null) agregarBoton(c, renglon, b, t, j > 0);
            }
            botones.addView(renglon, conMargen(c, 8));
        }
        JSONArray siguientes = vista.optJSONArray("siguientes");
        if (siguientes != null && siguientes.length() > 0) {
            botones.addView(BurbujaSiguientes.barra(c, siguientes, t), conMargen(c, 8));
        }
        if (botones.getChildCount() > 0) {
            ScrollView desplazable = new ScrollView(c);
            desplazable.addView(botones);
            caja.addView(desplazable, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        }

        // Lo último que se cerró, con "Deshacer" mientras se pueda, o el ⚠ de una
        // parada que viene (spec 022: ya trae el ⚠ escrito, el color lo acompaña).
        JSONObject aviso = vista.optJSONObject("aviso");
        if (aviso != null) caja.addView(aviso(c, aviso, t), conMargen(c, 8));
        return caja;
    }

    /** Lo último que se cerró, con «Deshacer», o el ⚠ de una parada que viene. */
    private static View aviso(Context c, JSONObject aviso, Toques t) {
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
            renglon.addView(deshacer, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(c, 36)));
        }
        return renglon;
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
            caja.addView(textoCentrado(c, "Parada", 10, Color.WHITE, Letra.GRUESA));
            caja.addView(textoCentrado(c, String.valueOf(secuencia), 18, Color.WHITE, Letra.GRUESA));
            caja.setContentDescription("Parada " + secuencia + " de ARES. Toca para abrir");
        } else {
            caja.addView(textoCentrado(c, "ARES", 12, Color.WHITE, Letra.GRUESA));
            caja.setContentDescription("ARES. Toca para abrir");
        }
        caja.setLayoutParams(new LinearLayout.LayoutParams(dp(c, 56), dp(c, 56)));
        return caja;
    }

    private static void agregarBoton(Context c, LinearLayout renglon, JSONObject b, Toques t, boolean conMargen) {
        String id = b.optString("id");
        String texto = b.optString("texto");
        String tono = b.optString("tono", "neutro");
        boolean soloIcono = b.optBoolean("soloIcono");
        boolean llamar = id.equals("llamar");
        View boton = soloIcono
            ? icono(c, iconoDe(id), texto, llamar ? MARCA : colorDeTexto(tono),
                llamar ? fondoLlamar(c) : fondoDeTono(c, tono, true), ALTO_BOTON, 20)
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
    static View pildora(Context c, int icono, String texto, String detalle, String tono, int altoMinimo, float sp) {
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

    private static LinearLayout.LayoutParams conMargen(Context c, int arribaDp) {
        LinearLayout.LayoutParams lugar = ancho();
        lugar.topMargin = dp(c, arribaDp);
        return lugar;
    }

    /** Los tonos de botones-parada.ts: relleno con texto blanco, o borde con texto de color. */
    static GradientDrawable fondoDeTono(Context c, String tono, boolean redondo) {
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
}
