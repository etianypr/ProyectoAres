import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión de Supabase en cada request y protege las rutas privadas.
// Se invoca desde proxy.ts (el "middleware" de Next.js 16).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: no ejecutar código entre createServerClient y getUser().
  // Si Supabase no responde (mala config o red), tratamos como "sin sesión"
  // en lugar de romper toda la app con un error 500.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch {
    user = null;
  }

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    // La sesión del link de invitación llega en el fragmento de la URL
    // (#access_token=...), que el servidor nunca ve — así que esta ruta
    // debe ser pública para que el cliente alcance a procesarla.
    path.startsWith("/set-password") ||
    path === "/favicon.ico" ||
    // El navegador pide el manifest SIN cookies (el <link rel="manifest"> que
    // emite Next no lleva crossorigin="use-credentials"), así que si no es
    // pública recibe el HTML del login en vez del JSON y la PWA del conductor
    // deja de ser instalable.
    path === "/manifest.webmanifest" ||
    // Meta llama a este endpoint sin cookies de sesión (verificación del
    // webhook y eventos de WhatsApp); la propia ruta valida el token/origen.
    // Coincidencia EXACTA a propósito: futuras rutas /api/whatsapp/* (ej. un
    // endpoint de envío) deben seguir exigiendo sesión.
    path === "/api/whatsapp/webhook";

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  // Si ya inició sesión y va a /login, lo mandamos al inicio.
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
