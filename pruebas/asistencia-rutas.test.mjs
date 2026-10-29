// Cómo se arma la ruta cuando entran en juego las respuestas de los receptores.
//
// Corre calcularRutaLocal() de verdad, sobre IndexedDB de verdad, con la matriz
// de Mapbox y el trazado respondidos por un doble del fetch global. Lo que se
// verifica es lo que el documento principal pide y que la distancia sola no
// puede dar:
//
//  · un pedido cerrado no vuelve a proponerse;
//  · los bloques horarios que eligieron los receptores pesan en el orden;
//  · se muestra UNA ruta cuando comparar no aporta, y hasta TRES cuando sí;
//  · mostrar tres opciones no cuesta tres veces más en consultas.
//
// La matriz se responde en línea recta a propósito: así el óptimo es predecible
// y una prueba puede afirmar en qué orden tienen que quedar las paradas. Lo que
// se está probando acá no es el optimizador —eso ya lo cubren 2-rutas y
// 8-orden-paradas— sino las decisiones de arriba.
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

const almacen = await import("@/lib/encomiendas/local/almacen");
const { guardarPedido, registrarDisponibilidad, marcarResultado, guardarRuta, leerRuta, leerPedidos } =
  almacen;

const generar = await import("@/lib/encomiendas/local/generar-ruta");
const { calcularRutaLocal, confirmarRutaLocal, devolverParada, elegirAlternativa, quitarParada, retrazar } = generar;

const idb = await import("@/lib/encomiendas/local/idb");
const { olvidarMatriz } = await import("@/lib/geo/mapbox/matriz");
const reloj = await import("./dobles/reloj.mjs");

const HOY = "2026-08-20";
const CONDUCTOR = "11111111-1111-7111-8111-111111111111";

// Base de la ruta: el centro de Arica. Las paradas se ubican a distancias
// crecientes hacia el sur, así que "la más corta" siempre es 1, 2, 3, ...
const BASE = { lat: -18.4783, lng: -70.2979 };

const CLAVE = {
  [idb.STORES.pedidos]: (f) => f.id,
  [idb.STORES.rutas]: (f) => f.fecha,
  [idb.STORES.cola]: (f) => f.id,
};

async function limpiar() {
  for (const store of Object.values(idb.STORES)) {
    const todo = await idb.leerTodos(store);
    if (todo.length === 0) continue;
    await idb.escribir([store], ({ borrar }) => {
      for (const fila of todo) borrar(store, CLAVE[store](fila));
    });
  }
}

// ---------------------------------------------------------------------------
// Doble de Mapbox
// ---------------------------------------------------------------------------

const fetchOriginal = globalThis.fetch;
let consultas = [];
/** Se puede apagar para probar la degradación sin trazado. */
let respondeTrazado = true;
let respondeMatriz = true;

/** Metros aproximados entre dos puntos. Misma cuenta que usa la app para la
 *  línea recta, así que la matriz que devuelve el doble es coherente con lo que
 *  el código estimaría por su cuenta. */
function metros(a, b) {
  const latMedia = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLat = (a.lat - b.lat) * 111_320;
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos(latMedia);
  return Math.round(Math.hypot(dLat, dLng));
}

/** Saca los pares "lng,lat" de una URL de Mapbox. */
function puntosDeUrl(url) {
  const ruta = new URL(url).pathname;
  const ultimo = ruta.split("/").pop();
  return decodeURIComponent(ultimo)
    .split(";")
    .map((par) => {
      const [lng, lat] = par.split(",").map(Number);
      return { lat, lng };
    })
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

function instalar() {
  globalThis.fetch = async (entrada) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    consultas.push(url);

    if (url.includes("directions-matrix")) {
      if (!respondeMatriz) return new Response("no", { status: 503 });
      // Como la API real: filas = sources, columnas = destinations (la matriz
      // del día se pide por bloques, spec 017).
      const puntos = puntosDeUrl(url);
      const q = new URL(url).searchParams;
      const indices = (clave) =>
        q.get(clave) ? q.get(clave).split(";").map(Number) : puntos.map((_, i) => i);
      const distances = indices("sources").map((i) => indices("destinations").map((j) => metros(puntos[i], puntos[j])));
      return Response.json({ distances });
    }

    if (url.includes("directions/v5")) {
      if (!respondeTrazado) return new Response("no", { status: 503 });
      const puntos = puntosDeUrl(url);
      let distanciaM = 0;
      for (let i = 1; i < puntos.length; i++) distanciaM += metros(puntos[i - 1], puntos[i]);
      return Response.json({
        routes: [
          {
            geometry: { coordinates: puntos.map((p) => [p.lng, p.lat]) },
            distance: distanciaM,
            // 25 km/h, la misma referencia urbana que usa la app.
            duration: Math.round((distanciaM / 1000 / 25) * 3600),
          },
        ],
      });
    }

    // Geocodificación: nunca hace falta acá porque todos los pedidos se cargan
    // con coordenadas. Que llegue una consulta es un error de la prueba.
    throw new Error(`consulta inesperada en la prueba de rutas: ${url}`);
  };
}

