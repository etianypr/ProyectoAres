import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./tema-dashund.css";

// Las letras del tema Dashund (ver tema-dashund.css). globals.css ya reparte
// tres papeles —título, texto y cifras— pero nunca se cargaban, así que todo
// salía en la letra del sistema. Manrope para leer; IBM Plex Mono para lo que
// se compara de un vistazo: OF, km, horas.
const texto = Manrope({ subsets: ["latin"], display: "swap" });
const cifras = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], display: "swap" });

/** Se declaran en :root (y no en un contenedor) porque las ventanas de la app
 *  se abren con portales, fuera del árbol del layout. */
export function TemaDashund() {
  return (
    <style>{`:root{--font-texto:${texto.style.fontFamily};--font-titulo:${texto.style.fontFamily};--font-cifras:${cifras.style.fontFamily}}`}</style>
  );
}
