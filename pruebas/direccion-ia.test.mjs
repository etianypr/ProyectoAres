// Corregir con IA las direcciones que no se ubicaron (spec 018).
//
// La IA y los buscadores van en dobles: lo que se prueba es que la conversación
// tenga la forma que acepta la API, que las coordenadas salgan SIEMPRE de un
// buscador (nunca de la IA), que la confianza no supere a la del candidato, y
// que solo la corrección segura se aplique sola.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const { conversacionValida, MAX_VUELTAS } = await import("@/lib/geo/direccion-ia/contrato");
const { corregirConIA, interpretar, IANoDisponible } = await import("@/lib/geo/direccion-ia/cliente");
const { corregirSinUbicar, seAplicaSola } = await import("@/lib/encomiendas/local/corregir-direcciones");
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

const SANTA_MARIA = {
  id: "x",
  direccion: "Avenida Santa María 2150",
  detalle: "Arica",
  lat: -18.4721,
  lng: -70.2903,
  soloCalle: false,
  confianza: "exacta",
  coincideNumero: true,
  fuente: "mapbox",
};

/** La IA de mentira: contesta por turno lo que diga el guion. */
function iaConGuion(guion) {
  const conversaciones = [];
  return {
    conversaciones,
    pedir: async (mensajes) => {
      assert.ok(conversacionValida(mensajes), "la conversación no la aceptaría el servidor");
      conversaciones.push(structuredClone(mensajes));
      const turno = guion[conversaciones.length - 1];
      if (turno instanceof Error) throw turno;
      return { contenido: turno, fin: "tool_use" };
    },
  };
}
const usar = (id, name, input) => ({ type: "tool_use", id, name, input });

// ---------------------------------------------------------------- contrato
test("conversacionValida: turnos alternados, empieza el usuario, tamaño acotado", () => {
  const inicio = { role: "user", content: "Dirección escrita: «X»." };
  assert.equal(conversacionValida([inicio]), true);
  assert.equal(conversacionValida([]), false);
  assert.equal(conversacionValida([{ role: "assistant", content: [{ type: "text", text: "hola" }] }]), false);
  assert.equal(conversacionValida([inicio, inicio]), false, "dos del usuario seguidos");
  assert.equal(conversacionValida([inicio, { role: "assistant", content: [{ type: "image" }] }]), false);
  assert.equal(conversacionValida([{ role: "user", content: "x".repeat(70_000) }]), false, "demasiado grande");
  const larga = [inicio];
  for (let i = 0; i < MAX_VUELTAS + 1; i++) {
    larga.push({ role: "assistant", content: [usar(`t${i}`, "buscar_direccion", { consulta: "x" })] });
    larga.push({ role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "[]" }] });
  }
  assert.equal(conversacionValida(larga), false, "más vueltas de las permitidas");
});

// ---------------------------------------------------------------- cliente
test("corregirConIA: busca, elige un candidato por su id y las coordenadas son del buscador", async () => {
  const ia = iaConGuion([
    [usar("t1", "calles_parecidas", { nombre: "STA MARIA" })],
    [usar("t2", "buscar_direccion", { consulta: "Avenida Santa María 2150" })],
    [usar("t3", "proponer", { candidato: "c1", direccion: "Avenida Santa María 2150", confianza: "alta", motivo: "Faltaba Avenida." })],
  ]);
  const consultas = [];
  const r = await corregirConIA("AV STA MARIA 2150", {
    pedir: ia.pedir,
    calles: async () => [{ nombre: "Avenida Santa María", largo: 3400 }],
    buscar: async (q) => (consultas.push(q), [SANTA_MARIA]),
  });
  assert.equal(r.tipo, "propuesta");
  assert.equal(r.confianza, "alta");
  assert.deepEqual([r.candidato.lat, r.candidato.lng], [SANTA_MARIA.lat, SANTA_MARIA.lng]);
  assert.deepEqual(consultas, ["Avenida Santa María 2150"]);
  // La IA recibió lo que devolvió cada herramienta.
  const ultima = ia.conversaciones.at(-1);
  assert.match(ultima.at(-1).content[0].content, /"id":"c1"/);
});

test("interpretar: un id que ningún buscador devolvió no se acepta (la IA no inventa puntos)", () => {
  const r = interpretar({ candidato: "c9", direccion: "Calle Inventada 1", confianza: "alta", motivo: "x" }, new Map());
  assert.equal(r.tipo, "sin_arreglo");
});

