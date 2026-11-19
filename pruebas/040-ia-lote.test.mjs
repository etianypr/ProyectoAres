// Spec 040: la IA corrige en lote todo lo que no quedó en la puerta, y en pantalla hay tres estados.
//
// Sin red ni IA: la IA es un doble que contesta por id. Lo que se prueba: que el lote lleve solo
// direcciones y candidatos (ids por dirección, sin datos de personas), que un candidato de otra
// dirección no sirva, las dos rondas, los lotes de a LOTE_MAXIMO, el corte sin conexión, el 429, la
// marca «aproximada» del pedido y los tres estados.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const { loteValido, LOTE_MAXIMO, CANDIDATOS_POR_DIRECCION } = await import("@/lib/geo/direccion-ia/contrato");
const { armarLote, corregirEnLote, IANoDisponible, IAOcupada } = await import("@/lib/geo/direccion-ia/cliente");
const { resultadosDe, SISTEMA } = await import("@/lib/geo/direccion-ia/servidor");
const { corregirDirecciones, zonaDelDia, aplicarCorreccion } = await import("@/lib/encomiendas/local/corregir-direcciones");
const { ubicarCarga } = await import("@/lib/encomiendas/local/ubicar-carga");
const { estadoUbicacion, etiquetasDelPedido, problemasDelPedido } = await import("@/lib/encomiendas/problemas");
const { sectorDe } = await import("@/lib/geo/sectores-arica");
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

// Calles reales con números inventados.
const PUERTA = {
  id: "google:x1",
  direccion: "Avenida Santa María 2150",
  detalle: "Arica",
  lat: -18.4721,
  lng: -70.2903,
  soloCalle: false,
  confianza: "exacta",
  coincideNumero: true,
  fuente: "google",
};
const CUADRA = { ...PUERTA, id: "google:x2", direccion: "Avenida Santa María 2160", lat: -18.4725, confianza: "aproximada" };
const CALLE = { ...PUERTA, id: "osm-x3", direccion: "Avenida Santa María", lat: -18.47, lng: -70.29, soloCalle: true, confianza: "aproximada", coincideNumero: null, fuente: "osm" };
const entrada = (escrita, candidatos = [PUERTA], calles = []) => ({ escrita, candidatos, calles });

/** La IA de mentira: `decidir(lote)` devuelve los resultados; guarda cada lote que recibe. */
function iaFalsa(decidir) {
  const lotes = [];
  return {
    lotes,
    pedir: async (lote) => {
      assert.ok(loteValido(lote), "el servidor no aceptaría este lote");
      lotes.push(structuredClone(lote));
      const r = decidir(lote, lotes.length);
      if (r instanceof Error) throw r;
      return { resultados: r };
    },
  };
}
const elegir = (direccion, candidato, confianza = "alta") => ({
  direccion,
  candidato,
  confianza,
  direccion_corregida: "Avenida Santa María 2150",
  buscar: null,
  motivo: "m",
});

// ---------------------------------------------------------------- el lote
test("armarLote: ids por dirección y por candidato, el punto con 4 decimales y nada de personas", () => {
  const muchos = Array.from({ length: CANDIDATOS_POR_DIRECCION + 3 }, (_, k) => ({ ...PUERTA, id: `g${k}`, lat: PUERTA.lat + k / 1000 }));
  const { lote, candidatosDe } = armarLote(
    [entrada("AV STA MARIA 2150", [PUERTA, PUERTA, CALLE]), entrada("PJE INVENTADO 901", muchos, [{ nombre: "Pasaje Inventado", largo: 120 }])],
    1,
    [{ sector: "Centro", pedidos: 4 }],
  );
  assert.ok(loteValido(lote));
  assert.deepEqual(lote.direcciones.map((d) => d.id), ["d1", "d2"]);
  assert.deepEqual(lote.direcciones[0].candidatos.map((c) => c.id), ["d1c1", "d1c2"], "el repetido va una vez");
  assert.equal(lote.direcciones[1].candidatos.length, CANDIDATOS_POR_DIRECCION);
  assert.equal(lote.direcciones[0].candidatos[0].punto, "-18.4721,-70.2903");
  assert.equal("lat" in lote.direcciones[0].candidatos[0], false, "a la IA no le van las coordenadas completas");
  assert.equal(candidatosDe.get("d1").get("d1c1").lat, PUERTA.lat, "la app guarda el punto exacto para aplicar");
  assert.deepEqual(Object.keys(lote.direcciones[0]).sort(), ["calles_parecidas", "candidatos", "escrita", "id"]);
});

