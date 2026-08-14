import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Por defecto el servidor de desarrollo bloquea peticiones a sus recursos
  // (chunks JS, HMR) que no vengan del origen "localhost" — necesario para
  // probar la app del conductor desde el teléfono vía túnel ngrok, cuyo dominio
  // cambia en cada reinicio del túnel (por eso el patrón comodín, no la URL
  // exacta). Sin esto no se puede probar la ruta en terreno.
  allowedDevOrigins: ["*.ngrok-free.app"],
};

export default nextConfig;
