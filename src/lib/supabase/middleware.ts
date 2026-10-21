import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/db";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión de Supabase en cada request y protege las rutas privadas.
// Se invoca desde proxy.ts (el "middleware" de Next.js 16).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Sin URL ni llave no hay nada que consultar: createServerClient tira una
  // excepción y, como esto corre en el proxy, Next contesta 404 en TODAS las
  // rutas. El error de verdad (falta .env.local) queda enterrado en la consola.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const faltan = [
      !url && "NEXT_PUBLIC_SUPABASE_URL",
      !anonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(" y ");
    const aviso =
      `Falta ${faltan} en el entorno. Copiá .env.example como .env.local y ` +
      "completá los datos del proyecto Supabase de ares (Project Settings > API).";

    // En producción NO se deja pasar: sin sesión que verificar, seguir sería
    // abrir el panel de la oficina entero sin login.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(aviso, { status: 500 });
    }

    // En desarrollo la app arranca y cada pantalla muestra su propio error de
    // datos, que es lo que documenta el README.
    console.error(`[ares] ${aviso}`);
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    url,
    anonKey,
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
    // Una ruta de API no se redirige al login: se le contesta 401.
    //
    // El teléfono del conductor consulta /api/whatsapp/* con fetch. Un 307 hacia
    // /login lo sigue solo, recibe el HTML de la pantalla de login y trata de
    // parsearlo como JSON: el error que ve el chofer es "Unexpected token <",
    // que no le dice que se le venció la sesión. Con un 401 y un cuerpo JSON, la
    // app puede decir "volvé a entrar" y no perder lo que tenía guardado.
    if (path.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Sesión vencida. Volvé a entrar a la app." },
        { status: 401 },
      );
    }

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
