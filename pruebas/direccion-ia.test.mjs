// Corregir con IA las direcciones que no se ubicaron (spec 018; en lote desde la spec 040, que
// prueba el lote en 040-ia-lote.test.mjs).
//
// La IA va en un doble: lo que se prueba es que las coordenadas salgan SIEMPRE de un buscador
// (nunca de la IA), que la confianza no supere a la del candidato, y que nada se aplique sin que
// el conductor confirme.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const { interpretar, IANoDisponible } = await import("@/lib/geo/direccion-ia/cliente");
const { corregirSinUbicar, esSegura, aplicarCorreccion } = await import("@/lib/encomiendas/local/corregir-direcciones");
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
  fuente: "google",
};

/** La IA de corregirDirecciones (spec 040: una llamada con la lista), armada con una respuesta
 *  por dirección. */
const cadaUna = (responder) => async (direcciones) => Promise.all(direcciones.map((d) => responder(d)));

// ---------------------------------------------------------------- cliente
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

test("corregirSinUbicar: propone y NO cambia nada; el conductor confirma (terreno 2026-10-27)", async () => {
  const segura = await pedido("AV STA MARIA 2150");
  const dudosa = await pedido("PJE 3 CASA 12");
  const barrio = await pedido("POB LA CHIMBA");
  const yaUbicado = await pedido("Calle Real 1", { lat: -18.47, lng: -70.3 });
  const vistos = [];
  const r = await corregirSinUbicar(HOY, {
    corregir: cadaUna(async (d) => {
      vistos.push(d);
      if (d.startsWith("AV")) {
        return { tipo: "propuesta", candidato: SANTA_MARIA, direccion: "Avenida Santa María 2150", confianza: "alta", motivo: "m" };
      }
      if (d.startsWith("PJE")) {
        return { tipo: "propuesta", candidato: { ...SANTA_MARIA, coincideNumero: false }, direccion: "Pasaje 3 1200", confianza: "media", motivo: "Otro número." };
      }
      return { tipo: "propuesta", candidato: { ...SANTA_MARIA, confianza: "baja" }, direccion: "La Chimba", confianza: "baja", motivo: "Solo el barrio." };
    }),
  });
  assert.ok(!vistos.includes(yaUbicado.direccion), "intentó corregir uno ya ubicado");
  const porId = Object.fromEntries(r.propuestas.map((p) => [p.pedidoId, p.segura]));
  assert.deepEqual(porId, { [segura.id]: true, [dudosa.id]: false }, "un barrio no se propone; la dudosa va marcada");
  assert.equal(r.sinArreglo, 1);
  // Nada cambió todavía.
  const antes = await almacen.leerPedidos(HOY);
  assert.ok(antes.filter((p) => p.id !== yaUbicado.id).every((p) => p.lat == null), "se aplicó algo sin confirmar");
  void barrio;

  // El conductor confirma la segura.
  await aplicarCorreccion(r.propuestas.find((p) => p.pedidoId === segura.id));
  const p1 = (await almacen.leerPedidos(HOY)).find((p) => p.id === segura.id);
  assert.equal(p1.direccion, "Avenida Santa María 2150");
  assert.equal(p1.lat, SANTA_MARIA.lat);
  assert.match(p1.notas, /confirmada; decía «AV STA MARIA 2150»/);
});

test("aplicarCorreccion: corregida con el lápiz, queda la que eligió el conductor (dueño, 2026-11-11)", async () => {
  const mala = await pedido("AV STA MARIA 2150");
  const igual = await pedido("AV STA MARIA 2151");
  const r = await corregirSinUbicar(HOY, {
    corregir: cadaUna(async () => ({ tipo: "propuesta", candidato: SANTA_MARIA, direccion: "Avenida Santa María 2150", confianza: "alta", motivo: "m" })),
  });
  const de = (id) => r.propuestas.find((p) => p.pedidoId === id);

  // Eligió otra de la lista: su texto y su punto, nunca los de la IA.
  const elegida = { direccion: "Avenida Santa María 2250", lat: -18.4735, lng: -70.2911 };
  await aplicarCorreccion(de(mala.id), elegida);
  const p1 = (await almacen.leerPedidos(HOY)).find((p) => p.id === mala.id);
  assert.equal(p1.direccion, elegida.direccion);
  assert.deepEqual([p1.lat, p1.lng], [elegida.lat, elegida.lng]);
  assert.match(p1.notas, /corregida manualmente sobre la de la IA; decía «AV STA MARIA 2150»/);

  // Abrió el lápiz y dejó la de la IA: cuenta como la de la IA.
  await aplicarCorreccion(de(igual.id), { direccion: SANTA_MARIA.direccion, lat: SANTA_MARIA.lat, lng: SANTA_MARIA.lng });
  const p2 = (await almacen.leerPedidos(HOY)).find((p) => p.id === igual.id);
  assert.match(p2.notas, /corregida con IA y confirmada; decía «AV STA MARIA 2151»/);
});

