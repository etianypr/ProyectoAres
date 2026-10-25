import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Por defecto el servidor de desarrollo bloquea peticiones a sus recursos
  // (chunks JS, HMR) que no vengan del origen "localhost" — necesario para
  // probar la app del conductor desde el teléfono vía túnel ngrok, cuyo dominio
  // cambia en cada reinicio del túnel (por eso el patrón comodín, no la URL
  // exacta). Sin esto no se puede probar la ruta en terreno.
  allowedDevOrigins: ["*.ngrok-free.app"],
  // La sección del panel se llamaba /choferes hasta la spec 002 (US2): los
  // enlaces guardados siguen llegando.
  async redirects() {
    return [
      { source: "/choferes", destination: "/conductores", permanent: true },
      { source: "/choferes/:resto*", destination: "/conductores/:resto*", permanent: true },
    ];
  },
};

export default nextConfig;
