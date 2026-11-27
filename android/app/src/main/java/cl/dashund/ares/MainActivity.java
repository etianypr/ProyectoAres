package cl.dashund.ares;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** ARES se ve (aunque algo lo tape a medias, como el diálogo de un permiso). */
    static volatile boolean visible = false;
    /** ARES está adelante, recibiendo toques. */
    static volatile boolean adelante = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios se registran antes de crear el puente (spec 015).
        registerPlugin(TelefonoPlugin.class);
        registerPlugin(BurbujaPlugin.class);
        registerPlugin(EscanerVivoPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        visible = true;
    }

    @Override
    public void onResume() {
        super.onResume();
        adelante = true;
    }

    @Override
    public void onPause() {
        adelante = false;
        super.onPause();
    }

    @Override
    public void onStop() {
        visible = false;
        super.onStop();
    }
}
