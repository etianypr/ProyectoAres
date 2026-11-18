// Spec 038 (tiempos): las API del conductor se verifican solas y dicen cuánto tardan.
//
//   · conductorDeLaApi pregunta el rol y la ficha a la vez, y decide en el orden de antes;
//   · el proxy no repite getUser en /api/geocodificar, /api/direccion-ia, /api/lectura y
//     /api/texto (lista exacta, como el webhook): cada una llama a conductorDeLaApi;
//   · Server-Timing con solo cifras (auth, proveedor);
//   · /api/direccion-ia contesta 429 cuando Anthropic limita la tasa, y manda el prompt con
//     caché (cache_control) y las cifras de la caché.
//
// Las pruebas «dorada:» corren igual sobre el código de antes de la 038. Supabase va en un doble
// (el cliente del servidor) o con el `fetch` global reemplazado; Anthropic y Google, con el
// `fetch` global: nada sale a la red. Direcciones inventadas.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";

// --- El cliente de Supabase del servidor, en un doble que se arma en cada prueba, y next/server
// (CommonJS sin "exports": Node lo pide con la extensión).
registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador === "@/lib/supabase/server") return { url: "ares-038:supabase-servidor", shortCircuit: true };
    if (especificador === "next/server") return siguiente("next/server.js", contexto);
    return siguiente(especificador, contexto);
  },
  load(url, contexto, siguiente) {
    if (url === "ares-038:supabase-servidor") {
      return {
        format: "module",
        source: "export async function createClient() { return globalThis.__supabase038.cliente(); }",
        shortCircuit: true,
      };
    }
    return siguiente(url, contexto);
  },
});

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/** Supabase de mentira: quién está en la sesión, su rol y su ficha; cada consulta con su demora,
 *  y lo que se consultó en orden (para ver qué va a la vez). */
function supabase({ usuario = { id: "u-1" }, rol = "conductor", ficha = { id: "c-1", nombre: "Conductor Prueba", activo: true }, ms = 0 } = {}) {
  const sb = { eventos: [] };
  const consulta = (tabla, valor) => async () => {
    sb.eventos.push(`empieza ${tabla}`);
    await esperar(ms);
    sb.eventos.push(`termina ${tabla}`);
    const v = typeof valor === "function" ? valor() : valor;
    return v;
  };
  sb.cliente = () => ({
    auth: {
      getUser: async () => (sb.eventos.push("getUser"), { data: { user: usuario }, error: null }),
    },
    from(tabla) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle:
                  tabla === "perfiles"
                    ? consulta(tabla, () => {
                        if (rol instanceof Error) throw rol;
                        return { data: rol ? { rol } : null, error: null };
                      })
                    : consulta(tabla, () => {
                        if (ficha instanceof Error) return { data: null, error: { message: ficha.message } };
                        return { data: ficha, error: null };
                      }),
              };
            },
          };
        },
      };
    },
  });
  globalThis.__supabase038 = sb;
  return sb;
}

const { conductorDeLaApi } = await import("@/lib/auth/api-conductor");

async function decision() {
  try {
    const r = await conductorDeLaApi();
    if (r.ok) return { ok: true, conductorId: r.conductorId, nombre: r.nombre };
    return { estado: r.respuesta.status, cuerpo: await r.respuesta.json() };
  } catch (e) {
    return { lanza: e.message };
  }
}

const SESION_VENCIDA = { estado: 401, cuerpo: { error: "Sesión vencida. Vuelve a iniciar sesión." } };
const SOLO_CONDUCTOR = { estado: 403, cuerpo: { error: "Esta operación es solo de la app del conductor." } };
const SIN_FICHA = {
  estado: 403,
  cuerpo: { error: "Tu usuario no está vinculado a ningún conductor. Pide a un administrador que lo configure." },
};
const DESACTIVADO = { estado: 403, cuerpo: { error: "Tu cuenta de conductor está desactivada." } };