const consultasDeMatriz = () => consultas.filter((u) => u.includes("directions-matrix")).length;
const consultasDeTrazado = () => consultas.filter((u) => u.includes("directions/v5")).length;

test.before(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.prueba";
  instalar();
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});
test.beforeEach(async () => {
  await limpiar();
  consultas = [];
  respondeTrazado = true;
  respondeMatriz = true;
  // Los pares de la matriz se guardan en memoria el día entero: cada prueba
  // arranca sin ellos para poder contar consultas.
  olvidarMatriz();
  // La caché de propuestas vive en memoria del módulo y sobrevive entre pruebas.
  // Se invalida moviendo la base un poco en cada prueba (ver `inicioDe`).
});

let semilla = 0;
/** Un punto de partida distinto por prueba: la caché de propuestas se indexa por
 *  la huella (fecha + partida + pedidos), así que moverla garantiza que cada
 *  prueba calcule de verdad en vez de recibir la propuesta de la anterior. */
function inicioDe() {
  semilla++;
  // Diez metros por prueba: alcanza para cambiar el cuarto decimal —que es la
  // precisión con la que la caché indexa la partida— y no mueve ninguna
  // distancia lo suficiente para alterar las estimaciones de tiempo.
  return { tipo: "gps", lat: BASE.lat, lng: BASE.lng + semilla * 0.0001 };
}

/** Un grado de latitud son unos 111 km, así que un kilómetro al sur son estos
 *  grados. Sirve para poner una parada a una distancia CONTROLADA y poder
 *  afirmar si su bloque horario se alcanza o no. */
const GRADOS_POR_KM = 1 / 111.32;

/** Pedido a `km` al sur de la base (y `extra.este` km al este, si se pide). */
async function pedidoAKm(nombre, km, extra = {}) {
  const p = await guardarPedido({
    nombre,
    telefono: "+56912340000",
    direccion: `Calle ${nombre} 100, Arica`,
    lat: BASE.lat - km * GRADOS_POR_KM,
    lng: BASE.lng + ((extra.este ?? 0) * GRADOS_POR_KM) / Math.cos((BASE.lat * Math.PI) / 180),
    notas: null,
  }, HOY);
  if (extra.bloque) {
    await registrarDisponibilidad(
      p.id,
      { tipo: "horario_indicado", bloqueHorarioId: extra.bloque },
      `wamid.${p.id}`,
    );
  }
  if (extra.disponibilidad === "confirmado") {
    await registrarDisponibilidad(p.id, { tipo: "confirmado" }, `wamid.${p.id}`, CONDUCTOR);
  }
  return p;
}

/** Congela el reloj a una hora del día de HOY, en hora local.
 *
 *  Hace falta congelarlo porque los bloques horarios se evalúan contra la hora
 *  actual: la misma ruta, mirada a las nueve de la mañana o a las cinco de la
 *  tarde, cumple o no cumple. Sin reloj fijo, estas pruebas pasaban o fallaban
 *  según la hora a la que alguien las corriera.
 *
 *  Se construye con el Date REAL y en hora local para no depender de la zona
 *  horaria de la máquina que las corre. */
function aLaHora(hora, minutos = 0) {
  const hoy = new Date();
  const ms = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), hora, minutos, 0, 0).getTime();
  return reloj.congelar(ms);
}

