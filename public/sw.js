// Service worker de la app del conductor (spec 015, research R2).
//
// Guarda el "cascarón" de la app —el HTML de /conductor y los JS/CSS de Next—
// para que abra sin señal: los pedidos, la ruta y la cola ya viven en IndexedDB,
// lo único que faltaba era la página. Acá NO se guarda ningún dato de clientes: no
// toca /api, ni Supabase, ni nada de otro origen.
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
// Lo guardado no puede crecer para siempre (spec 033, G5): cada deploy trae JS
// nuevo (con otro hash) y el viejo quedaba en el teléfono. Cada copia lleva el
// día de su último uso, y lo que no se usó en DIAS_SIN_USO se borra. Lo que se
// usa (la red de calles, el mapa, la pantalla) se vuelve a sellar al usarlo, y
// la página de inicio no se borra nunca: sin ella no abre sin señal.
const DIAS_SIN_USO = 30;
const SELLO = "x-ares-usado";
let limpiadoEl = null;
// El día de la última limpieza, guardado en la misma caché: el service worker se
// apaga y prende muchas veces al día.
const MARCA = "/__ares-limpieza";

/** "YYYY-MM-DD" de hoy (UTC: solo cuenta días de diferencia). */
function hoy() {
  return new Date().toISOString().slice(0, 10);
}

/** ¿Una copia sellada el día `sello` ya lleva DIAS_SIN_USO sin usarse? Sin
 *  sello (guardada antes de esto) no es vieja: se sella hoy. Pura. */
function vencida(sello, dia) {
  if (!sello) return false;
  return Date.parse(dia) - Date.parse(sello) > DIAS_SIN_USO * 86_400_000;
}

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
      await limpiar();
    })(),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const estrategia = estrategiaPara(new URL(pedido.url), pedido.mode, pedido.method);
  if (estrategia !== "red" && limpiadoEl !== hoy()) evento.waitUntil(limpiar());
  if (estrategia === "cache-primero") evento.respondWith(cachePrimero(pedido));
  else if (estrategia === "red-primero") evento.respondWith(redPrimero(pedido));
});

async function cachePrimero(pedido) {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(pedido);
  if (guardada) {
    // Una vez por día: lo que se usa no vence.
    if (guardada.headers.get(SELLO) !== hoy()) sellar(cache, pedido, guardada.clone()).catch(() => {});
    return guardada;
  }
  const respuesta = await fetch(pedido);
  if (respuesta.ok) await sellar(cache, pedido, respuesta.clone());
  return respuesta;
}

/** Guarda la copia con el día de hoy en una cabecera propia. */
async function sellar(cache, pedido, respuesta) {
  const cabeceras = new Headers(respuesta.headers);
  cabeceras.set(SELLO, hoy());
  const cuerpo = await respuesta.blob();
  await cache.put(pedido, new Response(cuerpo, { status: respuesta.status, statusText: respuesta.statusText, headers: cabeceras }));
}

/** Borra lo que no se usó en DIAS_SIN_USO (nunca la página de inicio) y sella lo
 *  que se guardó antes de que hubiera sellos. A lo más una vez por día. */
async function limpiar() {
  const dia = hoy();
  if (limpiadoEl === dia) return;
  limpiadoEl = dia;
  try {
    const cache = await caches.open(CACHE);
    const marca = await cache.match(MARCA);
    if (marca && (await marca.text()) === dia) return;
    for (const pedido of await cache.keys()) {
      const ruta = new URL(pedido.url).pathname;
      if (ruta === INICIO || ruta === MARCA) continue;
      const guardada = await cache.match(pedido);
      if (!guardada) continue;
      const sello = guardada.headers.get(SELLO);
      if (vencida(sello, dia)) await cache.delete(pedido);
      else if (!sello) await sellar(cache, pedido, guardada);
    }
    await cache.put(MARCA, new Response(dia));
  } catch {
    // Sin poder limpiar no pasa nada: se intenta mañana.
    limpiadoEl = null;
  }
}

async function redPrimero(pedido) {
  const cache = await caches.open(CACHE);
  const red = fetch(pedido).then(async (respuesta) => {
    // Solo páginas buenas y finales: una redirección (a /login, a /conductor/…)
    // no es una pantalla que se pueda mostrar sin red.
    if (respuesta.ok && respuesta.type === "basic" && !respuesta.redirected) {
      await sellar(cache, pedido, respuesta.clone());
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
