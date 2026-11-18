// Spec 038 (tiempos): la IA corrige varias direcciones a la vez sin cambiar lo que propone.
//
// Las pruebas «dorada:» fijan lo que hacía la corrección en serie, antes de la 038: las
// propuestas, su orden, los conteos y lo que se le preguntó a la IA, con un `pedir` de guion
// (como direccion-ia.test.mjs) y demoras distintas por dirección para que, a varias a la vez,
// terminen en otro orden. Sus valores salen de correr ESTE archivo sobre el código de antes
// (ARES_038_GENERAR=1 y --test-name-pattern=dorada, en una copia del árbol anterior a la 038) y
// viven en fixtures/038-ia.json. Direcciones inventadas.
//
// Las demás fijan lo nuevo de la 038: cuántas van a la vez, el 429, la señal y los repetidos.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const { conversacionValida } = await import("@/lib/geo/direccion-ia/contrato");
const cliente = await import("@/lib/geo/direccion-ia/cliente");
const { corregirConIA, IANoDisponible } = cliente;
const { corregirDirecciones } = await import("@/lib/encomiendas/local/corregir-direcciones");
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");

const HOY = "2026-11-17";
const FIXTURE = new URL("./fixtures/038-ia.json", import.meta.url);
const GENERAR = process.env.ARES_038_GENERAR === "1";
const doradas = GENERAR ? {} : JSON.parse(readFileSync(FIXTURE, "utf8"));
test.after(() => {
  if (GENERAR) writeFileSync(FIXTURE, JSON.stringify(doradas, null, 2) + "\n");
});
function comparar(nombre, valor) {
  if (GENERAR) doradas[nombre] = valor;
  else assert.deepEqual(valor, doradas[nombre], `«${nombre}» cambió respecto de la corrección en serie`);
}

const CLAVE = { [idb.STORES.pedidos]: (f) => f.id, [idb.STORES.rutas]: (f) => f.fecha, [idb.STORES.cola]: (f) => f.id };
test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, (CLAVE[store] ?? ((x) => x.id ?? x.fecha ?? x.pedidoId))(fila));
    });
  }
});

const esperar = (ms) => new Promise((listo) => setTimeout(listo, ms));

/** Los pedidos, en el orden de `direcciones`: el id es un UUIDv7 y lleva el milisegundo, así que
 *  se separan para que el orden de la base sea el de la lista. */
async function crear(direcciones) {
  const creados = [];
  for (const [i, d] of direcciones.entries()) {
    const texto = typeof d === "string" ? d : d.texto;
    const punto = typeof d === "string" ? null : d.punto;
    creados.push(
      await almacen.guardarPedido(
        { nombre: `Cliente ${i + 1}`, telefono: "+56912345678", direccion: texto, lat: punto?.lat ?? null, lng: punto?.lng ?? null, notas: null },
        HOY,
      ),
    );
    await esperar(3);
  }
  return creados;
}

// ------------------------------------------------------------ buscadores y la IA de guion
const lugar = (direccion, lat, lng, extra = {}) => ({
  direccion,
  detalle: "Arica",
  lat,
  lng,
  soloCalle: false,
  confianza: "exacta",
  coincideNumero: true,
  fuente: "google",
  ...extra,
});
const BUSCADOR = {
  "Avenida Santa María 2150": [lugar("Avenida Santa María 2150", -18.4721, -70.2903)],
  "Pasaje 3 1200": [lugar("Pasaje 3 1200", -18.4901, -70.2952, { confianza: "aproximada", coincideNumero: null, fuente: "osm" })],
  "La Chimba": [lugar("La Chimba", -18.4402, -70.2811, { confianza: "baja", coincideNumero: null, fuente: "osm" })],
  "Calle 2 903": [lugar("Calle 2 903", -18.45, -70.28)],
  "18 de Septiembre 905": [lugar("18 de Septiembre", -18.4789, -70.3101, { confianza: "aproximada", coincideNumero: null, soloCalle: true, fuente: "osm" })],
};
const buscar = async (q) => (await esperar(2), BUSCADOR[q] ?? []);
const calles = async () => [{ nombre: "Avenida Santa María", largo: 3400 }];

