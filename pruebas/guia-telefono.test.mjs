// El teléfono del receptor anotado en una línea de la guía (dueño, 2026-11-13):
// se normaliza como en el formulario del pedido, pasa al `telefono` del pedido al
// crearlo, se conserva al leer otra foto, y nunca sale del teléfono (buscadores e
// IA reciben solo la dirección). IndexedDB real (fake-indexeddb) y `fetch` global
// reemplazado: no se gasta ninguna consulta. Números y direcciones inventados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const { cargarLineasGuia } = await import("@/lib/encomiendas/local/cargar-lineas");
const { armarGuia } = await import("@/lib/encomiendas/lectura/guia");
const { conTelefonos, lineasParaCrear, telefonoParaLlamar } = await import("@/lib/encomiendas/lectura/telefono-linea");

const HOY = "2026-11-13";

test("telefonoParaLlamar: +569 si es chileno; null si no alcanza", () => {
  assert.equal(telefonoParaLlamar("9 8765 4321"), "+56987654321");
  assert.equal(telefonoParaLlamar("8765 4321"), "+56987654321", "le falta el 9");
  assert.equal(telefonoParaLlamar("+56 9 8765 4321"), "+56987654321");
  assert.equal(telefonoParaLlamar("8765"), null);
  assert.equal(telefonoParaLlamar(""), null);
  assert.equal(telefonoParaLlamar(undefined), null);
});

test("lineasParaCrear: OF sin ceros, destino limpio y el teléfono como lo guarda el formulario", () => {
  const r = lineasParaCrear([
    { of: "000900101", destino: "Pasaje Inventado 12 ,", dudosa: false, telefono: "9 8765 4321" },
    { of: "900102", destino: "Calle Falsa 34", dudosa: false },
    { of: "900103", destino: "Calle Falsa 56", dudosa: false, telefono: "  " },
    { of: "900104", destino: "Calle Falsa 78", dudosa: false, telefono: "8765" },
  ]);
  assert.deepEqual(r[0], { of: "900101", destino: "Pasaje Inventado 12", telefono: "+56987654321" });
  assert.deepEqual(r[1], { of: "900102", destino: "Calle Falsa 34" });
  assert.deepEqual(r[2], { of: "900103", destino: "Calle Falsa 56" }, "un teléfono en blanco no se manda");
  assert.equal(r[3].telefono, "8765", "sin normalizar queda como se escribió (igual que el formulario)");
});

test("conTelefonos: leer otra foto no borra los teléfonos anotados", () => {
  const antes = [
    { of: "900101", destino: "Pasaje Inventado 12", dudosa: false, telefono: "9 8765 4321" },
    { of: "900102", destino: "Calle Falsa 34", dudosa: false },
  ];
  // armarGuia rehace las líneas sin el teléfono (es lo que pasa al sumar otra foto).
  const unida = armarGuia([...antes, { of: "000900101", destino: "Pasaje Inventado 12" }, { of: "900105", destino: "Calle Falsa 9" }], null, null);
  assert.equal(unida.lineas[0].telefono, undefined);
  const r = conTelefonos(unida.lineas, antes);
  assert.equal(r.find((l) => l.of === "900101").telefono, "9 8765 4321");
  assert.equal(r.find((l) => l.of === "900105").telefono, undefined);
});

test("crearDesdeGuia: el teléfono de la línea queda en el pedido; sin él, vacío", async () => {
  const { creados } = await almacen.crearDesdeGuia(
    lineasParaCrear([
      { of: "900201", destino: "Pasaje Inventado 1", dudosa: false, telefono: "987654321" },
      { of: "900202", destino: "Pasaje Inventado 2", dudosa: false },
    ]),
    HOY,
    { folio: null, origen: "guia_pegada" },
  );
  const guardados = await almacen.leerPedidos(HOY);
  const porOf = new Map(guardados.map((p) => [p.of, p]));
  assert.equal(creados.length, 2);
  assert.equal(porOf.get("900201").telefono, "+56987654321");
  assert.equal(porOf.get("900202").telefono, "");
});

test("cargarLineasGuia: ni los buscadores ni la IA reciben el teléfono de la línea", async () => {
  const enviado = [];
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    enviado.push(`${url} ${init.body ?? ""} ${JSON.stringify(init.headers ?? {})}`);
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const r = await cargarLineasGuia(
      lineasParaCrear([{ of: "900301", destino: "Pasaje Inventado 77", dudosa: false, telefono: "9 1357 2468" }]),
      HOY,
      { folio: null, origen: "guia_pegada", lecturaIA: true, enLinea: () => true },
    );
    assert.equal(r.ids.length, 1);
  } finally {
    globalThis.fetch = fetchAntes;
  }
  assert.ok(enviado.length > 0, "no se consultó a nadie: la prueba no prueba nada");
  for (const e of enviado) {
    assert.ok(!/13572468|1357\D?2468/.test(e), `salió el teléfono: ${e.slice(0, 120)}`);
  }
  const [pedido] = (await almacen.leerPedidos(HOY)).filter((p) => p.of === "900301");
  assert.equal(pedido.telefono, "+56913572468", "el teléfono sí queda en el pedido");
});

test("aplicarCorreccion: el teléfono anotado en la tarjeta de la IA queda en el pedido; la IA solo vio la dirección", async () => {
  const { corregirSinUbicar, aplicarCorreccion } = await import("@/lib/encomiendas/local/corregir-direcciones");
  const { creados } = await almacen.crearDesdeGuia([{ of: "900401", destino: "Pasaje Inventado 401" }], HOY, { folio: null, origen: "guia_pegada" });
  const vistas = [];
  const r = await corregirSinUbicar(HOY, {
    enLinea: () => true,
    corregir: async (...args) => {
      vistas.push(args);
      return {
        tipo: "propuesta",
        direccion: "Pasaje Inventado 401, Arica",
        motivo: "m",
        candidato: { direccion: "Pasaje Inventado 401", lat: -18.48, lng: -70.31, confianza: "exacta", soloCalle: false, coincideNumero: true, fuente: "google" },
      };
    },
  });
  const p = r.propuestas.find((x) => x.pedidoId === creados[0].id);
  assert.ok(p, "sin propuesta");
  assert.equal(p.telefono, "");
  assert.ok(vistas.every((a) => a.length === 1 && typeof a[0] === "string"), "la IA recibió algo más que la dirección");
  await aplicarCorreccion(p, undefined, "9 2468 1357");
  const guardado = (await almacen.leerPedidos(HOY)).find((x) => x.id === creados[0].id);
  assert.equal(guardado.telefono, "+56924681357");
  assert.equal(guardado.lat, -18.48);
  // Sin teléfono escrito, no se toca el que tenía.
  await aplicarCorreccion({ ...p, telefono: "+56924681357" }, undefined, "");
  assert.equal((await almacen.leerPedidos(HOY)).find((x) => x.id === creados[0].id).telefono, "+56924681357");
});