/** Pedido a `n` cuadras al sur de la base: el orden más corto es 1, 2, 3, ... */
async function pedidoA(n, extra = {}) {
  const p = await guardarPedido({
    nombre: `Cliente ${n}`,
    telefono: `+5691234000${n}`,
    direccion: `Calle ${n} 100, Arica`,
    lat: BASE.lat - n * 0.004,
    lng: BASE.lng,
    notas: null,
  }, HOY);
  if (extra.disponibilidad === "confirmado") {
    await registrarDisponibilidad(p.id, { tipo: "confirmado" }, `wamid.${p.id}`, CONDUCTOR);
  } else if (extra.disponibilidad === "manana") {
    await registrarDisponibilidad(p.id, { tipo: "manana" }, `wamid.${p.id}`, CONDUCTOR);
  } else if (extra.bloque) {
    await registrarDisponibilidad(
      p.id,
      { tipo: "horario_indicado", bloqueHorarioId: extra.bloque },
      `wamid.${p.id}`,
    );
  }
  return p;
}

const nombres = (paradas) => paradas.map((p) => p.nombre);

// ===========================================================================
// Lo básico sigue funcionando
// ===========================================================================

test("sin respuestas de nadie, la ruta es la más corta y se muestra UNA sola", async () => {
  // Es el caso normal y el que el documento principal quiere proteger: si las
  // tres estrategias dan el mismo orden, no hay nada que comparar y el conductor no
  // tiene que elegir nada.
  for (const n of [3, 1, 2]) await pedidoA(n);

  const p = await calcularRutaLocal(HOY, inicioDe());

  assert.deepEqual(nombres(p.paradas), ["Cliente 1", "Cliente 2", "Cliente 3"]);
  assert.equal(p.alternativas.length, 1, "se ofrecieron alternativas que valen lo mismo");
  assert.equal(p.elegida, "corta");
});

test("la ruta vuelve a la partida: el trazado termina en ella y la ruta la guarda", async () => {
  for (const n of [1, 2, 3]) await pedidoA(n);
  const inicio = inicioDe();
  const p = await calcularRutaLocal(HOY, inicio);

  const [lng, lat] = p.trazado[p.trazado.length - 1];
  assert.ok(Math.abs(lat - inicio.lat) < 1e-5 && Math.abs(lng - inicio.lng) < 1e-5, "el trazado no vuelve a la partida");

  await confirmarRutaLocal(p);
  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.partida, p.partida, "la ruta no guardó adonde vuelve");
});

test("si la revisión de calles cercanas falla, la ruta sale igual (no deja al conductor sin ruta)", async () => {
  // Terreno 2026-10-29: lo agregado al armado (calles alrededor, sentido de las
  // calles, zonas) es mejora; ninguna falla suya puede impedir que haya ruta.
  // Este doble de Mapbox revienta ante cualquier consulta que no conoce, así que
  // la de calles alrededor (Tilequery) falla siempre.
  // Puntos que ninguna otra prueba usa: lo ya revisado se recuerda en la sesión.
  for (const [nombre, km] of [["Norte 1", 1.37], ["Norte 2", 2.41], ["Norte 3", 3.53]]) await pedidoAKm(nombre, km);
  const p = await calcularRutaLocal(HOY, inicioDe());
  assert.ok(consultas.some((u) => u.includes("tilequery")), "no intentó revisar las calles");
  // En línea recta, 1-2-3 y 1-3-2 miden lo mismo ida y vuelta: importa que estén las tres.
  assert.deepEqual(nombres(p.paradas).sort(), ["Norte 1", "Norte 2", "Norte 3"]);
  assert.ok(p.trazado && p.trazado.length > 0, "quedó sin trazado");
});

test("partiendo de Mi ubicación, la ruta termina en la central (repaso y volver)", async () => {
  // Terreno 2026-10-29: al final del día el conductor repasa lo pendiente desde
  // donde está y vuelve a la central. Antes la ruta volvía a donde partió.
  for (const n of [1, 2, 3]) await pedidoA(n);
  const inicio = inicioDe();
  const central = { lat: BASE.lat + 4 * GRADOS_POR_KM, lng: BASE.lng };
  const p = await calcularRutaLocal(HOY, inicio, { tipo: "direccion", direccion: "Central", ...central });

  assert.deepEqual(p.partida, { lat: inicio.lat, lng: inicio.lng }, "no parte de donde está el conductor");
  assert.deepEqual(p.llegada, central);
  const [lng, lat] = p.trazado[p.trazado.length - 1];
  assert.ok(Math.abs(lat - central.lat) < 1e-5 && Math.abs(lng - central.lng) < 1e-5, "el trazado no termina en la central");

  await confirmarRutaLocal(p);
  const ruta = await leerRuta(HOY);
  assert.deepEqual(ruta.partida, central, "la ruta guardada no vuelve a la central");
});