const usar = (id, name, input) => ({ type: "tool_use", id, name, input });
const texto = (t) => ({ type: "text", text: t });
const proponer = (id, candidato, direccion, confianza, motivo) => usar(id, "proponer", { candidato, direccion, confianza, motivo });

/** Cada dirección (recortada y en minúsculas) con sus idas: demora y respuesta, o un error. */
const GUION = {
  "av sta maria 2150": [
    { ms: 40, contenido: [usar("t1", "calles_parecidas", { nombre: "STA MARIA" })] },
    { ms: 40, contenido: [usar("t2", "buscar_direccion", { consulta: "Avenida Santa María 2150" })] },
    { ms: 40, contenido: [proponer("t3", "c1", "Avenida Santa María 2150", "alta", "Faltaba Avenida.")] },
  ],
  "pje 3 casa 12": [
    { ms: 5, contenido: [usar("t1", "buscar_direccion", { consulta: "Pasaje 3 1200" })] },
    { ms: 5, contenido: [proponer("t2", "c1", "Pasaje 3 1200", "media", "La cuadra, no la puerta.")] },
  ],
  "pob la chimba": [
    { ms: 10, contenido: [usar("t1", "buscar_direccion", { consulta: "La Chimba" })] },
    { ms: 5, contenido: [proponer("t2", "c1", "La Chimba", "baja", "Solo el barrio.")] },
  ],
  "calle inventada 901": [{ ms: 15, contenido: [texto("No sé dónde queda.")] }],
  "linderos calle 2 903": [
    { ms: 5, contenido: [usar("t1", "buscar_direccion", { consulta: "Calle 2 903" })] },
    { ms: 5, contenido: [proponer("t2", "c1", "Calle 2 903", "alta", "La calle que lleva el número.")] },
  ],
  "avenida inventada 904": [{ ms: 5, error: "sin señal" }],
  "18 de septiembre 905": [
    { ms: 5, contenido: [usar("t1", "buscar_direccion", { consulta: "18 de Septiembre 905" })] },
    { ms: 20, contenido: [proponer("t2", "c1", "18 de Septiembre 905", "media", "Solo la calle.")] },
  ],
  "pasaje 1 906": [{ ms: 5, contenido: [proponer("t1", "c9", "Pasaje 1 906", "alta", "Inventado.")] }],
};

/** La IA de mentira: contesta según la dirección de la conversación y la ida en que va, y anota
 *  cuántas conversaciones hay a la vez. `intento` cuenta las veces que se empezó una dirección. */
function iaDeGuion(guion = GUION, { alPedir } = {}) {
  const porDireccion = {};
  const intentos = {};
  const registro = { idas: 0, enVuelo: 0, maxEnVuelo: 0, porDireccion };
  registro.pedir = async (mensajes) => {
    assert.ok(conversacionValida(mensajes), "la conversación no la aceptaría el servidor");
    const escrita = /«([\s\S]*)»/.exec(mensajes[0].content)[1];
    const clave = escrita.trim().toLowerCase();
    const ida = (mensajes.length - 1) / 2;
    if (ida === 0) intentos[clave] = (intentos[clave] ?? 0) + 1;
    (porDireccion[clave] ??= []).push(structuredClone(mensajes));
    registro.idas++;
    registro.enVuelo++;
    registro.maxEnVuelo = Math.max(registro.maxEnVuelo, registro.enVuelo);
    try {
      alPedir?.(clave, ida, intentos[clave], registro);
      const pasos = typeof guion[clave] === "function" ? guion[clave](intentos[clave]) : guion[clave];
      const paso = pasos?.[ida];
      if (!paso) throw new Error(`sin guion para «${clave}» en la ida ${ida}`);
      await (paso.nunca ? new Promise(() => {}) : esperar(paso.ms));
      paso.alContestar?.();
      if (paso.error instanceof Error) throw paso.error;
      if (paso.error) throw new Error(paso.error);
      return { contenido: paso.contenido, fin: "tool_use" };
    } finally {
      registro.enVuelo--;
    }
  };
  return registro;
}

