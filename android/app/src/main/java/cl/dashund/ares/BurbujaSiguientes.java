package cl.dashund.ares;

import static cl.dashund.ares.BurbujaPiezas.*;

import android.content.Context;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * «Siguientes paradas» (spec 046; dueño, 2026-11-20: «la burbuja no te deja llamar a los
 * siguientes pedidos»). Solo existe en la burbuja: en ARES no va. Cerrada es una barra del alto
 * de un botón con los números de las que siguen; abierta, la lista toma el lugar de la parada,
 * con la dirección y el nombre de cada una («para saber a quién estoy llamando») y un toque
 * para llamar. Sin teléfono, «Escanear» abre ARES en el escáner de esa parada. La flecha atrás
 * vuelve a la parada.
 */
final class BurbujaSiguientes {

    private BurbujaSiguientes() {}

    /** La barra cerrada: el teléfono, «Siguientes paradas», los números y la flecha. */
    static View barra(Context c, JSONArray siguientes, BurbujaVista.Toques t) {
        LinearLayout barra = new LinearLayout(c);
        barra.setGravity(Gravity.CENTER_VERTICAL);
        barra.setMinimumHeight(dp(c, ALTO_BOTON));
        barra.setPadding(dp(c, 14), 0, dp(c, 8), 0);
        barra.setBackground(fondo(c, PAPEL, BORDE, ALTO_BOTON / 2));
        barra.setClickable(true);
        barra.setContentDescription("Siguientes paradas");
        barra.setOnClickListener(v -> t.lista(true));

        barra.addView(imagen(c, R.drawable.ic_burbuja_telefono, MARCA), new LinearLayout.LayoutParams(dp(c, 18), dp(c, 18)));
        TextView texto = texto(c, "Siguientes paradas", 14, TINTA, Letra.NEGRITA, 1);
        LinearLayout.LayoutParams lugarTexto = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lugarTexto.setMarginStart(dp(c, 8));
        barra.addView(texto, lugarTexto);
        for (int i = 0; i < siguientes.length(); i++) {
            JSONObject s = siguientes.optJSONObject(i);
            if (s == null) continue;
            LinearLayout.LayoutParams lugar = new LinearLayout.LayoutParams(dp(c, 26), dp(c, 26));
            lugar.setMarginStart(dp(c, i == 0 ? 8 : 3));
            barra.addView(numeroDeParada(c, s.optInt("secuencia"), 12), lugar);
        }
        // La flecha hacia arriba: la lista se abre encima (la de abajo es «Achicar»).
        ImageView flecha = imagen(c, R.drawable.ic_burbuja_arriba, TINTA);
        LinearLayout.LayoutParams lugarFlecha = new LinearLayout.LayoutParams(dp(c, 22), dp(c, 22));
        lugarFlecha.setMarginStart(dp(c, 8));
        barra.addView(flecha, lugarFlecha);
        return barra;
    }

    /** Abierta: la flecha atrás, el título y Volver a ARES; debajo, una fila por parada. */
    static View lista(Context c, JSONArray siguientes, BurbujaVista.Toques t, int maxAlto) {
        Columna caja = new Columna(c, maxAlto);
        caja.setPadding(dp(c, 14), dp(c, 8), dp(c, 10), dp(c, 12));
        caja.setBackground(fondo(c, PAPEL, BORDE, 20));

        LinearLayout cabeza = new LinearLayout(c);
        cabeza.setGravity(Gravity.CENTER_VERTICAL);
        View atras = icono(c, R.drawable.ic_burbuja_atras, "Volver a la parada", TINTA, null, LADO_ICONO, 24);
        atras.setOnClickListener(v -> t.lista(false));
        LinearLayout.LayoutParams lugarAtras = new LinearLayout.LayoutParams(dp(c, LADO_ICONO), dp(c, LADO_ICONO));
        lugarAtras.setMarginStart(-dp(c, 6));
        lugarAtras.setMarginEnd(dp(c, 6));
        cabeza.addView(atras, lugarAtras);
        cabeza.addView(texto(c, "Siguientes paradas", 18, TINTA, Letra.GRUESA, 1),
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        View ares = icono(c, R.drawable.ic_burbuja_ares, "Volver a ARES", TINTA, ovalo(c, PAPEL, BORDE), LADO_ICONO, 18);
        ares.setOnClickListener(v -> t.tocar("ares", true));
        cabeza.addView(ares, lugarIcono(c));
        caja.addView(cabeza, ancho());

        for (int i = 0; i < siguientes.length(); i++) {
            JSONObject s = siguientes.optJSONObject(i);
            if (s == null) continue;
            if (i > 0) {
                View linea = new View(c);
                linea.setBackgroundColor(BORDE);
                caja.addView(linea, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(c, 1)));
            }
            caja.addView(fila(c, s, t), ancho());
        }
        return caja;
    }

    /** Una parada que sigue: su número, la dirección y el nombre, y llamar (o escanear). */
    private static View fila(Context c, JSONObject s, BurbujaVista.Toques t) {
        String id = s.optString("id");
        boolean conTelefono = s.optBoolean("conTelefono");
        LinearLayout fila = new LinearLayout(c);
        fila.setGravity(Gravity.CENTER_VERTICAL);
        fila.setMinimumHeight(dp(c, 52));

        LinearLayout.LayoutParams lugarNumero = new LinearLayout.LayoutParams(dp(c, 28), dp(c, 28));
        lugarNumero.setMarginEnd(dp(c, 10));
        fila.addView(numeroDeParada(c, s.optInt("secuencia"), 12), lugarNumero);

        LinearLayout textos = new LinearLayout(c);
        textos.setOrientation(LinearLayout.VERTICAL);
        textos.addView(direccion(c, s.optString("calle"), cadena(s, "numero"), 15, 15, TINTA), ancho());
        String nombre = cadena(s, "nombre");
        // Sin teléfono, el aviso va primero: si no cabe, se corta el nombre y nunca el aviso.
        if (!conTelefono) {
            String aviso = "⚠ Sin teléfono";
            SpannableString linea = new SpannableString(nombre != null ? aviso + " · " + nombre : aviso);
            linea.setSpan(new ForegroundColorSpan(AVISO), 0, aviso.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            TextView abajo = texto(c, "", 13, GRIS, Letra.NEGRITA, 1);
            abajo.setText(linea);
            textos.addView(abajo, ancho());
        } else if (nombre != null) {
            textos.addView(texto(c, nombre, 13, GRIS, Letra.NORMAL, 1), ancho());
        }
        LinearLayout.LayoutParams lugarTextos = new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lugarTextos.setMarginEnd(dp(c, 10));
        fila.addView(textos, lugarTextos);

        if (conTelefono) {
            View llamar = icono(c, R.drawable.ic_burbuja_telefono, "Llamar a la parada " + s.optInt("secuencia"), MARCA,
                fondoLlamar(c), LADO_ICONO, 20);
            llamar.setOnClickListener(v -> t.tocar("llamar:" + id, false));
            fila.addView(llamar, new LinearLayout.LayoutParams(dp(c, LADO_ICONO), dp(c, LADO_ICONO)));
        } else {
            View escanear = BurbujaVista.pildora(c, 0, "Escanear", null, "neutro", dp(c, LADO_ICONO), 14);
            escanear.setOnClickListener(v -> t.tocar("escanear:" + id, true));
            fila.addView(escanear, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(c, LADO_ICONO)));
        }
        return fila;
    }
}