test("armarLote: cada candidato lleva su sector; los lugares de una calle repetida, sus cruces y si calzan con la guía", () => {
  const lugar = { ...CALLE, sector: "Norte", poblacion: "Pob. X", calza: true, cruces: ["Providencia", "Calle Tres", "Isla Molino", "Otra"] };
  const { lote } = armarLote([entrada("CALLE 2 977", [PUERTA, lugar])], 1, []);
  const [puerta, enLugar] = lote.direcciones[0].candidatos;
  assert.equal(puerta.sector, sectorDe(PUERTA));
  assert.equal("cruces" in puerta, false, "una puerta común no trae cruces");
  assert.deepEqual(enLugar.cruces, ["Providencia", "Calle Tres", "Isla Molino"]);
  assert.equal(enLugar.calza_con_la_guia, true);
  assert.ok(loteValido(lote));
});

test("los ejemplos de las instrucciones siguen el contrato: lotes válidos, respuestas con su forma y candidatos de su dirección", () => {
  const lineas = SISTEMA.split("\n");
  let ronda = null;
  let lote = null;
  let respuestas = 0;
  for (const linea of lineas) {
    const r = /^Ronda (\d)\. Ciudad: Arica, Chile\.$/.exec(linea);
    if (r) ronda = Number(r[1]);
    else if (linea.startsWith("{")) {
      lote = { ronda, ...JSON.parse(linea) };
      assert.ok(loteValido(lote), `el ejemplo no es un lote válido: ${linea.slice(0, 80)}`);
      for (const d of lote.direcciones) {
        for (const c of d.candidatos) {
          const [lat, lng] = c.punto.split(",").map(Number);
          assert.equal(c.sector, sectorDe({ lat, lng }), `sector de ${c.id} en el ejemplo`);
        }
      }
    } else if (linea.startsWith("[")) {
      const resultados = JSON.parse(linea);
      assert.deepEqual(resultadosDe({ resultados }), resultados, "la respuesta del ejemplo no tiene la forma del contrato");
      assert.deepEqual(resultados.map((x) => x.direccion), lote.direcciones.map((d) => d.id), "una respuesta por dirección, en orden");
      for (const x of resultados) {
        const d = lote.direcciones.find((y) => y.id === x.direccion);
        if (x.candidato) assert.ok(d.candidatos.some((c) => c.id === x.candidato), `${x.candidato} no es de ${d.id}`);
        if (lote.ronda === 2) assert.equal(x.buscar, null, "en la ronda 2 no se pide buscar");
      }
      respuestas++;
    }
  }
  assert.ok(respuestas >= 5, `solo ${respuestas} ejemplos`);
  assert.doesNotMatch(SISTEMA, /\+?569\d{8}|\d{1,2}\.\d{3}\.\d{3}-[\dkK]/, "un teléfono o un RUT en las instrucciones");
});

test("loteValido: forma, tamaños y que cada candidato sea de su dirección", () => {
  const { lote } = armarLote([entrada("AV STA MARIA 2150")], 1, []);
  assert.equal(loteValido(lote), true);
  const ajeno = structuredClone(lote);
  ajeno.direcciones[0].candidatos[0].id = "d2c1";
  assert.equal(loteValido(ajeno), false, "un candidato con id de otra dirección");
  assert.equal(loteValido({ ...lote, ronda: 3 }), false);
  assert.equal(loteValido({ ...lote, direcciones: [] }), false);
  const vacia = structuredClone(lote);
  vacia.direcciones[0].escrita = "  ";
  assert.equal(loteValido(vacia), false);
  const demasiadas = armarLote(Array.from({ length: LOTE_MAXIMO + 1 }, (_, i) => entrada(`CALLE ${900 + i}`)), 1, []).lote;
  assert.equal(loteValido(demasiadas), false, `más de ${LOTE_MAXIMO} direcciones en una llamada`);
});

