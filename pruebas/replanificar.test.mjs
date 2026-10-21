// La ruta en curso se reordena sola con las respuestas de WhatsApp (spec 010).
//
// Corre el almacén real sobre IndexedDB (fake-indexeddb) y replanificarRuta()
// real. El trazado de Mapbox responde un doble: lo que se prueba es el orden y
// los avisos, no el camino por calles.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.prueba";

const almacen = await import("@/lib/encomiendas/local/almacen");
const { guardarPedido, guardarRuta, leerRuta, leerPedidos, leerCola, marcarResultado, registrarDisponibilidad } =
  almacen;
const { replanificarRuta } = await import("@/lib/encomiendas/local/replanificar");
const idb = await import("@/lib/encomiendas/local/idb");
const reloj = await import("./dobles/reloj.mjs");

const HOY = "2026-08-20";
const CHOFER = "11111111-1111-7111-8111-111111111111";
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
  // Trazado: el doble devuelve una línea recta por los puntos pedidos.
  globalThis.fetch = async (url) => {
    const puntos = decodeURIComponent(new URL(url).pathname.split("/").pop())
      .split(";")
      .map((par) => par.split(",").map(Number));
    return Response.json({ routes: [{ geometry: { coordinates: puntos }, distance: 1000, duration: 600 }] });
  };
});

/** Congela el reloj a una hora del día de hoy, en hora local (como el teléfono). */
function aLaHora(hora, minutos = 0) {
  const hoy = new Date();
  return reloj.congelar(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), hora, minutos).getTime());
}

/** Cinco pedidos cada ~500 m hacia el sur, en ruta y en ese orden. */
async function rutaEnCurso() {
  const ids = [];
  for (let n = 1; n <= 5; n++) {
    const p = await guardarPedido(
      {
        nombre: `Cliente ${n}`,
        telefono: `+5691234000${n}`,
        direccion: `Calle ${n}`,
        lat: BASE.lat - n * 0.0045,
        lng: BASE.lng,
        notas: null,
      },
      HOY,
    );
    ids.push(p.id);
  }
  await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: ids,
    trazado: [[BASE.lng, BASE.lat]],
    distanciaM: null,
    duracionS: null,
  });
  return ids;
}

test("'Mañana' saca el pedido de lo que hay que visitar y avisa", async (t) => {
  t.after(reloj.descongelar);
  aLaHora(10);
  const [a, b, c, d, e] = await rutaEnCurso();

  await registrarDisponibilidad(b, { tipo: "manana" }, "wamid.B", CHOFER);
  const avisos = await replanificarRuta(HOY, [{ pedidoId: b, tipo: "manana" }]);

  assert.deepEqual(avisos, ["Cliente 2 pidió mañana: sale de la ruta de hoy."]);
  // Cerrado primero; el resto conserva el orden que eligió el conductor.
  assert.deepEqual((await leerRuta(HOY)).orden, [b, a, c, d, e]);
  assert.equal((await leerCola()).filter((x) => x.tipo === "omision").length, 1);
});

test("un horario de la tarde manda el pedido al lugar donde se llega en ese bloque", async (t) => {
  t.after(reloj.descongelar);
  aLaHora(10);
  const [a, b, c, d, e] = await rutaEnCurso();

  await registrarDisponibilidad(a, { tipo: "horario_indicado", bloqueHorarioId: "16-18" }, "wamid.A", CHOFER);
  const avisos = await replanificarRuta(HOY, [{ pedidoId: a, tipo: "horario_indicado" }]);

  // La ruta termina antes de las 16:00: se lo deja al final, para cuando abra.
  assert.deepEqual((await leerRuta(HOY)).orden, [b, c, d, e, a]);
  assert.deepEqual(avisos, ["Cliente 1 (16:00 - 18:00) pasa a la parada 5."]);
  // Y el trazado gris ya sigue el orden nuevo: inicio + los cinco pedidos.
  assert.equal((await leerRuta(HOY)).trazado.length, 6);
});

test("un horario que ya no se alcanza queda al final y pide llamar", async (t) => {
  t.after(reloj.descongelar);
  aLaHora(15);
  const [a, b, c, d, e] = await rutaEnCurso();

  await registrarDisponibilidad(c, { tipo: "horario_indicado", bloqueHorarioId: "08-10" }, "wamid.C", CHOFER);
  const [aviso] = await replanificarRuta(HOY, [{ pedidoId: c, tipo: "horario_indicado" }]);

  assert.deepEqual((await leerRuta(HOY)).orden, [a, b, d, e, c]);
  assert.match(aviso, /no se alcanza: llámalo/);
});

test("lo ya entregado no se mueve al reordenar", async (t) => {
  t.after(reloj.descongelar);
  aLaHora(10);
  const [a, b, c, d, e] = await rutaEnCurso();
  await marcarResultado({ fecha: HOY, pedidoId: a, choferId: CHOFER }, "entregado");

  await registrarDisponibilidad(b, { tipo: "horario_indicado", bloqueHorarioId: "18-20" }, "wamid.B", CHOFER);
  await replanificarRuta(HOY, [{ pedidoId: b, tipo: "horario_indicado" }]);

  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.orden, [a, c, d, e, b]);
  assert.equal((await leerPedidos(HOY)).find((p) => p.id === a).resultado, "entregado");
});

test("el trazado se vuelve a pedir con el orden nuevo; sin red queda el anterior", async (t) => {
  t.after(reloj.descongelar);
  aLaHora(10);
  const [a] = await rutaEnCurso();
  await registrarDisponibilidad(a, { tipo: "horario_indicado", bloqueHorarioId: "16-18" }, "wamid.A", CHOFER);

  globalThis.fetch = async () => {
    throw new TypeError("sin red");
  };
  const avisos = await replanificarRuta(HOY, [{ pedidoId: a, tipo: "horario_indicado" }]);
  assert.equal(avisos.length, 1, "sin red el conductor igual tiene que ver el aviso");
  assert.deepEqual((await leerRuta(HOY)).trazado, [[BASE.lng, BASE.lat]]);
});