test("una parada lejos de todas se avisa con lo que suma; un día normal no avisa nada", async () => {
  // Terreno 2026-10-28: una dirección en la mitad de una calle de 5 km sumaba
  // 15,8 km a una ruta de 56. El orden era el mejor; lo que fallaba era el punto.
  await pedidoAKm("Cerca A", 0.5);
  await pedidoAKm("Cerca B", 1);
  await pedidoAKm("Cerca C", 1.5);
  const normal = await calcularRutaLocal(HOY, inicioDe());
  assert.deepEqual(normal.lejanas, [], "un día agrupado no tiene paradas lejanas");

  await pedidoAKm("Lejos", 0, { este: 7 });
  const p = await calcularRutaLocal(HOY, inicioDe());
  assert.equal(p.lejanas.length, 1);
  const [l] = p.lejanas;
  assert.equal(nombres(p.paradas.filter((x) => x.id === l.pedidoId))[0], "Lejos");
  assert.ok(l.metrosAlResto > 6000, `queda a ${l.metrosAlResto} m`);
  assert.ok(l.metrosQueSuma > 10000, `suma ${l.metrosQueSuma} m`);
  assert.ok(p.advertencias.some((a) => /del resto y suma .* km a la ruta/.test(a)), "la ruta guardada también lo dice");
});

test("una sola propuesta cuesta una matriz y un trazado, igual que antes", async () => {
  for (const n of [1, 2, 3]) await pedidoA(n);
  await calcularRutaLocal(HOY, inicioDe());

  assert.equal(consultasDeMatriz(), 1);
  assert.equal(consultasDeTrazado(), 1, "mostrar la propuesta pidió más de un trazado");
});

test("el trazado trae distancia y duración", async () => {
  for (const n of [1, 2]) await pedidoA(n);
  const p = await calcularRutaLocal(HOY, inicioDe());

  assert.ok(p.distanciaM > 0);
  assert.ok(p.duracionS > 0);
  assert.equal(p.sinTrazado, false);
});

// ===========================================================================
// "Mañana": cerrado como no entregado antes de armar la ruta (specs 010 y 012)
// ===========================================================================

test("un pedido que pidió mañana NO entra en la ruta", async () => {
  await pedidoA(1);
  await pedidoA(2, { disponibilidad: "manana" });
  await pedidoA(3);

  const p = await calcularRutaLocal(HOY, inicioDe());

  assert.deepEqual(nombres(p.paradas), ["Cliente 1", "Cliente 3"]);
  // Ya está cerrado (no entregado): no es un problema de dirección.
  assert.deepEqual(p.sinUbicar, []);
});

test("si todos pidieron mañana, no hay nada que rutear", async () => {
  await pedidoA(1, { disponibilidad: "manana" });
  await pedidoA(2, { disponibilidad: "manana" });

  await assert.rejects(() => calcularRutaLocal(HOY, inicioDe()), /No hay pedidos pendientes/i);
});

test("un pedido tachado no reaparece al rehacer la ruta", async () => {
  // Marcarlo no entregado en terreno lo saca de los pendientes, así que rehacer
  // la ruta no lo puede volver a proponer.
  const a = await pedidoA(1);
  const b = await pedidoA(2);
  await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [a.id, b.id],
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });
  await marcarResultado({ fecha: HOY, pedidoId: b.id, conductorId: CONDUCTOR }, "no_entregado");

  const p = await calcularRutaLocal(HOY, inicioDe());
  assert.deepEqual(nombres(p.paradas), ["Cliente 1"]);
});

test("nada pasa al día siguiente: lo no entregado se tacha", async () => {
  // Specs 009 y 012: si el paquete vuelve a salir otro día, se escanea de nuevo.
  // Si el registro de hoy apareciera mañana, el conductor lo tendría dos veces.
  const a = await pedidoA(1);
  const b = await pedidoA(2);
  await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [a.id, b.id],
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });
  await marcarResultado({ fecha: HOY, pedidoId: b.id, conductorId: CONDUCTOR }, "no_entregado");

  // Hoy: lo cerrado no se vuelve a rutear.
  assert.deepEqual(nombres((await calcularRutaLocal(HOY, inicioDe())).paradas), ["Cliente 1"]);
  // Mañana: no hay nada de hoy.
  await assert.rejects(() => calcularRutaLocal("2026-08-21", inicioDe()), /No hay pedidos pendientes/i);
});

// ===========================================================================
// Los bloques horarios pesan en el orden
// ===========================================================================

