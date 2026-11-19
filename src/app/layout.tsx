import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

// Las letras de ARES, para el panel y la app del conductor (spec 042): Manrope para
// leer; IBM Plex Mono para lo que se compara de un vistazo (OF, km, horas, montos en
// tabla). Antes se cargaba Geist y nadie la usaba: el panel salía en la letra del
// sistema y `font-mono` no se veía. Las variables quedan en <html>, así que también
// las heredan las ventanas que se abren con portales.
const texto = Manrope({ subsets: ["latin"], display: "swap", variable: "--font-texto" });
const cifras = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-cifras" });

// "Ares" es el nombre de trabajo del proyecto. El nombre de la empresa que se ve
// en el panel NO se escribe acá: sale de la tabla empresa (Configuración), así
// que cambiarlo no exige tocar código. Este título es lo único fijo.
export const metadata: Metadata = {
  title: "Gestión de encomiendas",
  description: "Reparto de encomiendas: rutas, días de trabajo y liquidación de conductores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${texto.variable} ${cifras.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
