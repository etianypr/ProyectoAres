import type { CapacitorConfig } from "@capacitor/cli";

// APK del conductor (spec 015). Carga la app publicada en Vercel y le suma los
// plugins nativos (llamar, registro de llamadas, pantalla encendida, escáner).
//
// `server.url` y no los archivos dentro de la APK: la app es Next.js con páginas
// de servidor, Server Actions y rutas /api, que no se pueden empaquetar. A cambio,
// cada cambio publicado llega solo, sin reinstalar (research R1). `webDir` solo
// tiene las dos páginas locales: la de arranque y la de "sin señal" para cuando
// la app se abre en frío sin red (research R2).
//
// Para probar contra el PC sin publicar nada:
//   CAP_SERVER_URL=http://localhost:3000/conductor npx cap sync android
// y en el teléfono conectado por cable, `adb reverse tcp:3000 tcp:3000`.
// localhost cuenta como origen seguro, así que el service worker funciona igual.
const url = process.env.CAP_SERVER_URL ?? "https://proyecto-ares-five.vercel.app/conductor";

const config: CapacitorConfig = {
  appId: "cl.pucarani.ares",
  appName: "ARES",
  webDir: "capacitor/www",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    errorPath: "sin-senal.html",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