/** Corre la tanda con la IA de guion y devuelve todo lo observable, con los pedidos por su
 *  posición (los ids cambian en cada corrida). */
async function correr(direcciones, guion, opciones = {}) {
  const creados = await crear(direcciones);
  const posicion = new Map(creados.map((p, i) => [p.id, i]));
  const ia = iaDeGuion(guion, opciones);
  const avance = [];
  const r = await corregirDirecciones(HOY, {
    ids: creados.map((p) => p.id),
    corregir: (d, o) => corregirConIA(d, { pedir: ia.pedir, buscar, calles, ...(o ?? {}) }),
    alAvanzar: (hechos, total) => avance.push([hechos, total]),
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
  const guardados = (await almacen.leerPedidos(HOY))
    .filter((p) => p.propuestaIA)
    .map((p) => ({ pedido: posicion.get(p.id), ...p.propuestaIA }))
    .sort((a, b) => a.pedido - b.pedido);
  const resumen = {
    propuestas: r.propuestas.map(({ pedidoId, ...resto }) => ({ pedido: posicion.get(pedidoId), ...resto })),
    sinArreglo: r.sinArreglo,
    sinIA: r.sinIA,
    sinSenal: r.sinSenal,
    guardados,
  };
  // Lo que se le preguntó a la IA: la última conversación de cada dirección trae todas sus idas.
  const preguntas = Object.fromEntries(
    Object.entries(ia.porDireccion)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clave, idas]) => [clave, { idas: idas.length, ultima: idas.at(-1) }]),
  );
  return { resumen, preguntas, idas: ia.idas, avance, ia };
}

const MEZCLA = [
  "AV STA MARIA 2150",
  "PJE 3 CASA 12",
  "POB LA CHIMBA",
  "CALLE INVENTADA 901",
  { texto: "LINDEROS CALLE 2 903", punto: { lat: -18.45001, lng: -70.28001 } },
  "AVENIDA INVENTADA 904",
  "18 DE SEPTIEMBRE 905",
  "PASAJE 1 906",
];

// ------------------------------------------------------------ doradas (antes = después)
test("dorada: una tanda mezclada da las mismas propuestas, en el mismo orden, con las mismas preguntas", async () => {
  const { resumen, preguntas, idas, avance } = await correr(MEZCLA, GUION);
  comparar("mezcla.resumen", resumen);
  comparar("mezcla.preguntas", preguntas);
  comparar("mezcla.idas", idas);
  comparar("mezcla.avance", avance);
});

test("dorada: un error al principio no para, y lo demás se pregunta igual", async () => {
  const guion = { ...GUION, "avenida inventada 904": [{ ms: 5, error: "sin señal" }] };
  const { resumen, preguntas, idas } = await correr(["AVENIDA INVENTADA 904", "PJE 3 CASA 12", "AV STA MARIA 2150", "POB LA CHIMBA"], guion);
  comparar("errorPrimero.resumen", resumen);
  comparar("errorPrimero.preguntas", preguntas);
  comparar("errorPrimero.idas", idas);
});

test("dorada: dos errores seguidos paran a las 2 preguntas y el resto queda «sin conexión»", async () => {
  const caida = [{ ms: 5, error: "sin señal" }];
  const guion = { "pasaje inventado 1": caida, "pasaje inventado 2": caida, "pasaje inventado 3": caida, "pasaje inventado 4": caida };
  const { resumen, idas } = await correr(["PASAJE INVENTADO 1", "PASAJE INVENTADO 2", "PASAJE INVENTADO 3", "PASAJE INVENTADO 4"], guion);
  comparar("dosErrores.resumen", resumen);
  comparar("dosErrores.idas", idas);
});

test("dorada: sin IA en el servidor se pregunta una sola vez", async () => {
  const sinIA = [{ ms: 5, error: new IANoDisponible() }];
  const guion = { "pasaje inventado 1": sinIA, "pasaje inventado 2": sinIA, "pasaje inventado 3": sinIA };
  const { resumen, idas } = await correr(["PASAJE INVENTADO 1", "PASAJE INVENTADO 2", "PASAJE INVENTADO 3"], guion);
  comparar("sinIA.resumen", resumen);
  comparar("sinIA.idas", idas);
});