test("resultadosDe (servidor): bota lo que no tiene la forma del contrato", () => {
  const r = resultadosDe({
    resultados: [
      { direccion: "d1", candidato: "d1c1", confianza: "alta", direccion_corregida: " Av. 1 ", buscar: null, motivo: "m" },
      { direccion: "d2", candidato: "", confianza: "segura", direccion_corregida: 3, buscar: "  Calle 2 901 ", motivo: "" },
      { candidato: "d3c1" },
      "basura",
    ],
  });
  assert.deepEqual(r, [
    { direccion: "d1", candidato: "d1c1", confianza: "alta", direccion_corregida: "Av. 1", buscar: null, motivo: "m" },
    { direccion: "d2", candidato: null, confianza: "baja", direccion_corregida: "", buscar: "Calle 2 901", motivo: "Sin explicación." },
  ]);
  assert.deepEqual(resultadosDe(null), []);
});

// ---------------------------------------------------------------- las rondas
test("corregirEnLote: una sola llamada para todas; el punto es del buscador y la confianza no supera al candidato", async () => {
  const ia = iaFalsa(() => [elegir("d1", "d1c1"), elegir("d2", "d2c1"), { ...elegir("d3", null), confianza: "baja" }]);
  const r = await corregirEnLote(
    [entrada("AV STA MARIA 2150"), entrada("AV STA MARIA 2160", [CUADRA]), entrada("POB LA CHIMBA", [])],
    { zona: [] },
    { pedir: ia.pedir },
  );
  assert.equal(ia.lotes.length, 1, "una llamada para las tres");
  assert.equal(r[0].tipo, "propuesta");
  assert.deepEqual([r[0].candidato.lat, r[0].candidato.lng], [PUERTA.lat, PUERTA.lng]);
  assert.equal(r[0].confianza, "alta");
  assert.equal(r[1].confianza, "media", "una cuadra no es la puerta");
  assert.equal(r[2].tipo, "sin_arreglo");
});

test("corregirEnLote: un candidato de OTRA dirección no sirve (la IA no mezcla direcciones)", async () => {
  const ia = iaFalsa(() => [elegir("d1", "d2c1"), elegir("d2", "d2c1")]);
  const r = await corregirEnLote([entrada("A 1"), entrada("B 2")], { zona: [] }, { pedir: ia.pedir });
  assert.equal(r[0].tipo, "sin_arreglo");
  assert.equal(r[1].tipo, "propuesta");
});

test("corregirEnLote: lo que pide buscar va en una ronda 2, solo con esas, y no hay ronda 3", async () => {
  const buscadas = [];
  const ia = iaFalsa((lote, n) =>
    n === 1
      ? [elegir("d1", "d1c1"), { ...elegir("d2", null), buscar: "Avenida Santa María 2150" }, { ...elegir("d3", null), buscar: "Otra 1" }]
      : [elegir("d1", "d1c1"), { ...elegir("d2", null), buscar: "de nuevo" }],
  );
  const r = await corregirEnLote([entrada("A 1"), entrada("STA MARIA 2150", [CALLE]), entrada("X 9", [])], { zona: [] }, {
    pedir: ia.pedir,
    buscar: async (q) => (buscadas.push(q), q.startsWith("Avenida") ? [PUERTA] : []),
  });
  assert.deepEqual(buscadas, ["Avenida Santa María 2150", "Otra 1"]);
  assert.equal(ia.lotes.length, 2);
  assert.equal(ia.lotes[1].ronda, 2);
  assert.equal(ia.lotes[1].direcciones.length, 2, "la ronda 2 lleva solo las que pidieron buscar");
  assert.equal(ia.lotes[1].direcciones[0].candidatos[0].direccion, PUERTA.direccion, "lo buscado va primero");
  assert.equal(r[1].tipo, "propuesta");
  assert.equal(r[1].candidato.lat, PUERTA.lat);
  assert.equal(r[2].tipo, "sin_arreglo", "en la ronda 2 pedir buscar otra vez no sirve");
});

