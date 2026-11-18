import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/sesion-proxy";

// En Next.js 16 el "middleware" se llama Proxy y vive en src/proxy.ts.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Coincide con todas las rutas excepto:
     * - _next/static, _next/image (estáticos de Next)
     * - favicon y archivos de imagen
     * - las 4 API del conductor que se verifican solas, con coincidencia exacta (spec 038; la
     *   misma lista que RUTAS_QUE_SE_VERIFICAN_SOLAS en lib/supabase/sesion-proxy.ts)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/(?:geocodificar|direccion-ia|lectura|texto)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
