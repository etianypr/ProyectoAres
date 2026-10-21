import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