// ------------------------------------------------------------ conductorDeLaApi
test("dorada: conductorDeLaApi decide igual que antes (401, 403 por rol, ficha)", async () => {
  supabase({ usuario: null });
  assert.deepEqual(await decision(), SESION_VENCIDA);
  supabase({ rol: "admin" });
  assert.deepEqual(await decision(), SOLO_CONDUCTOR);
  supabase({ rol: null });
  assert.deepEqual(await decision(), SOLO_CONDUCTOR, "sin perfil tampoco pasa");
  supabase({ ficha: null });
  assert.deepEqual(await decision(), SIN_FICHA);
  supabase({ ficha: { id: "c-1", nombre: "Conductor Prueba", activo: false } });
  assert.deepEqual(await decision(), DESACTIVADO);
  supabase();
  assert.deepEqual(await decision(), { ok: true, conductorId: "c-1", nombre: "Conductor Prueba" });
});

test("dorada: el error de la ficha no tapa el 403 del rol, y con rol de conductor sí se lanza", async () => {
  // Un admin con la consulta de la ficha caída sigue siendo «solo del conductor».
  supabase({ rol: "admin", ficha: new Error("sin red") });
  assert.deepEqual(await decision(), SOLO_CONDUCTOR);
  // Un conductor con la ficha caída: se lanza (un error de red no es «sin ficha», spec 007).
  supabase({ ficha: new Error("sin red") });
  assert.deepEqual(await decision(), { lanza: "sin red" });
  // El rol caído también se lanza.
  supabase({ rol: new Error("rol caído") });
  assert.deepEqual(await decision(), { lanza: "rol caído" });
});

// ------------------------------------------------------------ las cuatro rutas
const RUTAS = {
  "/api/geocodificar": await import("@/app/api/geocodificar/route"),
  "/api/direccion-ia": await import("@/app/api/direccion-ia/route"),
  "/api/lectura": await import("@/app/api/lectura/route"),
  "/api/texto": await import("@/app/api/texto/route"),
};

function pedidoA(ruta) {
  const url = `https://ares.prueba${ruta}`;
  if (ruta === "/api/geocodificar") {
    return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ direccion: "Pasaje Inventado 901" }) });
  }
  if (ruta === "/api/direccion-ia") {
    const mensajes = [{ role: "user", content: "Dirección escrita: «PASAJE INVENTADO 901». Ciudad: Arica, Chile." }];
    return new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mensajes }) });
  }
  const datos = new FormData();
  if (ruta === "/api/lectura") datos.set("tipo", "guia");
  datos.set("imagen", new File([new Uint8Array([0xff, 0xd8, 0xff])], "foto.jpg", { type: "image/jpeg" }));
  return new Request(url, { method: "POST", body: datos });
}

test("dorada: cada ruta exige la sesión del conductor por su cuenta (401 JSON, admin 403, desactivado 403)", async () => {
  for (const [ruta, modulo] of Object.entries(RUTAS)) {
    supabase({ usuario: null });
    let res = await modulo.POST(pedidoA(ruta));
    assert.deepEqual({ estado: res.status, cuerpo: await res.json() }, SESION_VENCIDA, ruta);
    assert.match(res.headers.get("content-type"), /application\/json/, ruta);
    supabase({ rol: "admin" });
    res = await modulo.POST(pedidoA(ruta));
    assert.deepEqual({ estado: res.status, cuerpo: await res.json() }, SOLO_CONDUCTOR, ruta);
    supabase({ ficha: { id: "c-1", nombre: "Conductor Prueba", activo: false } });
    res = await modulo.POST(pedidoA(ruta));
    assert.deepEqual({ estado: res.status, cuerpo: await res.json() }, DESACTIVADO, ruta);
  }
});

test("dorada: cada ruta llama a conductorDeLaApi antes de leer el cuerpo o mirar las claves", () => {
  for (const ruta of Object.keys(RUTAS)) {
    const fuente = readFileSync(new URL(`../src/app${ruta}/route.ts`, import.meta.url), "utf8");
    const post = fuente.slice(fuente.indexOf("export async function POST"));
    const auth = post.search(/conductorDeLaApi\(\)/);
    assert.ok(auth > 0, `${ruta} no llama a conductorDeLaApi`);
    for (const despues of ["request.", "process.env", "Disponible()"]) {
      const i = post.indexOf(despues);
      if (i >= 0) assert.ok(auth < i, `${ruta}: ${despues} antes de verificar la sesión`);
    }
    assert.match(post.slice(auth, auth + 200), /if \(!quien\.ok\) return/, `${ruta}: no corta sin sesión`);
  }
});

