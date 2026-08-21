import type { MetadataRoute } from "next";

// Next.js solo permite un manifest por app (debe vivir en la raíz de app/), pero
// el Web App Manifest soporta "scope"/"start_url" para restringir dónde aplica:
// acá se limita a /conductor, la app del repartidor — la única parte de este
// sistema pensada para "agregar a inicio" desde el teléfono. Cualquier
// herramienta nueva del conductor debe vivir bajo /conductor/* para quedar
// dentro de este scope.
//
// Los íconos son cuadrados con solo el isotipo sobre azul de marca; se generan
// desde public/logo.png con `node scripts/generar-iconos.mjs` (correrlo de nuevo
// si cambia el logo). El "maskable" trae la marca más chica porque Android
// recorta el ícono a un círculo del 80% del lado.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Conductor — Encomiendas",
    short_name: "Conductor",
    description: "Herramientas de trabajo del conductor",
    start_url: "/conductor",
    scope: "/conductor",
    display: "standalone",
    // El naranja de --brand. background_color es lo que el sistema pinta
    // mientras la app arranca, antes de que cargue nada: con otro color, abrir
    // la app empieza con un destello azul.
    background_color: "#c2410c",
    theme_color: "#c2410c",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