test("corregirEnLote: un error en la ronda 1 sale entero; en la ronda 2 deja como error solo las que faltaban", async () => {
  await assert.rejects(() => corregirEnLote([entrada("A 1")], { zona: [] }, { pedir: iaFalsa(() => new Error("sin red")).pedir }));
  await assert.rejects(() => corregirEnLote([entrada("A 1")], { zona: [] }, { pedir: iaFalsa(() => new IANoDisponible()).pedir }), IANoDisponible);
  const ia = iaFalsa((lote, n) => (n === 1 ? [elegir("d1", "d1c1"), { ...elegir("d2", null), buscar: "B 2" }] : new Error("sin red")));
  const r = await corregirEnLote([entrada("A 1"), entrada("B 2", [])], { zona: [] }, { pedir: ia.pedir, buscar: async () => [PUERTA] });
  assert.equal(r[0].tipo, "propuesta");
  assert.equal(r[1].tipo, "error");
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
      for (const fila of todo) borrar(store, CLAVE[store]?.(fila) ?? fila.id ?? fila.fecha);
    });
  }
});
const leer = async (id) => (await almacen.leerPedidos(HOY)).find((p) => p.id === id);
const pedido = (direccion, punto = null) =>
  almacen.guardarPedido({ nombre: "Cliente", telefono: "+56912345678", direccion, lat: punto?.lat ?? null, lng: punto?.lng ?? null, notas: null }, HOY);

/** La IA de corregirDirecciones: una función por llamada con la lista de direcciones. */
function porLlamada(responder) {
  const llamadas = [];
  return {
    llamadas,
    corregir: async (direcciones, contexto) => {
      llamadas.push({ direcciones: [...direcciones], contexto });
      return responder(direcciones, llamadas.length);
    },
  };
}
const sinArreglo = (ds) => ds.map(() => ({ tipo: "sin_arreglo", motivo: "m" }));

test("corregirDirecciones: más de LOTE_MAXIMO van en varias llamadas y el mismo destino se pregunta una vez", async () => {
  for (let i = 0; i < LOTE_MAXIMO + 1; i++) await pedido(`CALLE INVENTADA ${900 + i}`);
  await pedido("CALLE INVENTADA 900");
  const ia = porLlamada(sinArreglo);
  const r = await corregirDirecciones(HOY, { corregir: ia.corregir, enLinea: () => true });
  assert.equal(ia.llamadas.length, 2);
  assert.equal(ia.llamadas[0].direcciones.length, LOTE_MAXIMO);
  assert.equal(new Set(ia.llamadas.flatMap((l) => l.direcciones)).size, LOTE_MAXIMO + 1, "el destino repetido una vez");
  assert.equal(r.sinArreglo, LOTE_MAXIMO + 2, "cada pedido cuenta");
});

test("corregirDirecciones: sin conexión el lote y los que siguen quedan «sin señal»; un 429 se reintenta una vez", async () => {
  for (let i = 0; i < LOTE_MAXIMO + 2; i++) await pedido(`CALLE INVENTADA ${900 + i}`);
  const caida = porLlamada(() => {
    throw new Error("sin red");
  });
  const r = await corregirDirecciones(HOY, { corregir: caida.corregir, enLinea: () => true });
  assert.equal(caida.llamadas.length, 1, "no sigue con el lote siguiente");
  assert.equal(r.sinSenal, LOTE_MAXIMO + 2);
  assert.equal(r.sinArreglo, 0);

  const ocupada = porLlamada((ds, n) => {
    if (n === 1) throw new IAOcupada("ocupada");
    return sinArreglo(ds);
  });
  const r2 = await corregirDirecciones(HOY, { corregir: ocupada.corregir, enLinea: () => true });
  assert.equal(ocupada.llamadas.length, 3, "el primer lote dos veces, el segundo una");
  assert.equal(r2.sinSenal, 0);
});

