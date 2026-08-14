import type { Metadata, Viewport } from "next";
import { DebugErrores } from "@/components/encomiendas/debug-errores";
import { exigirConductor } from "@/lib/auth";

// Grupo de rutas aparte (ver docs de route groups): así todo lo que vive
// bajo /conductor NO hereda el AppShell/sidebar del panel admin — es la
// vista mobile-first del conductor, pensada para instalarse desde Safari en
// iOS ("Agregar a inicio"). El manifest (src/app/manifest.ts) tiene
// scope="/conductor", así que cualquier herramienta nueva del conductor debe
// vivir bajo este mismo prefijo para quedar dentro de la PWA instalada.
export const metadata: Metadata = {
  title: "Encomiendas — Conductor",
  appleWebApp: {
    capable: true,
    title: "Conductor",
    statusBarStyle: "black-translucent",
  },
  icons: {
    // Cuadrado de 180×180 con el isotipo sobre azul de marca (iOS le pone las
    // esquinas redondeadas solo). Se genera con scripts/generar-iconos.mjs.
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0c3f9b",
};

export default async function ConductorLayout({ children }: { children: React.ReactNode }) {
  // Puerta del grupo: acá solo entra el rol chofer. Cualquier otro rol vuelve
  // al panel — antes quedaba encerrado en "Cuenta sin vincular", sin salida.
  await exigirConductor();

  return (
    <div className="min-h-screen bg-background">
      <DebugErrores />
      {children}
    </div>
  );
}