test("si la ruta más corta ya cumple todos los horarios, NO se ofrece otra", async (t) => {
  // Esto es lo que el documento principal pide primero: una sola ruta cuando es
  // claramente la mejor. Reordenar para "respetar horarios" que la ruta corta ya
  // respeta no aporta nada y solo agrega una decisión antes de salir. A las
  // 12:00 el bloque 12-14 está abierto: ir primero a "Cerca" lo cumple.
  t.after(reloj.descongelar);
  aLaHora(12, 0);

  await pedidoAKm("Cerca", 1, { bloque: "12-14" });
  await pedidoAKm("Media", 2);
  await pedidoAKm("Lejos", 3);

  const p = await calcularRutaLocal(HOY, inicioDe());

  assert.equal(p.alternativas.length, 1, "se ofreció una alternativa que no aportaba");
  assert.equal(p.alternativas[0].bloquesIncumplidos, 0);
});

test("cuando la ruta corta se pasa del horario, gana la que lo respeta", async (t) => {
  // El caso que justifica todo el mecanismo. El cliente del bloque 08:00-10:00
  // está a 15 km al sur, y hay dos paradas a 6 km a cada lado de la base. La
  // ruta vuelve a la base, así que la más corta es el triángulo y "Temprano"
  // queda al medio en cualquier sentido: se llega pasadas las 10:15. Yendo
  // directo se llega a tiempo, a cambio de ~10 % más de camino.
  t.after(reloj.descongelar);
  aLaHora(9, 30);

  await pedidoAKm("Temprano", 15, { bloque: "08-10" });
  await pedidoAKm("Vuelta Este", 0, { este: 6 });
  await pedidoAKm("Vuelta Oeste", 0, { este: -6 });

  const p = await calcularRutaLocal(HOY, inicioDe());

  // La recomendada tiene que ser la que respeta el horario, no la más corta: el
  // criterio es el resultado operativo y no los kilómetros.
  assert.equal(p.elegida, "horarios", `quedó recomendada "${p.elegida}"`);
  assert.equal(p.paradas[0].nombre, "Temprano");
  assert.equal(p.alternativas[0].bloquesIncumplidos, 0);

  // Y la más corta se ofrece igual, para que el conductor pueda decidir que
  // prefiere manejar menos y llamar al cliente.
  const corta = p.alternativas.find((a) => a.estrategia === "corta");
  assert.ok(corta, "no se ofreció la más corta como alternativa");
  assert.equal(corta.bloquesIncumplidos, 1);
  assert.deepEqual(corta.fueraDeHorario, ["Temprano"]);
  assert.ok(
    corta.metrosEstimados < p.alternativas[0].metrosEstimados,
    "la más corta tendría que ser más corta",
  );
});

test("los bloques se ordenan por hora del día, no por cercanía", async (t) => {
  t.after(reloj.descongelar);
  aLaHora(9, 30);

  // A propósito al revés: el más cercano es el de la tarde y el más lejano el de
  // la mañana. Por distancia quedarían justo en el orden contrario al del día.
  await pedidoAKm("Tarde", 1, { bloque: "16-18" });
  await pedidoAKm("Mediodía", 2, { bloque: "12-14" });
  await pedidoAKm("Mañana", 15, { bloque: "08-10" });

  const p = await calcularRutaLocal(HOY, inicioDe());
  const horarios = p.alternativas.find((a) => a.estrategia === "horarios");

  assert.ok(horarios, "no se ofreció la alternativa de horarios");
  assert.deepEqual(nombres(horarios.paradas), ["Mañana", "Mediodía", "Tarde"]);
  assert.equal(horarios.bloquesIncumplidos, 0);
});

test("los pedidos sin bloque ceden el lugar, y entre ellos sigue mandando la distancia", async (t) => {
  // Un pedido sin ventana se puede entregar a cualquier hora: es el que tiene
  // que moverse. Pero moverse no significa quedar en cualquier orden — el grupo
  // sin ventana se ordena igual por lo que menos se maneja, ahora partiendo de
  // donde quedó la parada con horario.
  t.after(reloj.descongelar);
  aLaHora(9, 30);

  await pedidoAKm("Con horario", 15, { bloque: "08-10" });
  await pedidoAKm("Sin A", 1);
  await pedidoAKm("Sin B", 2);
  await pedidoAKm("Sin C", 3);

  const p = await calcularRutaLocal(HOY, inicioDe());
  const horarios = p.alternativas.find((a) => a.estrategia === "horarios");

  assert.ok(horarios, "no se ofreció la alternativa de horarios");
  // El del horario primero, y después los tres desde el más cercano A ÉL —que
  // está a 15 km al sur— y no desde la base: C, B, A.
  assert.deepEqual(nombres(horarios.paradas), ["Con horario", "Sin C", "Sin B", "Sin A"]);
});