test("corregirDirecciones: sin IA en el servidor no sigue; sin red ni siquiera pregunta", async () => {
  for (let i = 0; i < LOTE_MAXIMO + 2; i++) await pedido(`CALLE INVENTADA ${900 + i}`);
  const sinIA = porLlamada(() => {
    throw new IANoDisponible();
  });
  const r = await corregirDirecciones(HOY, { corregir: sinIA.corregir, enLinea: () => true });
  assert.equal(r.sinIA, true);
  assert.equal(sinIA.llamadas.length, 1);

  const nada = porLlamada(sinArreglo);
  const r2 = await corregirDirecciones(HOY, { corregir: nada.corregir, enLinea: () => false });
  assert.equal(nada.llamadas.length, 0);
  assert.equal(r2.sinSenal, LOTE_MAXIMO + 2);
});

test("corregirDirecciones sin ids (spec 040): van la calle repetida y la cuadra marcada; la puerta no", async () => {
  const repetida = await pedido("PASAJE 1 905", { lat: -18.43, lng: -70.29 });
  await almacen.ubicarConDuda([{ id: repetida.id, punto: { lat: -18.43, lng: -70.29 }, problema: { tipo: "calle_repetida", opciones: [{ direccion: "Pasaje 1", detalle: null, lat: -18.43, lng: -70.29 }] } }]);
  const cuadra = await pedido("DIEGO PORTALES 905");
  await almacen.fijarCoordenadas([{ id: cuadra.id, lat: -18.48, lng: -70.3, aproximada: true }]);
  await pedido("CALLE REAL 901", { lat: -18.47, lng: -70.3 });
  const ia = porLlamada(sinArreglo);
  await corregirDirecciones(HOY, { corregir: ia.corregir, enLinea: () => true });
  assert.deepEqual(ia.llamadas[0].direcciones.sort(), ["DIEGO PORTALES 905", "PASAJE 1 905"]);
});

test("zonaDelDia: cuántos pedidos ubicados hay por sector, sin los del lote ni datos de personas", async () => {
  const a = await pedido("A 901", { lat: -18.4783, lng: -70.3126 });
  const b = await pedido("B 902", { lat: -18.4785, lng: -70.3128 });
  const c = await pedido("C 903", { lat: -18.43, lng: -70.29 });
  await pedido("D 904");
  const pedidos = await almacen.leerPedidos(HOY);
  const zona = zonaDelDia(pedidos, new Set([c.id]));
  const esperado = new Map();
  for (const p of [a, b]) esperado.set(sectorDe(p), (esperado.get(sectorDe(p)) ?? 0) + 1);
  assert.deepEqual(zona, [...esperado].map(([sector, n]) => ({ sector, pedidos: n })));
  assert.ok(zona.every((z) => Object.keys(z).sort().join() === "pedidos,sector"));
});

test("la IA de corregirDirecciones recibe solo las direcciones y la zona", async () => {
  await pedido("PASAJE INVENTADO 901");
  const ia = porLlamada(sinArreglo);
  await corregirDirecciones(HOY, { corregir: ia.corregir, enLinea: () => true });
  const { direcciones, contexto } = ia.llamadas[0];
  assert.deepEqual(direcciones, ["PASAJE INVENTADO 901"]);
  assert.doesNotMatch(JSON.stringify({ direcciones, zona: contexto.zona }), /Cliente|912345678/);
});

