// Spec 047: el mapa de Arica guardado para verse sin conexión (geo/mapa-guardado).
// Cache Storage y fetch se reemplazan por unos falsos: nada sale a la red.
import test from "node:test";
import assert from "node:assert/strict";
import {
  aProtocolo,
  cargarRecurso,
  deProtocolo,
  esFijo,
  estadoMapa,
  traer,
  transformarPedido,
  vencida,
} from "@/lib/geo/mapa-guardado/protocolo";
import { CAJA_CIUDAD, descargarMapa, descargarSiHaceFalta, letrasYIconos, teselasDeArica, teselasDeCaja } from "@/lib/geo/mapa-guardado/descarga";

const OFM = "https://tiles.openfreemap.org";
const TESELA = `${OFM}/planet/20261122_124456_pt/14/4943/7337.pbf`;

/** Una Cache Storage en memoria, con lo justo que usa protocolo.ts. */
function cachesFalsas() {
  const cajas = new Map();
  const clave = (p) => new URL(typeof p === "string" ? p : p.url).href;
  return {
    cajas,
    async open(nombre) {
      if (!cajas.has(nombre)) cajas.set(nombre, new Map());
      const caja = cajas.get(nombre);
      return {
        async match(p) {
          return caja.get(clave(p))?.clone();
        },
        async put(p, r) {
          caja.set(clave(p), r);
        },
        async keys() {
          return [...caja.keys()].map((u) => new Request(u));
        },
        async delete(p) {
          return caja.delete(clave(p));
        },
      };
    },
  };
}

/** Un fetch falso que anota lo pedido. `respuestas`: url → cuerpo o función. */
function fetchFalso(respuestas = {}) {
  const pedidos = [];
  const f = async (url) => {
    pedidos.push(String(url));
    const r = respuestas[String(url)];
    if (r === undefined) throw new TypeError("Failed to fetch");
    if (typeof r === "function") return r();
    return new Response(typeof r === "string" ? r : JSON.stringify(r), { status: 200 });
  };
  f.pedidos = pedidos;
  return f;
}

async function conFalsos(caches, fetch, cuerpo) {
  const antes = { caches: globalThis.caches, fetch: globalThis.fetch };
  globalThis.caches = caches;
  globalThis.fetch = fetch;
  try {
    return await cuerpo();
  } finally {
    globalThis.caches = antes.caches;
    globalThis.fetch = antes.fetch;
  }
}

test("el protocolo propio cambia solo las URL de OpenFreeMap, y vuelve", () => {
  assert.equal(aProtocolo(TESELA), "ares-mapa://tiles.openfreemap.org/planet/20261122_124456_pt/14/4943/7337.pbf");
  assert.equal(deProtocolo(aProtocolo(TESELA)), TESELA);
  assert.equal(aProtocolo("https://api.openrouteservice.org/x"), "https://api.openrouteservice.org/x");
  assert.equal(transformarPedido(`${OFM}/styles/liberty`).url, "ares-mapa://tiles.openfreemap.org/styles/liberty");
});

test("esFijo: teselas, letras e íconos sí; el estilo y el índice de teselas no", () => {
  assert.equal(esFijo(TESELA), true);
  assert.equal(esFijo(`${OFM}/fonts/Noto Sans Regular/0-255.pbf`), true);
  assert.equal(esFijo(`${OFM}/sprites/ofm_f384/ofm@2x.png`), true);
  assert.equal(esFijo(`${OFM}/styles/liberty`), false);
  assert.equal(esFijo(`${OFM}/backup_planet`), false);
});

test("vencida: 30 días sin usarse", () => {
  assert.equal(vencida("2026-10-01", "2026-11-26"), true);
  assert.equal(vencida("2026-11-01", "2026-11-26"), false);
  assert.equal(vencida(null, "2026-11-26"), false);
});

test("una tesela guardada no vuelve a la red; una nueva se baja y se guarda", async () => {
  const caches = cachesFalsas();
  const fetch = fetchFalso({ [TESELA]: () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }) });
  await conFalsos(caches, fetch, async () => {
    const primera = await cargarRecurso({ url: aProtocolo(TESELA), type: "arrayBuffer" }, new AbortController());
    assert.deepEqual([...new Uint8Array(primera.data)], [1, 2, 3]);
    assert.equal(fetch.pedidos.length, 1);
    const segunda = await cargarRecurso({ url: aProtocolo(TESELA), type: "arrayBuffer" }, new AbortController());
    assert.deepEqual([...new Uint8Array(segunda.data)], [1, 2, 3]);
    assert.equal(fetch.pedidos.length, 1, "la segunda sale de la copia");
  });
});

test("sin conexión: el estilo sale de la copia; sin copia, falla (y el mapa sigue sin fondo)", async () => {
  const caches = cachesFalsas();
  const estilo = { version: 8, sources: {}, layers: [] };
  await conFalsos(caches, fetchFalso({ [`${OFM}/styles/liberty`]: estilo }), async () => {
    const r = await cargarRecurso({ url: aProtocolo(`${OFM}/styles/liberty`), type: "json" }, new AbortController());
    assert.deepEqual(r.data, estilo);
  });
  await conFalsos(caches, fetchFalso({}), async () => {
    const r = await cargarRecurso({ url: aProtocolo(`${OFM}/styles/liberty`), type: "json" }, new AbortController());
    assert.deepEqual(r.data, estilo, "copia");
    await assert.rejects(() => traer(TESELA), /sin conexión|fetch/i);
  });
});