// ------------------------------------------------------------ el proxy
const { updateSession } = await import("@/lib/supabase/sesion-proxy");
const { NextRequest } = await import("next/server");
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://prueba038.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-prueba";

/** Una sesión de Supabase en la cookie, como la deja @supabase/ssr, y el `fetch` de Auth anotado. */
function conSesion() {
  const sesion = {
    access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEiLCJleHAiOjQxMDI0NDQ4MDB9.firma",
    refresh_token: "refresco-de-prueba",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 4102444800,
    user: { id: "u-1", aud: "authenticated", role: "authenticated" },
  };
  const cookie = `sb-prueba038-auth-token=base64-${Buffer.from(JSON.stringify(sesion)).toString("base64url")}`;
  const llamadas = [];
  globalThis.fetch = async (url) => {
    llamadas.push(String(url));
    return new Response(JSON.stringify({ id: "u-1", aud: "authenticated", role: "authenticated" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { cookie, llamadas };
}
const fetchOriginal = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

test("dorada: el proxy sigue exigiendo sesión en lo demás (API 401 JSON, pantallas al login)", async () => {
  globalThis.fetch = async () => {
    throw new Error("sin sesión no se consulta");
  };
  let res = await updateSession(new NextRequest("https://ares.prueba/api/whatsapp/send", { method: "POST" }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "Sesión vencida. Vuelve a iniciar sesión." });
  res = await updateSession(new NextRequest("https://ares.prueba/conductor/encomiendas"));
  assert.equal(res.status, 307);
  assert.match(res.headers.get("location"), /\/login\?redirect=%2Fconductor%2Fencomiendas$/);
  // Con sesión, el proxy la consulta a Supabase Auth.
  const { cookie, llamadas } = conSesion();
  res = await updateSession(new NextRequest("https://ares.prueba/api/whatsapp/send", { method: "POST", headers: { cookie } }));
  assert.equal(res.headers.get("x-middleware-next"), "1");
  assert.equal(llamadas.filter((u) => u.includes("/auth/v1/user")).length, 1);
});

// ------------------------------------------------------------ lo nuevo de la 038
test("conductorDeLaApi: el rol y la ficha se preguntan a la vez", async () => {
  const sb = supabase({ ms: 30 });
  assert.equal((await decision()).ok, true);
  assert.deepEqual(sb.eventos.slice(0, 3), ["getUser", "empieza perfiles", "empieza conductores"], "la ficha esperó al rol");
});

const { RUTAS_QUE_SE_VERIFICAN_SOLAS } = await import("@/lib/supabase/sesion-proxy");
const CUATRO = ["/api/geocodificar", "/api/direccion-ia", "/api/lectura", "/api/texto"];

test("proxy: en las cuatro rutas no consulta la sesión (la ruta la verifica), y la lista es exacta", async () => {
  assert.deepEqual([...RUTAS_QUE_SE_VERIFICAN_SOLAS].sort(), [...CUATRO].sort());
  assert.deepEqual(Object.keys(RUTAS).sort(), [...CUATRO].sort(), "cada ruta de la lista tiene su prueba de 401/403");
  const { cookie, llamadas } = conSesion();
  for (const ruta of CUATRO) {
    const res = await updateSession(new NextRequest(`https://ares.prueba${ruta}`, { method: "POST", headers: { cookie } }));
    assert.equal(res.headers.get("x-middleware-next"), "1", ruta);
  }
  assert.equal(llamadas.length, 0, "el proxy consultó a Supabase Auth");
  // Sin sesión tampoco contesta: el 401 lo da la ruta (prueba dorada de arriba).
  globalThis.fetch = async () => {
    throw new Error("no se consulta");
  };
  const res = await updateSession(new NextRequest("https://ares.prueba/api/lectura", { method: "POST" }));
  assert.equal(res.headers.get("x-middleware-next"), "1");
  // No es un prefijo: lo que cuelga de esas rutas, o se les parece, sigue pasando por el proxy.
  for (const ruta of ["/api/geocodificar/otra", "/api/geocodificarx", "/api/texto-nuevo"]) {
    const r = await updateSession(new NextRequest(`https://ares.prueba${ruta}`, { method: "POST" }));
    assert.equal(r.status, 401, ruta);
  }
});

test("proxy.ts: el matcher, compilado como lo compila Next, deja fuera exactamente esas cuatro", async () => {
  const fuente = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const literal = /matcher:\s*\[[\s\S]*?("\/\(\(\?![^"]+")/.exec(fuente)[1];
  const patron = JSON.parse(literal);
  const { getMiddlewareMatchers } = await import("next/dist/build/analysis/get-page-static-info.js");
  const [{ regexp }] = getMiddlewareMatchers(patron, {});
  const pasa = (ruta) => new RegExp(regexp).test(ruta);
  for (const ruta of CUATRO) assert.equal(pasa(ruta), false, `${ruta} pasa por el proxy`);
  const siguen = ["/api/whatsapp/send", "/api/whatsapp/status", "/api/whatsapp/webhook", "/api/geocodificar/otra", "/api/lecturas", "/conductor/encomiendas", "/login", "/"];
  for (const ruta of siguen) assert.equal(pasa(ruta), true, `${ruta} dejó de pasar por el proxy`);
  assert.equal(pasa("/_next/static/chunks/app.js"), false);
  assert.equal(pasa("/icono.png"), false);
});

// ---- Server-Timing, 429 y caché de prompt (Anthropic y Google con el `fetch` global)
const SERVER_TIMING = /^auth;dur=\d+\.\d, proveedor;dur=\d+\.\d$/;

/** Anthropic de mentira: anota cada cuerpo y contesta lo que diga `respuesta(n)`. */
function anthropic(respuesta) {
  const cuerpos = [];
  globalThis.fetch = async (url, init) => {
    const req = new Request(url, init);
    assert.match(req.url, /api\.anthropic\.com\/v1\/messages/);
    cuerpos.push(JSON.parse(await req.text()));
    return respuesta(cuerpos.length);
  };
  return cuerpos;
}
const mensajeIA = (content, usage = {}) =>
  new Response(
    JSON.stringify({
      id: "msg_prueba",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-5",
      content,
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 900, output_tokens: 40, ...usage },
    }),
    { status: 200, headers: { "content-type": "application/json", "request-id": "req_prueba" } },
  );
const json = (cuerpo, estado = 200, cabeceras = {}) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { "content-type": "application/json", ...cabeceras } });

test("/api/direccion-ia: el prompt va con caché y la respuesta trae solo sus cifras, con Server-Timing", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-de-prueba";
  delete process.env.DIRECCION_MODELO;
  supabase();
  const uso = { cache_read_input_tokens: 812, cache_creation_input_tokens: 64 };
  const cuerpos = anthropic(() => mensajeIA([{ type: "tool_use", id: "t1", name: "buscar_direccion", input: { consulta: "Pasaje Inventado 901" } }], uso));
  const res = await RUTAS["/api/direccion-ia"].POST(pedidoA("/api/direccion-ia"));
  assert.equal(res.status, 200);
  const cuerpo = cuerpos[0];
  assert.equal(cuerpo.model, "claude-sonnet-5", "no cambia el modelo");
  assert.deepEqual(cuerpo.cache_control, { type: "ephemeral" }, "falta el cache_control de la petición");
  assert.equal(cuerpo.system.length, 1);
  assert.equal(cuerpo.system[0].type, "text");
  assert.deepEqual(cuerpo.system[0].cache_control, { type: "ephemeral" }, "falta el cache_control del SISTEMA");
  assert.match(cuerpo.system[0].text, /^Corriges direcciones de entrega/);
  assert.deepEqual(cuerpo.thinking, { type: "disabled" });
  assert.deepEqual(cuerpo.output_config, { effort: "low" });
  assert.deepEqual(cuerpo.tools.map((h) => h.name), ["buscar_direccion", "calles_parecidas", "proponer"]);
  const datos = await res.json();
  assert.deepEqual(datos.uso, { cacheLeidos: 812, cacheCreados: 64 });
  assert.equal(datos.contenido[0].name, "buscar_direccion");
  const st = res.headers.get("server-timing");
  assert.match(st, SERVER_TIMING);
  assert.doesNotMatch(st, /inventado|901/i, "la dirección salió en la cabecera");
});

test("/api/direccion-ia: Anthropic limita la tasa → 429 (no 503); el teléfono lo marca como «ocupada»", async () => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-de-prueba";
  supabase();
  const limite = { type: "error", error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your rate limit" } };
  const cuerpos = anthropic(() => json(limite, 429, { "retry-after-ms": "1" }));
  const res = await RUTAS["/api/direccion-ia"].POST(pedidoA("/api/direccion-ia"));
  assert.equal(res.status, 429);
  assert.equal(cuerpos.length, 2, "el SDK reintenta una vez (maxRetries: 1)");
  assert.match((await res.json()).error, /ocupada/);
  assert.match(res.headers.get("server-timing"), SERVER_TIMING);

  // Un 500 de Anthropic sigue siendo 503.
  anthropic(() => json({ type: "error", error: { type: "api_error", message: "x" } }, 500, { "x-should-retry": "false" }));
  assert.equal((await RUTAS["/api/direccion-ia"].POST(pedidoA("/api/direccion-ia"))).status, 503);

  // El teléfono: 429 → error «ocupada»; 503 sin configurar → IANoDisponible; 503 caída → error.
  const { corregirConIA, IANoDisponible } = await import("@/lib/geo/direccion-ia/cliente");
  const servidor = (estado, error) => {
    globalThis.fetch = async (url) => {
      assert.equal(String(url), "/api/direccion-ia");
      return json({ error }, estado);
    };
  };
  servidor(429, "La IA está ocupada. Intenta de nuevo en un momento.");
  assert.deepEqual(await corregirConIA("PASAJE INVENTADO 901"), {
    tipo: "error",
    mensaje: "La IA está ocupada. Intenta de nuevo en un momento.",
    ocupada: true,
  });
  servidor(503, "La IA no respondió. Intenta de nuevo.");
  assert.deepEqual(await corregirConIA("PASAJE INVENTADO 901"), { tipo: "error", mensaje: "La IA no respondió. Intenta de nuevo." });
  servidor(503, "La IA no está configurada.");
  await assert.rejects(() => corregirConIA("PASAJE INVENTADO 901"), IANoDisponible);
});

test("/api/geocodificar y /api/lectura: Server-Timing con solo cifras", async () => {
  supabase();
  process.env.GOOGLE_MAPS_KEY = "clave-de-prueba";
  globalThis.fetch = async (url) => {
    assert.match(String(url), /maps\.googleapis\.com/);
    return json({ status: "ZERO_RESULTS", results: [] });
  };
  let res = await RUTAS["/api/geocodificar"].POST(pedidoA("/api/geocodificar"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sugerencias: [] });
  let st = res.headers.get("server-timing");
  assert.match(st, SERVER_TIMING);
  assert.doesNotMatch(st, /inventado|901/i);

  process.env.ANTHROPIC_API_KEY = "sk-ant-api03-de-prueba";
  anthropic(() => mensajeIA([{ type: "text", text: JSON.stringify({ folio: null, totalDeclarado: null, lineas: [] }) }]));
  res = await RUTAS["/api/lectura"].POST(pedidoA("/api/lectura"));
  assert.equal(res.status, 200);
  st = res.headers.get("server-timing");
  assert.match(st, SERVER_TIMING);
  // Sin sesión, solo el tramo de auth.
  supabase({ usuario: null });
  res = await RUTAS["/api/geocodificar"].POST(pedidoA("/api/geocodificar"));
  assert.match(res.headers.get("server-timing"), /^auth;dur=\d+\.\d$/);
});