// ------------------------------------------------------- la marca «aproximada»
test("la carga marca «aproximada» lo que no es la puerta (y lo manda a la IA); la puerta no", async () => {
  const puerta = await pedido("AV SANTA MARIA 2150");
  const cuadra = await pedido("AV SANTA MARIA 2160");
  const ubicar = async (d) =>
    d.endsWith("2150")
      ? { tipo: "exacta", candidatos: [PUERTA], elegida: PUERTA, advertencia: null }
      : { tipo: "aproximada", candidatos: [CUADRA], elegida: CUADRA, advertencia: "cuadra" };
  const r = await ubicarCarga([puerta, cuadra], { ubicar, enLinea: () => true });
  assert.deepEqual(r.dudosos, [cuadra.id]);
  const [p1, p2] = await Promise.all([leer(puerta.id), leer(cuadra.id)]);
  assert.equal(p1.aproximada, undefined);
  assert.equal(p2.aproximada, true);
});

test("la marca: confirmar una propuesta en la cuadra la pone; cambiar la dirección o el punto la quita; mover al acceso la conserva", async () => {
  const p = await pedido("AV SANTA MARIA 2160");
  const propuesta = {
    pedidoId: p.id,
    nombre: "Cliente",
    telefono: "",
    original: p.direccion,
    direccion: CUADRA.direccion,
    lat: CUADRA.lat,
    lng: CUADRA.lng,
    enLaCuadra: true,
    soloCalle: false,
    segura: true,
    motivo: "m",
  };
  await aplicarCorreccion(propuesta);
  assert.equal((await leer(p.id)).aproximada, true);
  await almacen.fijarCoordenadas([{ id: p.id, lat: CUADRA.lat + 0.0001, lng: CUADRA.lng }]);
  assert.equal((await leer(p.id)).aproximada, true, "mover el punto a la calle de acceso no la cambia");
  const ahora = await leer(p.id);
  await almacen.guardarPedido({ ...ahora, lat: -18.47, lng: -70.3 }, HOY, p.id);
  assert.equal((await leer(p.id)).aproximada, undefined, "el conductor eligió el punto");
  await almacen.fijarCoordenadas([{ id: p.id, lat: -18.47, lng: -70.3, aproximada: true }]);
  await almacen.cambiarDireccion(p.id, "Otra 1", { lat: -18.46, lng: -70.3 });
  assert.equal((await leer(p.id)).aproximada, undefined);
});

// ------------------------------------------------------------ los tres estados
test("estadoUbicacion: Ubicada, Aproximada o Sin ubicar", () => {
  const base = { lat: -18.47, lng: -70.3, problemas: [] };
  assert.equal(estadoUbicacion({ ...base, lat: null }), "sin_ubicar");
  assert.equal(estadoUbicacion(base), "ubicada");
  assert.equal(estadoUbicacion({ ...base, aproximada: true }), "aproximada");
  assert.equal(estadoUbicacion({ ...base, problemas: [{ tipo: "calle_repetida", opciones: [] }] }), "aproximada");
  assert.equal(estadoUbicacion({ ...base, problemas: [{ tipo: "solo_calle", opciones: [] }] }), "aproximada");
  assert.equal(estadoUbicacion({ ...base, problemas: [{ tipo: "lejana", texto: "x" }] }), "ubicada");
});

test("etiquetasDelPedido: «Aproximada» en la lista, pero la cuadra no es un ⚠ (no va a «Por resolver»)", () => {
  const base = { lat: -18.47, lng: -70.3, of: "1", origenCarga: "guia_pegada", problemas: [] };
  const cuadra = { ...base, aproximada: true };
  assert.deepEqual(etiquetasDelPedido(cuadra).map((e) => e.texto), ["Aproximada"]);
  assert.deepEqual(problemasDelPedido(cuadra), []);
  const repetida = { ...base, problemas: [{ tipo: "calle_repetida", opciones: [{ direccion: "Pasaje 1", detalle: null, lat: 0, lng: 0 }] }] };
  assert.deepEqual(etiquetasDelPedido(repetida).map((e) => e.texto), ["Aproximada"], "una sola vez");
  assert.equal(problemasDelPedido(repetida).length, 1, "la calle repetida sigue pidiendo que se elija");
  assert.deepEqual(etiquetasDelPedido({ ...base, lat: null }).map((e) => e.texto), ["Sin ubicar"]);
  assert.deepEqual(etiquetasDelPedido(base), []);
});