test("interpretar: la confianza nunca supera a la del candidato", () => {
  const candidatos = new Map([
    ["c1", { ...SANTA_MARIA, id: "c1", confianza: "aproximada" }],
    ["c2", { ...SANTA_MARIA, id: "c2", coincideNumero: false }],
    ["c3", { ...SANTA_MARIA, id: "c3", confianza: "baja" }],
  ]);
  const de = (id, confianza = "alta") => interpretar({ candidato: id, direccion: "d", confianza, motivo: "m" }, candidatos).confianza;
  assert.equal(de("c1"), "media", "una cuadra no es la puerta");
  assert.equal(de("c2"), "media", "el número no coincide");
  assert.equal(de("c3", "media"), "baja", "un barrio no es una dirección");
});

test("corregirConIA: si la IA no propone nada o se pasa de vueltas, queda sin arreglo", async () => {
  const sinNada = await corregirConIA("X 1", { pedir: iaConGuion([[{ type: "text", text: "No sé." }]]).pedir });
  assert.deepEqual(sinNada, { tipo: "sin_arreglo", motivo: "No sé." });

  const eterna = iaConGuion(Array.from({ length: MAX_VUELTAS }, (_, i) => [usar(`t${i}`, "buscar_direccion", { consulta: "x" })]));
  const r = await corregirConIA("X 1", { pedir: eterna.pedir, buscar: async () => [] });
  assert.equal(r.tipo, "sin_arreglo");
  assert.equal(eterna.conversaciones.length, MAX_VUELTAS);
});

test("corregirConIA: sin señal devuelve error; sin IA en el servidor avisa para no seguir", async () => {
  const r = await corregirConIA("X 1", { pedir: iaConGuion([new Error("sin señal")]).pedir });
  assert.equal(r.tipo, "error");
  await assert.rejects(() => corregirConIA("X 1", { pedir: iaConGuion([new IANoDisponible()]).pedir }), IANoDisponible);
});

// ------------------------------------------------------------ el lote del día
const HOY = "2026-08-22";
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
});

async function pedido(direccion, punto = null) {
  return almacen.guardarPedido(
    { nombre: "Cliente", telefono: "+56912345678", direccion, lat: punto?.lat ?? null, lng: punto?.lng ?? null, notas: null },
    HOY,
  );
}

test("corregirSinUbicar: aplica solo la segura y deja la dudosa como sugerencia", async () => {
  const segura = await pedido("AV STA MARIA 2150");
  const dudosa = await pedido("PJE 3 CASA 12");
  const yaUbicado = await pedido("Calle Real 1", { lat: -18.47, lng: -70.3 });
  const vistos = [];
  const r = await corregirSinUbicar(HOY, {
    corregir: async (d) => {
      vistos.push(d);
      return d.startsWith("AV")
        ? { tipo: "propuesta", candidato: SANTA_MARIA, direccion: "Avenida Santa María 2150", confianza: "alta", motivo: "m" }
        : { tipo: "propuesta", candidato: { ...SANTA_MARIA, confianza: "baja" }, direccion: "Pasaje 3", confianza: "baja", motivo: "Solo el barrio." };
    },
  });
  assert.equal(r.corregidas, 1);
  assert.equal(r.sugerencias.length, 1);
  assert.ok(!vistos.includes(yaUbicado.direccion), "intentó corregir uno ya ubicado");

  const delDia = await almacen.leerPedidos(HOY);
  const p1 = delDia.find((p) => p.id === segura.id);
  assert.equal(p1.direccion, "Avenida Santa María 2150");
  assert.equal(p1.lat, SANTA_MARIA.lat);
  assert.match(p1.notas, /decía «AV STA MARIA 2150»/);
  const p2 = delDia.find((p) => p.id === dudosa.id);
  assert.equal(p2.lat, null, "la dudosa se aplicó sola");
  assert.equal(p2.direccion, "PJE 3 CASA 12");
});

test("seAplicaSola: la puerta, o la cuadra con el número; nunca el barrio", () => {
  const p = (confianza, candidato) => ({ tipo: "propuesta", candidato: { ...SANTA_MARIA, ...candidato }, direccion: "d", confianza, motivo: "m" });
  assert.equal(seAplicaSola(p("alta", {})), true);
  assert.equal(seAplicaSola(p("media", { confianza: "aproximada", coincideNumero: null })), true);
  assert.equal(seAplicaSola(p("media", { confianza: "aproximada", coincideNumero: false })), false);
  assert.equal(seAplicaSola(p("media", { confianza: "exacta", coincideNumero: false })), false);
  assert.equal(seAplicaSola(p("baja", { confianza: "baja" })), false);
});

test("corregirSinUbicar: sin IA en el servidor no sigue con las demás", async () => {
  await pedido("A 1");
  await pedido("B 2");
  let llamadas = 0;
  const r = await corregirSinUbicar(HOY, {
    corregir: async () => {
      llamadas++;
      throw new IANoDisponible();
    },
  });
  assert.equal(r.sinIA, true);
  assert.equal(llamadas, 1);
});
