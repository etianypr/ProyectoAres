package cl.dashund.ares;

import android.content.Context;
import android.util.AttributeSet;

import com.getcapacitor.CapacitorWebView;

/**
 * La WebView de ARES (la usa res/layout/capacitor_bridge_layout_main.xml en vez de la de
 * Capacitor).
 *
 * La WebView 156 congela una página oculta un minuto después de quedar atrás: temporizadores
 * e IndexedDB detenidos. Con ARES atrás de Google Maps, un toque de la burbuja no se guardaba
 * hasta volver a ARES (medido en el vivo, 2026-11-06; spec 020). Mientras la burbuja está en
 * curso, esta WebView le dice a Chromium que su ventana sigue visible y la página no se
 * congela. Sin burbuja, se oculta como siempre: atrás se congela y no gasta batería.
 */
public class WebViewAres extends CapacitorWebView {

    /** Lo que Android dice de verdad, para devolverlo cuando la burbuja termina. */
    private int visibilidadReal = VISIBLE;

    public WebViewAres(Context contexto, AttributeSet atributos) {
        super(contexto, atributos);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibilidad) {
        visibilidadReal = visibilidad;
        super.onWindowVisibilityChanged(BurbujaServicio.mantenerVisible() ? VISIBLE : visibilidad);
    }

    /** La burbuja empezó o terminó: se le vuelve a decir a Chromium si la ventana se ve. */
    void actualizarVisibilidad() {
        super.onWindowVisibilityChanged(BurbujaServicio.mantenerVisible() ? VISIBLE : visibilidadReal);
    }
}