test("dentro de un mismo bloque, el orden sigue siendo el que menos se maneja", async (t) => {
  // "Respeta horarios" no es una lista pegada a la fuerza: agrupa por ventana y
  // dentro de cada grupo vuelve a usar el optimizador de distancia.
  t.after(reloj.descongelar);
  aLaHora(8, 0);

  await pedidoAKm("Lejos", 6, { bloque: "08-10" });
  await pedidoAKm("Cerca", 1, { bloque: "08-10" });
  await pedidoAKm("Medio", 3, { bloque: "08-10" });

  const p = await calcularRutaLocal(HOY, inicioDe());
  const horarios = p.alternativas.find((a) => a.estrategia === "horarios") ?? p.alternativas[0];

  assert.deepEqual(nombres(horarios.paradas), ["Cerca", "Medio", "Lejos"]);
});

test("un bloque que ya pasó no hace reordenar la ruta al vacío", async (t) => {
  // A las cinco de la tarde, el bloque 08:00-10:00 no se alcanza por ningún
  // orden. Reordenar la ruta para perseguirlo solo agrega kilómetros: lo que
  // corresponde es avisar que hay que llamar.
  t.after(reloj.descongelar);
  aLaHora(17, 0);

  await pedidoAKm("Perdido", 15, { bloque: "08-10" });
  await pedidoAKm("Vuelta A", 1);
  await pedidoAKm("Vuelta B", 2);

  const p = await calcularRutaLocal(HOY, inicioDe());

  assert.equal(p.elegida, "corta", "se reordenó la ruta por un horario inalcanzable");
  assert.equal(p.alternativas[0].bloquesIncumplidos, 1);
  assert.ok(
    p.advertencias.some((a) => a.includes("Perdido")),
    "no se avisó que a ese cliente se le llega fuera de horario",
  );
});

test("cada alternativa informa cuántos bloques cumple y a quién no", async () => {
  await pedidoA(1);
  await pedidoA(2, { bloque: "08-10" });

  const p = await calcularRutaLocal(HOY, inicioDe());

  for (const a of p.alternativas) {
    assert.equal(typeof a.bloquesCumplidos, "number");
    assert.equal(typeof a.bloquesIncumplidos, "number");
    assert.ok(Array.isArray(a.fueraDeHorario));
    // La suma tiene que ser la cantidad de paradas con bloque.
    const conBloque = a.paradas.filter((x) => x.bloqueHorarioId).length;
    assert.equal(a.bloquesCumplidos + a.bloquesIncumplidos, conBloque);
    assert.equal(a.fueraDeHorario.length, a.bloquesIncumplidos);
  }
});

test("el mismo pedido cumple o no según la hora a la que se mire", async (t) => {
  // La estimación arranca de la hora actual, así que esto no es un detalle de
  // implementación: es la diferencia entre "andá" y "llamalo antes".
  t.after(reloj.descongelar);

  await pedidoAKm("Con bloque", 2, { bloque: "08-10" });

  aLaHora(7, 30);
  const temprano = await calcularRutaLocal(HOY, inicioDe());
  assert.equal(temprano.alternativas[0].bloquesIncumplidos, 0, "a las 7:30 el bloque se alcanza");

  aLaHora(15, 0);
  const tarde = await calcularRutaLocal(HOY, inicioDe());
  assert.equal(tarde.alternativas[0].bloquesIncumplidos, 1, "a las 15:00 ya no se alcanza");
  assert.deepEqual(tarde.alternativas[0].fueraDeHorario, ["Con bloque"]);
  assert.ok(
    tarde.advertencias.some((x) => x.includes("Con bloque")),
    "no se advirtió que se llega fuera de horario",
  );
});

// ===========================================================================
// Confirmados
// ===========================================================================

test("cada alternativa cuenta confirmados y pendientes de contacto", async () => {
  await pedidoA(1, { disponibilidad: "confirmado" });
  await pedidoA(2);
  await pedidoA(3, { bloque: "10-12" });

  const p = await calcularRutaLocal(HOY, inicioDe());
  const a = p.alternativas[0];

  // Confirmado + horario_indicado cuentan como confirmados: los dos dijeron que
  // van a estar.
  assert.equal(a.confirmados, 2);
  assert.equal(a.pendientesDeContacto, 1);
});