test("una tesela vacía (204) se entrega vacía y se guarda", async () => {
  const caches = cachesFalsas();
  const fetch = fetchFalso({ [TESELA]: () => new Response(null, { status: 204 }) });
  await conFalsos(caches, fetch, async () => {
    const r = await cargarRecurso({ url: aProtocolo(TESELA), type: "arrayBuffer" }, new AbortController());
    assert.equal(r.data.byteLength, 0);
    await cargarRecurso({ url: aProtocolo(TESELA), type: "arrayBuffer" }, new AbortController());
    assert.equal(fetch.pedidos.length, 1);
  });
});

test("la caja de Arica: cuántas teselas, y todas tocan su caja", () => {
  const todas = teselasDeArica();
  assert.ok(todas.length > 60 && todas.length < 140, `${todas.length} teselas`);
  const de14 = teselasDeCaja(CAJA_CIUDAD, 14);
  const lng = (x, z) => (x / 2 ** z) * 360 - 180;
  const lat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
  for (const t of de14) {
    assert.ok(lng(t.x, 14) <= CAJA_CIUDAD.este && lng(t.x + 1, 14) >= CAJA_CIUDAD.oeste);
    assert.ok(lat(t.y + 1, 14) <= CAJA_CIUDAD.norte && lat(t.y, 14) >= CAJA_CIUDAD.sur);
  }
});

const ESTILO_LIBERTY = {
  version: 8,
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sprite: `${OFM}/sprites/ofm_f384/ofm`,
  sources: { openmaptiles: { type: "vector", url: `${OFM}/backup_planet` } },
  layers: [
    { id: "a", type: "symbol", layout: { "text-font": ["Noto Sans Regular"] } },
    { id: "b", type: "symbol", layout: { "text-font": ["Noto Sans Bold"] } },
    { id: "c", type: "line" },
  ],
};

test("letrasYIconos: los rangos de cada fuente del estilo y los íconos normales y @2x", () => {
  const urls = letrasYIconos(ESTILO_LIBERTY);
  assert.equal(urls.length, 2 * 2 + 4);
  assert.ok(urls.includes(`${OFM}/fonts/Noto Sans Bold/0-255.pbf`));
  assert.ok(urls.includes(`${OFM}/sprites/ofm_f384/ofm@2x.png`));
});

test("descargarMapa: baja la caja una vez; al día siguiente solo el estilo y el índice", async () => {
  const caches = cachesFalsas();
  const plantilla = `${OFM}/backup_planet/20261122_124456_pt/{z}/{x}/{y}.pbf`;
  const respuestas = new Proxy(
    { [`${OFM}/styles/liberty`]: ESTILO_LIBERTY, [`${OFM}/backup_planet`]: { tiles: [plantilla] } },
    { get: (o, url) => o[url] ?? (() => new Response(new Uint8Array(10), { status: 200 })) },
  );
  const fetch = fetchFalso(respuestas);
  await conFalsos(caches, fetch, async () => {
    const r = await descargarMapa();
    assert.equal(r.fallidas, 0);
    assert.equal(r.archivos, teselasDeArica().length + 8);
    assert.equal(fetch.pedidos.length, r.archivos + 2);
    // Nada de la ruta ni de las paradas: solo OpenFreeMap.
    assert.ok(fetch.pedidos.every((u) => u.startsWith(`${OFM}/`)));
    const estado = await estadoMapa();
    assert.equal(estado.archivos, r.archivos + 2);
    fetch.pedidos.length = 0;
    await descargarMapa();
    assert.deepEqual(fetch.pedidos, [`${OFM}/styles/liberty`, `${OFM}/backup_planet`]);
  });
});

test("descargarSiHaceFalta: una vez al día, pero de nuevo si la copia desapareció", async () => {
  const guardado = new Map();
  const antes = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => guardado.get(k) ?? null, setItem: (k, v) => guardado.set(k, String(v)) };
  const plantilla = `${OFM}/backup_planet/v1/{z}/{x}/{y}.pbf`;
  const respuestas = new Proxy(
    { [`${OFM}/styles/liberty`]: ESTILO_LIBERTY, [`${OFM}/backup_planet`]: { tiles: [plantilla] } },
    { get: (o, url) => o[url] ?? (() => new Response(new Uint8Array(4), { status: 200 })) },
  );
  try {
    let caches = cachesFalsas();
    const fetch = fetchFalso(respuestas);
    await conFalsos(caches, fetch, async () => {
      assert.ok(await descargarSiHaceFalta(), "la primera vez baja");
      assert.equal(await descargarSiHaceFalta(), null, "el mismo día con la copia entera, no");
    });
    // El sistema borró la copia: el mismo día vuelve a bajar.
    caches = cachesFalsas();
    await conFalsos(caches, fetch, async () => {
      assert.ok(await descargarSiHaceFalta());
    });
  } finally {
    globalThis.localStorage = antes;
  }
});
