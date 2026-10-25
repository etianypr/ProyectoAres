// Service worker de la app del conductor (spec 015, research R2).
//
// Guarda el "cascarón" de la app —el HTML de /conductor y los JS/CSS de Next—
// para que abra sin señal: los pedidos, la ruta y la cola ya viven en IndexedDB,
// lo único que faltaba era la página. Acá NO se guarda ningún dato de clientes: no
// toca /api, ni Supabase, ni Mapbox, ni nada de otro origen.
//
// Navegación del conductor: red primero (la versión publicada manda) con un tope
// de espera, porque en la periferia la red suele estar "conectada" sin llegar a
// ningún lado; si no responde, la copia guardada. Estáticos de Next: caché
// primero (llevan hash en el nombre, no cambian).
const CACHE = "ares-conductor-v1";
// Adonde lleva /conductor. Sin red no se puede seguir esa redirección, así que
// cualquier pantalla del conductor cae a esta copia.
const INICIO = "/conductor/encomiendas";
const MS_ESPERA_RED = 4000;

/** "red" = no se intercepta · "red-primero" · "cache-primero". */
function estrategiaPara(url, modo, metodo) {
  if (metodo !== "GET") return "red";
  if (url.origin !== self.location.origin) return "red";
  if (url.pathname.startsWith("/api/")) return "red";
  if (url.pathname.startsWith("/_next/static/")) return "cache-primero";
  const delConductor = url.pathname === "/conductor" || url.pathname.startsWith("/conductor/");
  if (modo === "navigate" && delConductor) return "red-primero";
  return "red";
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre !== CACHE) await caches.delete(nombre);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const estrategia = estrategiaPara(new URL(pedido.url), pedido.mode, pedido.method);
  if (estrategia === "cache-primero") evento.respondWith(cachePrimero(pedido));
  else if (estrategia === "red-primero") evento.respondWith(redPrimero(pedido));
});

async function cachePrimero(pedido) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(pedido);
  if (guardada) return guardada;
  const respuesta = await fetch(pedido);
  if (respuesta.ok) await cache.put(pedido, respuesta.clone());
  return respuesta;
}

async function redPrimero(pedido) {
  const cache = await caches.open(CACHE);
  const red = fetch(pedido).then(async (respuesta) => {
    // Solo páginas buenas y finales: una redirección (a /login, a /conductor/…)
    // no es una pantalla que se pueda mostrar sin red.
    if (respuesta.ok && respuesta.type === "basic" && !respuesta.redirected) {
      await cache.put(pedido, respuesta.clone());
    }
    return respuesta;
  });
  const tope = new Promise((resolver) => setTimeout(() => resolver(null), MS_ESPERA_RED));

  try {
    const primera = await Promise.race([red, tope]);
    if (primera) return primera;
  } catch {
    // Sin red: se sigue con la copia.
  }
  const guardada = (await cache.match(pedido, { ignoreSearch: true })) ?? (await cache.match(INICIO));
  if (guardada) return guardada;
  // Sin copia: se espera a la red aunque tarde; si falla, la APK muestra su
  // página de "sin señal" (server.errorPath).
  return red;
}