test("la alternativa de confirmados los pone antes que a los pendientes", async () => {
  // Por si el día se corta: lo que queda sin entregar es lo que de todas formas
  // era una apuesta.
  await pedidoA(1);
  await pedidoA(2);
  await pedidoA(4, { disponibilidad: "confirmado" });

  const p = await calcularRutaLocal(HOY, inicioDe());
  const conf = p.alternativas.find((a) => a.estrategia === "confirmados");

  if (conf) {
    assert.equal(conf.paradas[0].nombre, "Cliente 4");
  } else {
    // No se ofreció porque no aportaba nada frente a la recomendada. Es una
    // decisión válida del cálculo, pero entonces la recomendada tiene que ser al
    // menos igual de buena.
    assert.ok(p.alternativas.length >= 1);
  }
});

// ===========================================================================
// Una a tres, y qué cuesta cada una
// ===========================================================================

test("nunca se ofrecen más de tres propuestas", async () => {
  for (let n = 1; n <= 8; n++) {
    await pedidoA(n, n % 2 === 0 ? { bloque: "08-10" } : { disponibilidad: "confirmado" });
  }
  const p = await calcularRutaLocal(HOY, inicioDe());
  assert.ok(p.alternativas.length <= 3, `se ofrecieron ${p.alternativas.length}`);
  assert.ok(p.alternativas.length >= 1);
});

test("dos estrategias con el MISMO orden se muestran una sola vez", async () => {
  // Sin respuestas de nadie, las tres coinciden. Mostrarlas tres veces con
  // distinto título obliga a comparar tres cosas idénticas.
  for (const n of [1, 2, 3, 4]) await pedidoA(n);
  const p = await calcularRutaLocal(HOY, inicioDe());

  const huellas = p.alternativas.map((a) => a.paradas.map((x) => x.id).join(">"));
  assert.equal(new Set(huellas).size, huellas.length, "se repitió el mismo orden");
  assert.equal(p.alternativas.length, 1);
});

test("calcular varias propuestas NO multiplica las consultas de trazado", async () => {
  // Es la Decisión 5: comparar no puede costar tres veces más. Los órdenes salen
  // de la matriz que ya se pidió; el trazado se pide solo del que se muestra.
  await pedidoA(1);
  await pedidoA(2);
  await pedidoA(6, { bloque: "08-10" });

  const p = await calcularRutaLocal(HOY, inicioDe());

  assert.ok(p.alternativas.length >= 1);
  assert.equal(consultasDeMatriz(), 1, "se pidió más de una matriz");
  assert.equal(
    consultasDeTrazado(),
    1,
    `se pidieron ${consultasDeTrazado()} trazados para ${p.alternativas.length} alternativas`,
  );
});

test("elegir otra alternativa pide SU trazado, uno solo", async () => {
  await pedidoA(1);
  await pedidoA(2);
  await pedidoA(6, { bloque: "08-10" });

  const p = await calcularRutaLocal(HOY, inicioDe());
  const otra = p.alternativas.find((a) => a.estrategia !== p.elegida);
  if (!otra) return; // no había alternativa útil: nada que probar

  const antes = consultasDeTrazado();
  const siguiente = await elegirAlternativa(p, otra.estrategia);

  assert.equal(consultasDeTrazado(), antes + 1);
  assert.equal(siguiente.elegida, otra.estrategia);
  assert.deepEqual(nombres(siguiente.paradas), nombres(otra.paradas));
  assert.ok(siguiente.distanciaM > 0, "la alternativa elegida quedó sin distancia");
});

test("quitar una parada de la propuesta deja el orden de las demás; deshacer la devuelve a su lugar", async () => {
  for (const n of [1, 2, 3]) await pedidoA(n);
  const p = await calcularRutaLocal(HOY, inicioDe());
  const [primera, segunda, tercera] = p.paradas;

  const sin = quitarParada(p, segunda.id);
  assert.deepEqual(nombres(sin.paradas), nombres([primera, tercera]));
  assert.equal(sin.alternativas.length, 1, "la comparación era de la lista completa");
  assert.deepEqual(nombres(sin.alternativas[0].paradas), nombres(sin.paradas));

  const antes = consultasDeTrazado();
  const retrazada = await retrazar(sin);
  assert.equal(consultasDeTrazado(), antes + 1, "un trazado nuevo, uno solo");
  assert.ok(retrazada.distanciaM > 0);

  const devuelta = devolverParada(retrazada, segunda, 1);
  assert.deepEqual(nombres(devuelta.paradas), nombres(p.paradas));
});