test("esSegura: la puerta, o la cuadra con el número; nunca el barrio", () => {
  const p = (confianza, candidato) => ({ tipo: "propuesta", candidato: { ...SANTA_MARIA, ...candidato }, direccion: "d", confianza, motivo: "m" });
  assert.equal(esSegura(p("alta", {})), true);
  assert.equal(esSegura(p("media", { confianza: "aproximada", coincideNumero: null })), true);
  assert.equal(esSegura(p("media", { confianza: "aproximada", coincideNumero: false })), false);
  assert.equal(esSegura(p("media", { confianza: "exacta", coincideNumero: false })), false);
  assert.equal(esSegura(p("baja", { confianza: "baja" })), false);
  // La calle entera, sin el número: su punto puede estar a kilómetros (terreno 2026-10-28).
  assert.equal(esSegura(p("media", { confianza: "aproximada", coincideNumero: null, soloCalle: true })), false);
  assert.equal(esSegura(p("alta", { soloCalle: true })), false, "ni con la IA segura");
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

test("corregirSinUbicar: la propuesta queda guardada y no se vuelve a pagar al reabrir (dueño, 2026-11-13)", async () => {
  const mala = await pedido("AV STA MARIA 2150");
  let llamadas = 0;
  const corregir = cadaUna(async () => (
    llamadas++,
    { tipo: "propuesta", candidato: SANTA_MARIA, direccion: "Avenida Santa María 2150", confianza: "alta", motivo: "m" }
  ));
  await corregirSinUbicar(HOY, { ids: [mala.id], corregir });
  assert.equal(llamadas, 1);

  // Se cerró la app: la propuesta sale del teléfono, sin preguntarle a la IA.
  const { propuestasGuardadas } = await import("@/lib/encomiendas/local/corregir-direcciones");
  const guardadas = await propuestasGuardadas(HOY, [mala.id]);
  assert.equal(guardadas.length, 1);
  assert.equal(guardadas[0].direccion, "Avenida Santa María 2150");
  assert.equal(guardadas[0].original, "AV STA MARIA 2150");
  assert.equal(guardadas[0].segura, true);

  // Volver a tocar «Corregir con IA» no la paga de nuevo.
  await corregirSinUbicar(HOY, { ids: [mala.id], corregir });
  assert.equal(llamadas, 1, "le preguntó otra vez a la IA");

  // Confirmada, ya no se muestra y el pedido queda sin la propuesta.
  await aplicarCorreccion(guardadas[0]);
  assert.deepEqual(await propuestasGuardadas(HOY, [mala.id]), []);
  const p = (await almacen.leerPedidos(HOY)).find((x) => x.id === mala.id);
  assert.equal(p.propuestaIA, undefined);
});

test("propuestasGuardadas: si el conductor cambió la dirección a mano, la propuesta ya no vale", async () => {
  const mala = await pedido("PJE 9 CASA 4");
  await corregirSinUbicar(HOY, {
    ids: [mala.id],
    corregir: cadaUna(async () => ({ tipo: "propuesta", candidato: SANTA_MARIA, direccion: "Pasaje 9 1200", confianza: "media", motivo: "m" })),
  });
  await almacen.cambiarDireccion(mala.id, "Pasaje 9 1204", null);
  const { propuestasGuardadas } = await import("@/lib/encomiendas/local/corregir-direcciones");
  assert.deepEqual(await propuestasGuardadas(HOY, [mala.id]), []);
});

// ---- 2026-11-16: la IA revisa también los dudosos, sin tope de 15 ----
const propuestaEn = (lat, lng) => async () => ({
  tipo: "propuesta",
  candidato: { ...SANTA_MARIA, lat, lng },
  direccion: "Avenida Santa María 2150",
  confianza: "alta",
  motivo: "m",
});

test("corregirDirecciones: un dudoso de la carga (con punto) recibe propuesta, y al confirmarla se mueve y pierde el ⚠", async () => {
  const { corregirDirecciones } = await import("@/lib/encomiendas/local/corregir-direcciones");
  const dudoso = await pedido("PASAJE 1 1450", { lat: -18.43, lng: -70.29 });
  await almacen.ubicarConDuda([{ id: dudoso.id, punto: { lat: -18.43, lng: -70.29 }, problema: { tipo: "calle_repetida", opciones: [{ direccion: "Pasaje 1", detalle: null, lat: -18.43, lng: -70.29 }] } }]);
  const r = await corregirDirecciones(HOY, { ids: [dudoso.id], corregir: cadaUna(propuestaEn(SANTA_MARIA.lat, SANTA_MARIA.lng)) });
  assert.equal(r.propuestas.length, 1);
  await aplicarCorreccion(r.propuestas[0]);
  const p = (await almacen.leerPedidos(HOY)).find((x) => x.id === dudoso.id);
  assert.equal(p.lat, SANTA_MARIA.lat);
  assert.deepEqual(p.problemas, [], "el ⚠ del lugar de antes se va");
});

test("corregirDirecciones: sin ids revisa los sin ubicar y los de lugar en duda; una propuesta en el mismo punto no se muestra", async () => {
  const { corregirDirecciones } = await import("@/lib/encomiendas/local/corregir-direcciones");
  const enDuda = await pedido("PJE 2 900", { lat: -18.5, lng: -70.3 });
  await almacen.ubicarConDuda([{ id: enDuda.id, punto: { lat: -18.5, lng: -70.3 }, problema: { tipo: "solo_calle", opciones: [{ direccion: "Pasaje 2", detalle: null, lat: -18.5, lng: -70.3 }] } }]);
  const bien = await pedido("Calle Real 1", { lat: -18.47, lng: -70.3 });
  const vistos = [];
  const r = await corregirDirecciones(HOY, {
    corregir: cadaUna(async (d) => (vistos.push(d), propuestaEn(-18.50001, -70.30001)())),
  });
  assert.deepEqual(vistos, ["PJE 2 900"], "el bien ubicado no se paga");
  assert.equal(r.propuestas.length, 0, "a 1 m del punto que ya tenía: no cambia nada");
  void bien;
});

test("corregirDirecciones: pasa de 15 pedidos en una carga", async () => {
  const { corregirDirecciones } = await import("@/lib/encomiendas/local/corregir-direcciones");
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push((await pedido(`CALLE INVENTADA ${900 + i}`)).id);
  let preguntas = 0;
  await corregirDirecciones(HOY, { ids, corregir: cadaUna(async () => (preguntas++, { tipo: "sin_arreglo", motivo: "m" })) });
  assert.equal(preguntas, 20);
});