const REPETIDOS = [
  "PJE 3 CASA 12",
  "AV STA MARIA 2150",
  // Mismo texto: uno ya está en el punto de la propuesta (no se muestra) y otro trae espacios y
  // otras mayúsculas (su propuesta guarda SU texto como original).
  { texto: "pje 3 casa 12", punto: { lat: -18.49011, lng: -70.29521 } },
  "Pje 3 Casa 12 ",
];

test("dorada: con el destino repetido, cada pedido queda con su propuesta, su original y su filtro de 60 m", async () => {
  const { resumen } = await correr(REPETIDOS, GUION);
  comparar("repetidos.resumen", resumen);
});

// ------------------------------------------------------------ lo nuevo de la 038
const { DIRECCIONES_A_LA_VEZ } = await import("@/lib/geo/direccion-ia/contrato");

/** La lista en el orden en que la tanda los pregunta (leerPedidos trae primero el último cargado). */
const enLaTanda = (lista) => [...lista].reverse();

test("a la vez: empieza de a una hasta la primera respuesta buena y después nunca pasa de DIRECCIONES_A_LA_VEZ", async () => {
  let activas = 0;
  let max = 0;
  const inicios = [];
  const creados = await crear(MEZCLA);
  const ia = iaDeGuion();
  await corregirDirecciones(HOY, {
    ids: creados.map((p) => p.id),
    corregir: async (d) => {
      inicios.push({ d, activas: ++activas });
      max = Math.max(max, activas);
      try {
        return await corregirConIA(d, { pedir: ia.pedir, buscar, calles });
      } finally {
        activas--;
      }
    },
  });
  assert.equal(DIRECCIONES_A_LA_VEZ, 2);
  assert.equal(max, DIRECCIONES_A_LA_VEZ);
  assert.equal(inicios[0].activas, 1);
  assert.equal(inicios[1].activas, 1, "la segunda empezó antes de que contestara la primera");
});

test("a la vez: dos errores no vecinos no paran aunque lleguen seguidos en el tiempo (como en serie)", async () => {
  const bien = (ms) => [{ ms, contenido: [texto("No sé.")] }];
  const mal = (ms) => [{ ms, error: "sin señal" }];
  const guion = {
    "pasaje inventado 1": bien(5),
    "pasaje inventado 2": mal(40),
    "pasaje inventado 3": bien(5),
    "pasaje inventado 4": mal(5),
    "pasaje inventado 5": bien(5),
  };
  const tanda = ["PASAJE INVENTADO 1", "PASAJE INVENTADO 2", "PASAJE INVENTADO 3", "PASAJE INVENTADO 4", "PASAJE INVENTADO 5"];
  const { resumen, preguntas } = await correr(enLaTanda(tanda), guion);
  assert.equal(resumen.sinSenal, 2);
  assert.equal(resumen.sinArreglo, 3, "se preguntaron todas, como en serie");
  assert.equal(Object.keys(preguntas).length, 5);
});

test("429: la tanda sigue de a una, la dirección se vuelve a preguntar sola y la propuesta es la misma", async () => {
  const despues = [];
  let hubo429 = false;
  const guion = {
    ...GUION,
    "pje 3 casa 12": (intento) =>
      intento === 1 ? [{ ms: 5, error: new cliente.IAOcupada("ocupada"), alContestar: () => (hubo429 = true) }] : GUION["pje 3 casa 12"],
  };
  // Lo que ya estaba en vuelo cuando llegó el 429 sigue; lo que empieza después va de a una.
  const { resumen, preguntas } = await correr(MEZCLA, guion, {
    alPedir: (clave, ida, intento, ia) => {
      if (hubo429) despues.push(ia.enVuelo);
    },
  });
  const sin429 = doradas["mezcla.resumen"];
  assert.deepEqual(resumen, sin429, "el 429 cambió las propuestas");
  assert.equal(preguntas["pje 3 casa 12"].idas, 3, "1 ida con 429 + las 2 de la conversación");
  assert.ok(despues.length > 0 && despues.every((n) => n === 1), `después del 429 hubo ${Math.max(...despues)} a la vez`);
});