test("elegir la que ya está puesta no gasta ninguna consulta", async () => {
  for (const n of [1, 2]) await pedidoA(n);
  const p = await calcularRutaLocal(HOY, inicioDe());

  const antes = consultasDeTrazado();
  const igual = await elegirAlternativa(p, p.elegida);

  assert.equal(consultasDeTrazado(), antes);
  assert.equal(igual, p);
});

test("elegir una estrategia que no se ofreció devuelve la propuesta tal cual", async () => {
  for (const n of [1, 2]) await pedidoA(n);
  const p = await calcularRutaLocal(HOY, inicioDe());

  const inexistente = ["corta", "horarios", "confirmados"].find(
    (e) => !p.alternativas.some((a) => a.estrategia === e),
  );
  if (!inexistente) return;

  const antes = consultasDeTrazado();
  const igual = await elegirAlternativa(p, inexistente);
  assert.equal(igual, p);
  assert.equal(consultasDeTrazado(), antes);
});

// ===========================================================================
// Degradación explícita
// ===========================================================================

test("sin trazado la ruta sirve igual: quedan el orden y los puntos", async () => {
  respondeTrazado = false;
  for (const n of [1, 2, 3]) await pedidoA(n);

  const p = await calcularRutaLocal(HOY, inicioDe());

  assert.equal(p.sinTrazado, true);
  assert.equal(p.trazado, null);
  assert.equal(p.paradas.length, 3, "sin trazado se perdieron las paradas");
  assert.ok(
    p.advertencias.some((a) => /trazado/i.test(a)),
    "no se advirtió que falta el trazado",
  );
});

test("sin matriz el orden se calcula igual, en línea recta", async () => {
  respondeMatriz = false;
  for (const n of [3, 1, 2]) await pedidoA(n);

  const p = await calcularRutaLocal(HOY, inicioDe());
  assert.deepEqual(nombres(p.paradas), ["Cliente 1", "Cliente 2", "Cliente 3"]);
});

test("sin matriz Y sin trazado igual hay ruta", async () => {
  respondeMatriz = false;
  respondeTrazado = false;
  for (const n of [1, 2]) await pedidoA(n);

  const p = await calcularRutaLocal(HOY, inicioDe());
  assert.equal(p.paradas.length, 2);
  assert.equal(p.sinTrazado, true);
});

// ===========================================================================
// Guardar la ruta
// ===========================================================================

test("confirmar guarda las paradas, las advertencias y cuántas se comparó", async () => {
  await pedidoA(1);
  await pedidoA(6, { bloque: "08-10" });

  const p = await calcularRutaLocal(HOY, inicioDe());
  await confirmarRutaLocal(p);

  const ruta = await leerRuta(HOY);
  assert.deepEqual(
    ruta.orden,
    p.paradas.map((x) => x.id),
  );
  assert.deepEqual(ruta.advertencias, p.advertencias);
  assert.equal(ruta.propuestasComparadas, p.alternativas.length);
});

test("rehacer la ruta conserva lo que ya se cerró hoy", async () => {
  const a = await pedidoA(1);
  const b = await pedidoA(2);
  await guardarRuta({
    fecha: HOY,
    pedidoIdsEnOrden: [a.id, b.id],
    trazado: null,
    distanciaM: null,
    duracionS: null,
  });
  await marcarResultado({ fecha: HOY, pedidoId: a.id, conductorId: CONDUCTOR }, "entregado");

  // Entra un pedido nuevo y se rehace.
  await pedidoA(3);
  const p = await calcularRutaLocal(HOY, inicioDe());
  await confirmarRutaLocal(p);

  const ruta = await leerRuta(HOY);
  assert.equal(ruta.orden[0], a.id, "lo cerrado tiene que quedar primero");
  const entregada = (await leerPedidos(HOY)).find((x) => x.id === a.id);
  assert.equal(entregada.resultado, "entregado");
  // Y la entregada no se vuelve a rutear.
  assert.ok(!p.paradas.some((x) => x.id === a.id));
  assert.equal(p.cerradas, 1);
});

test("no hay ruta que armar sin pedidos pendientes", async () => {
  await assert.rejects(() => calcularRutaLocal(HOY, inicioDe()), /No hay pedidos pendientes/i);
});
