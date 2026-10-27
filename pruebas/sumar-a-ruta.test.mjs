// Pedidos que entran o vuelven a la ruta en curso sin rehacerla (spec 017, R4).
//
// Las funciones puras de planificar.ts sobre una recta (como planificar.test) y
// el flujo real sobre IndexedDB (fake-indexeddb), con el trazado de Mapbox en un
// doble.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.prueba";

const { lugarMasBarato, lugarParaReintentar, MIN_REINTENTO } = await import("@/lib/encomiendas/local/planificar");
const almacen = await import("@/lib/encomiendas/local/almacen");
const { guardarPedido, guardarRuta, leerRuta, marcarResultado } = almacen;
const { dejarParaMasTarde, sumarALaRuta } = await import("@/lib/encomiendas/local/sumar-a-ruta");
const idb = await import("@/lib/encomiendas/local/idb");

// ---------------------------------------------------------------- puras
/** Parada a `km` de donde está el conductor, sobre una recta. */
const P = (id, km) => ({ id, km, lat: 0, lng: 0, bloqueHorarioId: null });
const metros = (a, b) => Math.abs(b.km - (a?.km ?? 0)) * 1000;

test("lugarMasBarato: entra entre las dos paradas que lo rodean", () => {
  const orden = [P("a", 1), P("b", 2), P("c", 3), P("d", 4)];
  assert.equal(lugarMasBarato(orden, P("x", 2.5), metros), 2);
  assert.equal(lugarMasBarato(orden, P("x", 9), metros), 4, "más allá de todo: al final");
  // Desde la posición 3 no puede volver atrás: la ruta es abierta y al final
  // solo suma la ida (2,5 km), contra 3 km de meterlo entre c y d.
  assert.equal(lugarMasBarato(orden, P("x", 1.5), metros, 3), 4);
  assert.equal(lugarMasBarato([...orden, P("e", 9)], P("x", 1.5), metros, 3), 3);
});

test("lugarParaReintentar: no antes de media hora, y de pasada", () => {
  // Paradas cada 1 km: cada una son 2,4 min de viaje + 4 de entrega = 6,4 min.
  // Media hora se cumple tras la 5.ª; la parada que se deja está en el km 0, y
  // la ruta vuelve a pasar cerca en el km 0,5 (la 8.ª, un desvío).
  const resto = [1, 2, 3, 4, 5, 6, 7].map((km, i) => P(`s${i}`, km));
  resto.push(P("vuelta", 0.5), P("lejos", 12));
  const lugar = lugarParaReintentar(resto, P("x", 0), metros);
  assert.ok(lugar >= 5, `quedó en ${lugar}: antes de ${MIN_REINTENTO} min`);
  // Junto a la vuelta por el mismo lugar (antes o después de ella cuesta igual).
  assert.ok(lugar === 7 || lugar === 8, `quedó en ${lugar}: no aprovechó la vuelta por el mismo lugar`);
});

test("lugarParaReintentar: con poca ruta por delante va al final", () => {
  const resto = [P("a", 1), P("b", 2)];
  assert.equal(lugarParaReintentar(resto, P("x", 0), metros), 2);
});

// ----------------------------------------------------------------- flujo
const HOY = "2026-08-21";
const BASE = { lat: -18.4783, lng: -70.2979 };
const CLAVE = {
  [idb.STORES.pedidos]: (f) => f.id,
  [idb.STORES.rutas]: (f) => f.fecha,
  [idb.STORES.cola]: (f) => f.id,
};

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, CLAVE[store](fila));
    });
  }
  globalThis.fetch = async (url) => {
    const puntos = decodeURIComponent(new URL(url).pathname.split("/").pop())
      .split(";")
      .map((par) => par.split(",").map(Number));
    return Response.json({ routes: [{ geometry: { coordinates: puntos }, distance: 1000, duration: 600 }] });
  };
});

async function pedido(n, lat) {
  return (
    await guardarPedido(
      { nombre: `Cliente ${n}`, telefono: `+5691234100${n}`, direccion: `Calle ${n}`, lat, lng: BASE.lng, notas: null },
      HOY,
    )
  ).id;
}

/** Diez pedidos cada ~1 km hacia el sur, en ruta y en ese orden. */
async function rutaEnCurso() {
  const ids = [];
  for (let n = 1; n <= 10; n++) ids.push(await pedido(n, BASE.lat - n * 0.009));
  await guardarRuta({ fecha: HOY, pedidoIdsEnOrden: ids, trazado: [[BASE.lng, BASE.lat]], distanciaM: null, duracionS: null });
  return ids;
}

test("dejar para más tarde: no va al final si la ruta vuelve a pasar cerca", async () => {
  const ids = await rutaEnCurso();
  // Un pedido al lado del 1.º, que la ruta visita de vuelta, y uno lejos al final.
  const cerca = await pedido(11, BASE.lat - 0.009 - 0.0005);
  const lejos = await pedido(12, BASE.lat - 15 * 0.009);
  await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [...ids, cerca, lejos],
    trazado: [[BASE.lng, BASE.lat]],
    distanciaM: null,
    duracionS: null,
  });

  const lugar = await dejarParaMasTarde(HOY, ids[0]);
  const orden = (await leerRuta(HOY)).orden;
  assert.ok(lugar != null, "fue al final");
  assert.equal(Math.abs(orden.indexOf(ids[0]) - orden.indexOf(cerca)), 1, "no quedó junto al que está al lado");
  assert.equal(new Set(orden).size, 12, "se perdió o se duplicó una parada");
});

test("dejar para más tarde: lo cerrado no se mueve", async () => {
  const ids = await rutaEnCurso();
  await marcarResultado({ fecha: HOY, pedidoId: ids[0], conductorId: "11111111-1111-7111-8111-111111111111" }, "entregado");
  await dejarParaMasTarde(HOY, ids[1]);
  const orden = (await leerRuta(HOY)).orden;
  assert.equal(orden[0], ids[0]);
  assert.notEqual(orden[1], ids[1], "la parada que se dejó sigue primera");
});

test("sumar a la ruta: el pedido tardío entra de pasada y la parada activa no se mueve", async () => {
  const ids = await rutaEnCurso();
  // Entre el 6.º y el 7.º.
  const tardio = await pedido(20, BASE.lat - 6.5 * 0.009);
  const sinPunto = (
    await guardarPedido({ nombre: "Sin punto", telefono: "+56912340000", direccion: "?", lat: null, lng: null, notas: null }, HOY)
  ).id;

  assert.equal(await sumarALaRuta(HOY), 1);
  const orden = (await leerRuta(HOY)).orden;
  assert.equal(orden[0], ids[0], "se movió la parada activa");
  assert.equal(orden.indexOf(tardio), orden.indexOf(ids[5]) + 1);
  assert.ok(!orden.includes(sinPunto), "entró un pedido sin punto");
  assert.equal(await sumarALaRuta(HOY), 0, "la segunda vez no hay nada que sumar");
});