test("429 dos veces: esa queda «sin conexión» (se puede volver a pedir) y las demás siguen", async () => {
  const guion = { ...GUION, "pje 3 casa 12": [{ ms: 5, error: new cliente.IAOcupada("ocupada") }] };
  const { resumen, preguntas } = await correr(MEZCLA, guion);
  assert.equal(preguntas["pje 3 casa 12"].idas, 2, "se reintenta una sola vez");
  const sin429 = doradas["mezcla.resumen"];
  assert.equal(resumen.sinSenal, sin429.sinSenal + 1);
  assert.deepEqual(
    resumen.propuestas.map((p) => p.pedido),
    sin429.propuestas.map((p) => p.pedido).filter((i) => i !== 1),
  );
});

test("corregirConIA: con la señal abortada no hace otra ida ni otra búsqueda (antes seguía hasta 6)", async () => {
  const control = new AbortController();
  let idas = 0;
  let busquedas = 0;
  const r = await corregirConIA("AV STA MARIA 2150", {
    senal: control.signal,
    pedir: async () => {
      idas++;
      control.abort();
      return { contenido: [usar("t1", "buscar_direccion", { consulta: "Avenida Santa María 2150" })], fin: "tool_use" };
    },
    buscar: async () => (busquedas++, []),
    calles,
  });
  assert.equal(r.tipo, "error");
  assert.equal(idas, 1);
  assert.equal(busquedas, 0);
});

test("«Detener»: corta sin esperar las que están en vuelo y ninguna conversación pide otra ida", async () => {
  const control = new AbortController();
  let idasDespues = 0;
  const creados = await crear(MEZCLA);
  // Una ida que no vuelve nunca (sin conexión): si la tanda la esperara, la prueba no termina.
  const colgada = { ms: 0, contenido: null };
  const guion = { ...GUION, "av sta maria 2150": [GUION["av sta maria 2150"][0], colgada] };
  const ia = iaDeGuion(guion, {
    alPedir: (clave, ida) => {
      if (control.signal.aborted) idasDespues++;
      if (clave === "av sta maria 2150" && ida === 1) {
        colgada.nunca = true;
        setTimeout(() => control.abort(), 5);
      }
    },
  });
  const r = await corregirDirecciones(HOY, {
    ids: creados.map((p) => p.id),
    senal: control.signal,
    corregir: (d, o) => corregirConIA(d, { pedir: ia.pedir, buscar, calles, ...(o ?? {}) }),
  });
  assert.ok(control.signal.aborted);
  await esperar(100);
  assert.equal(idasDespues, 0, "una conversación siguió después de detener");
  assert.ok(r.propuestas.length < doradas["mezcla.resumen"].propuestas.length);
});

test("repetidos: el mismo destino se pregunta una sola vez", async () => {
  const { resumen, preguntas, idas } = await correr(REPETIDOS, GUION);
  assert.deepEqual(resumen, doradas["repetidos.resumen"]);
  assert.equal(preguntas["pje 3 casa 12"].idas, 2, "una conversación para los tres pedidos");
  assert.equal(idas, 2 + 3, "antes eran 3 × 2 + 3");
});

test("repetidos: el error cuenta por consulta: dos pedidos del mismo destino caído no paran la tanda", async () => {
  const guion = {
    "pasaje inventado 1": [{ ms: 5, error: "sin señal" }],
    "pasaje inventado 2": [{ ms: 5, contenido: [texto("No sé.")] }],
  };
  const { resumen } = await correr(enLaTanda(["PASAJE INVENTADO 1", "pasaje inventado 1", "PASAJE INVENTADO 2"]), guion);
  assert.equal(resumen.sinSenal, 2, "los dos pedidos del destino caído se pueden volver a pedir");
  assert.equal(resumen.sinArreglo, 1, "y el siguiente sí se preguntó");
});
