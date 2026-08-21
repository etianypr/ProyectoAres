// Teléfonos y direcciones: el punto donde un dato mal interpretado manda al
// chofer —o el aviso de WhatsApp— a otra persona.
//
// Los dos proveedores de mapas se responden con los fixtures de
// pruebas/fixtures/ (sustituyendo el fetch global), así que estas pruebas no
// tocan la red y no dependen de que Mapbox devuelva hoy lo mismo que ayer. Lo
// que se ejercita es el código REAL de src/lib/geocoding.ts: cómo normaliza la
// consulta, cómo combina las dos listas, y sobre todo cuándo se NIEGA a elegir.
//
// Los casos no son inventados: salen de direcciones reales de la operación en
// Arica. El peor de todos es el de "Los Aromos 120", que existe en la ciudad y
// en el valle de Azapa a nueve kilómetros: quedándose con el primer resultado,
// el chofer sale con el paquete hacia el lugar equivocado y se entera al llegar.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { normalizarTelefono, telefonoParaGuardar, puedeRecibirAviso } = await import(
  "@/lib/telefono"
);
const geo = await import("@/lib/geocoding");
const {
  normalizarConsulta,
  combinarSugerencias,
  sugerirDirecciones,
  sugerirEnOsm,
  ubicarDireccion,
  geocodificarDireccion,
} = geo;

const MAPBOX = JSON.parse(readFileSync("pruebas/fixtures/geocoding-mapbox.json", "utf8"));
const OSM = JSON.parse(readFileSync("pruebas/fixtures/geocoding-osm.json", "utf8"));

// ---------------------------------------------------------------------------
// Doble de los dos proveedores
// ---------------------------------------------------------------------------
//
// Se sustituye el fetch global y no los módulos: así corre el armado real de la
// URL (el recuadro de Arica, los tipos pedidos, el país) y la interpretación
// real de cada respuesta. Un doble a nivel de módulo no probaría nada de eso.

const fetchOriginal = globalThis.fetch;

/** Qué contesta cada proveedor. Cada entrada puede ser un objeto o una función
 *  que recibe la URL, para responder distinto según lo que se pidió. */
let respuestas = { mapbox: MAPBOX.vacia, osm: OSM.vacia };
let consultas = [];

function instalar() {
  consultas = [];
  globalThis.fetch = async (entrada) => {
    const url = typeof entrada === "string" ? entrada : entrada.url;
    consultas.push(url);

    const cual = url.includes("nominatim") ? "osm" : "mapbox";
    const r = respuestas[cual];
    const cuerpo = typeof r === "function" ? r(url) : r;

    // null = el proveedor se cayó. Es un caso que hay que probar: la
    // constitución exige que un fallo deje al chofer con algo accionable.
    if (cuerpo === null) return new Response("boom", { status: 503 });

    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

test.before(() => {
  // La app lee el token de acá; sin él, sugerirDirecciones no consulta nada.
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "pk.prueba";
  instalar();
});
test.after(() => {
  globalThis.fetch = fetchOriginal;
});
test.beforeEach(() => {
  respuestas = { mapbox: MAPBOX.vacia, osm: OSM.vacia };
  consultas = [];
});

/** El texto de la consulta `q` que se le mandó a un proveedor. */
function consultaHecha(cual) {
  const url = consultas.find((u) =>
    cual === "osm" ? u.includes("nominatim") : !u.includes("nominatim"),
  );
  return url ? new URL(url).searchParams.get("q") : null;
}

// ===========================================================================
// Teléfonos
// ===========================================================================

test("el prefijo chileno se agrega solo (FR-002)", () => {
  for (const escrito of ["9 1234 5678", "912345678", "9-1234-5678", "(9) 1234 5678"]) {
    const r = normalizarTelefono(escrito);
    assert.equal(r.ok, true, `no normalizó "${escrito}"`);
    assert.equal(r.telefono.e164, "+56912345678");
  }
});

test("al que le falta el 9 inicial se le completa", () => {
  // Es lo más común: el chofer copia el número de una etiqueta que solo trae los
  // ocho dígitos.
  const r = normalizarTelefono("1234 5678");
  assert.equal(r.ok, true);
  assert.equal(r.telefono.e164, "+56912345678");
});

test("un número que YA trae +569 no queda con el prefijo dos veces", () => {
  // Es el caso borde que el spec nombra explícitamente.
  for (const escrito of [
    "+56912345678",
    "+56 9 1234 5678",
    "56912345678",
    "56 9 1234 5678",
  ]) {
    const r = normalizarTelefono(escrito);
    assert.equal(r.ok, true, `no normalizó "${escrito}"`);
    assert.equal(r.telefono.e164, "+56912345678", `duplicó el prefijo en "${escrito}"`);
    assert.ok(!r.telefono.e164.includes("5656"));
  }
});

test("el 0 de larga distancia se descarta", () => {
  assert.equal(normalizarTelefono("09 1234 5678").telefono.e164, "+56912345678");
  assert.equal(normalizarTelefono("0912345678").telefono.e164, "+56912345678");
});

test("un número que no se puede normalizar queda ADVERTIDO, no adivinado", () => {
  // La regla del producto: antes que mandarle el aviso a un desconocido, se
  // avisa y no se manda nada.
  for (const escrito of ["12345", "+569", "1234567890123", "abc", "", "   "]) {
    const r = normalizarTelefono(escrito);
    assert.equal(r.ok, false, `aceptó "${escrito}" como teléfono válido`);
    assert.ok(r.motivo.length > 0, "el motivo tiene que ser mostrable");
  }
});

test("con código de país y un número incompleto NO se inventa el 9 que falta", () => {
  // "+56 1234 5678" son ocho dígitos después del código de país. Completarlo a
  // "+56912345678" convierte un dato roto en un número válido de OTRA persona.
  const r = normalizarTelefono("+56 1234 5678");
  assert.equal(r.ok, false, "le puso un 9 a un número que venía con código de país");
});

test("un fijo se normaliza pero se avisa que no le llega WhatsApp", () => {
  // 58 es Arica: es el fijo que más va a aparecer en esta operación.
  const r = normalizarTelefono("58 212 3456");
  assert.equal(r.ok, true);
  assert.equal(r.telefono.e164, "+56582123456");
  assert.equal(r.telefono.puedeWhatsapp, false);
  assert.match(r.aviso, /WhatsApp/);
  assert.equal(puedeRecibirAviso("+56582123456"), false);
});

test("un celular sí puede recibir el aviso", () => {
  assert.equal(normalizarTelefono("912345678").telefono.puedeWhatsapp, true);
  assert.equal(puedeRecibirAviso("+56912345678"), true);
});

test("normalizar es idempotente: guardar dos veces da lo mismo", () => {
  const una = telefonoParaGuardar("9 1234 5678");
  assert.equal(una, "+56912345678");
  assert.equal(telefonoParaGuardar(una), "+56912345678");
  assert.equal(telefonoParaGuardar(telefonoParaGuardar(una)), "+56912345678");
});

test("lo que no se pudo normalizar se guarda TAL COMO SE ESCRIBIÓ", () => {
  // Vaciarlo dejaría al chofer sin la única pista de en qué se equivocó.
  assert.equal(telefonoParaGuardar("  12345  "), "12345");
});

test("el número legible es el que el chofer reconoce", () => {
  assert.equal(normalizarTelefono("912345678").telefono.legible, "+56 9 1234 5678");
});

// ===========================================================================
// Normalizar la dirección antes de buscarla
// ===========================================================================

test("las abreviaturas se expanden", () => {
  assert.equal(normalizarConsulta("Av. Chacabuco 500"), "avenida Chacabuco 500");
  assert.equal(normalizarConsulta("Avda Chacabuco 500"), "avenida Chacabuco 500");
  assert.equal(normalizarConsulta("Psje Los Aromos 12"), "pasaje Los Aromos 12");
  assert.equal(normalizarConsulta("Pob. Nueva Esperanza"), "población Nueva Esperanza");
});

test("el # y el N° del número se sacan", () => {
  // Nominatim trata el "#" como parte del nombre de la calle y pierde el número.
  assert.equal(normalizarConsulta("Chacabuco #500"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco N° 500"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco Nº500"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco No. 500"), "Chacabuco 500");
});

test("el depto se saca de la CONSULTA, no de la dirección guardada", () => {
  // Para el geocodificador es ruido que empuja el resultado a otra cuadra; para
  // el chofer es el timbre que tiene que tocar. Por eso esto normaliza la
  // consulta y el pedido conserva el texto entero.
  assert.equal(normalizarConsulta("Chacabuco 500 depto 42"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco 500, Depto 42"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco 500 dpto 42-B"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco 500 casa B"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco 500 block 3"), "Chacabuco 500");
  assert.equal(normalizarConsulta("Chacabuco 500 oficina 21"), "Chacabuco 500");
});

test("el 'S/N' se saca: no es parte del nombre de la calle", () => {
  assert.equal(normalizarConsulta("Los Aromos S/N"), "Los Aromos");
  assert.equal(normalizarConsulta("Los Aromos s/n"), "Los Aromos");
  assert.equal(normalizarConsulta("Los Aromos SN"), "Los Aromos");
});

test("los espacios de más no llegan al proveedor", () => {
  assert.equal(normalizarConsulta("  Chacabuco    500  "), "Chacabuco 500");
});

test("la consulta normalizada es la que de verdad se manda", async () => {
  respuestas.mapbox = MAPBOX.exacta;
  await sugerirDirecciones("Av. Chacabuco #500 depto 42");
  assert.equal(consultaHecha("mapbox"), "avenida Chacabuco 500");
});

test("una abreviatura sola no gasta una consulta", async () => {
  // "Av." normaliza a "avenida", que pasa el largo mínimo — pero el chofer no
  // escribió una dirección todavía.
  assert.deepEqual(await sugerirDirecciones("Av"), []);
  assert.equal(consultas.length, 0, "se consultó por una abreviatura sola");
});

// ===========================================================================
// Calidad de cada sugerencia
// ===========================================================================

test("una dirección con número y coincidencia exacta es 'exacta'", async () => {
  respuestas.mapbox = MAPBOX.exacta;
  const [s] = await sugerirDirecciones("avenida Chacabuco 500");
  assert.equal(s.direccion, "Avenida Chacabuco 500");
  assert.equal(s.confianza, "exacta");
  assert.equal(s.coincideNumero, true);
  assert.equal(s.soloCalle, false);
  assert.equal(s.fuente, "mapbox");
});

test("la calle sin número se marca como tal", async () => {
  respuestas.mapbox = MAPBOX.solo_calle;
  const [s] = await sugerirDirecciones("avenida Chacabuco");
  assert.equal(s.soloCalle, true);
  assert.equal(s.confianza, "aproximada", "una calle sola no puede ser exacta");
});

test("el número interpolado sobre OTRA calle se descarta entero", async () => {
  // Mapbox pega el número pedido sobre cualquier calle que le suene parecida y
  // no avisa: para "Av. Diego Portales 2000" devolvió seis avenidas distintas
  // con el 2000. Mandar al chofer ahí es mandarlo a otro barrio con el paquete.
  respuestas.mapbox = MAPBOX.numero_interpolado;
  assert.deepEqual(
    await sugerirDirecciones("avenida Diego Portales 2000"),
    [],
    "una calle que no es la pedida llegó a la lista",
  );
});

test("OSM con número de casa da una ubicación exacta", async () => {
  respuestas.osm = OSM.con_numero;
  const [s] = await sugerirEnOsm("Quinsachata 1749");
  assert.equal(s.direccion, "Quinsachata 1749", "el orden chileno es calle y después número");
  assert.equal(s.confianza, "exacta");
  assert.equal(s.coincideNumero, true);
  assert.equal(s.fuente, "osm");
});

test("un punto de interés de OSM NO es 'sin número': ese punto ES el destino", async () => {
  respuestas.osm = OSM.punto_interes;
  const [s] = await sugerirEnOsm("Terminal Rodoviario");
  assert.equal(s.direccion, "Terminal Rodoviario de Arica");
  assert.equal(s.soloCalle, false);
  assert.equal(s.confianza, "exacta");
});

test("una calle de OSM sin número queda aproximada", async () => {
  respuestas.osm = OSM.calle_sin_numero;
  const [s] = await sugerirEnOsm("avenida Chacabuco");
  assert.equal(s.soloCalle, true);
  assert.equal(s.confianza, "aproximada");
});

test("los tramos repetidos de una misma calle se muestran una vez", async () => {
  // Nominatim devuelve un resultado por TRAMO: la misma avenida puede venir
  // cuatro veces y la lista se vería con cuatro renglones idénticos.
  respuestas.osm = OSM.tramos_repetidos;
  const lista = await sugerirEnOsm("avenida Diego Portales");
  assert.equal(lista.length, 1);
});

// ===========================================================================
// Combinar los dos proveedores
// ===========================================================================

test("Mapbox va primero y OSM agrega lo que falta", () => {
  const deMapbox = [
    { id: "m1", direccion: "Avenida Chacabuco 500", detalle: null, lat: -18.47, lng: -70.29, soloCalle: false, confianza: "exacta", coincideNumero: true, fuente: "mapbox" },
  ];
  const deOsm = [
    { id: "o1", direccion: "Terminal Rodoviario de Arica", detalle: null, lat: -18.48, lng: -70.30, soloCalle: false, confianza: "exacta", coincideNumero: null, fuente: "osm" },
  ];
  const lista = combinarSugerencias(deMapbox, deOsm);
  assert.deepEqual(lista.map((s) => s.id), ["m1", "o1"]);
});

test("la calle de OSM se descarta si Mapbox ya dio esa calle CON número", () => {
  // Sería un renglón peor justo debajo del bueno, y encima marcado "sin número".
  const deMapbox = [
    { id: "m1", direccion: "Avenida Chacabuco 500", detalle: null, lat: -18.47, lng: -70.29, soloCalle: false, confianza: "exacta", coincideNumero: true, fuente: "mapbox" },
  ];
  const deOsm = [
    { id: "o1", direccion: "Avenida Chacabuco", detalle: null, lat: -18.47, lng: -70.29, soloCalle: true, confianza: "aproximada", coincideNumero: null, fuente: "osm" },
  ];
  assert.deepEqual(combinarSugerencias(deMapbox, deOsm).map((s) => s.id), ["m1"]);
});

test("las tildes y los espacios no hacen aparecer un duplicado", () => {
  const deMapbox = [
    { id: "m1", direccion: "Avenida Colón 123", detalle: null, lat: -18.47, lng: -70.29, soloCalle: false, confianza: "exacta", coincideNumero: true, fuente: "mapbox" },
  ];
  const deOsm = [
    { id: "o1", direccion: "avenida  colon   123", detalle: null, lat: -18.47, lng: -70.29, soloCalle: false, confianza: "exacta", coincideNumero: null, fuente: "osm" },
  ];
  assert.deepEqual(combinarSugerencias(deMapbox, deOsm).map((s) => s.id), ["m1"]);
});

// ===========================================================================
// ubicarDireccion: cuándo la aplicación se NIEGA a elegir
// ===========================================================================

test("una sola coincidencia exacta se puede usar sin preguntar", async () => {
  respuestas.mapbox = MAPBOX.exacta;
  const r = await ubicarDireccion("avenida Chacabuco 500");
  assert.equal(r.tipo, "exacta");
  assert.ok(r.elegida, "una dirección exacta tiene que quedar elegida");
  assert.equal(r.advertencia, null);
});

test("la MISMA dirección en dos lugares distintos es ambigua y NO se elige", async () => {
  // El caso que motivó todo esto: "Los Aromos 120" en Arica y en Azapa, a nueve
  // kilómetros. Quedándose con el primero, el chofer se entera al llegar.
  respuestas.mapbox = MAPBOX.ambigua;
  const r = await ubicarDireccion("Los Aromos 120");

  assert.equal(r.tipo, "ambigua");
  assert.equal(r.elegida, null, "la aplicación eligió entre dos lugares distintos");
  assert.equal(r.candidatos.length, 2, "los dos candidatos tienen que llegar al chofer");
  assert.match(r.advertencia, /más de un lugar/i);
});

test("dos coincidencias CERCA no son ambiguas: es la misma puerta", async () => {
  // Dos resultados a veinte metros son el mismo lugar visto por dos proveedores.
  // Tratarlos como ambiguos haría preguntar en cada carga, por nada.
  respuestas.mapbox = {
    features: [
      MAPBOX.exacta.features[0],
      {
        id: "cerca",
        properties: {
          ...MAPBOX.exacta.features[0].properties,
          mapbox_id: "cerca",
          coordinates: { longitude: -70.29792, latitude: -18.47818 },
        },
      },
    ],
  };
  const r = await ubicarDireccion("avenida Chacabuco 500");
  assert.equal(r.tipo, "exacta");
  assert.ok(r.elegida);
});

test("solo la calle: se avisa y no se elige", async () => {
  respuestas.mapbox = MAPBOX.solo_calle;
  const r = await ubicarDireccion("avenida Chacabuco");
  assert.equal(r.tipo, "solo_calle");
  assert.equal(r.elegida, null);
  assert.match(r.advertencia, /mitad de cuadra|número/i);
  // Pero el candidato se ofrece: el chofer puede decidir que le sirve.
  assert.equal(r.candidatos.length, 1);
});

test("ningún proveedor la encontró: se dice, y no se inventa un punto", async () => {
  const r = await ubicarDireccion("Calle Que No Existe 999");
  assert.equal(r.tipo, "no_encontrada");
  assert.equal(r.elegida, null);
  assert.deepEqual(r.candidatos, []);
  assert.match(r.advertencia, /No encontramos/i);
});

test("una dirección vacía no gasta ninguna consulta", async () => {
  const r = await ubicarDireccion("   ");
  assert.equal(r.tipo, "no_encontrada");
  assert.equal(consultas.length, 0);
});

test("si Mapbox se cae, OSM sostiene la búsqueda", async () => {
  // Principio IV de la constitución: un proveedor caído no puede dejar al chofer
  // sin poder trabajar.
  respuestas.mapbox = null; // 503
  respuestas.osm = OSM.con_numero;

  const r = await ubicarDireccion("Quinsachata 1749");
  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida.fuente, "osm");
});

test("si los DOS se caen, no se lanza: se informa", async () => {
  respuestas.mapbox = null;
  respuestas.osm = null;

  const r = await ubicarDireccion("avenida Chacabuco 500");
  assert.equal(r.tipo, "no_encontrada");
  assert.ok(r.advertencia, "un fallo total tiene que dejar un mensaje accionable");
});

test("se consultan los DOS proveedores, no en cascada", async () => {
  // Hace falta para poder DETECTAR la ambigüedad: con uno solo no hay con qué
  // comparar.
  respuestas.mapbox = MAPBOX.exacta;
  respuestas.osm = OSM.con_numero;
  await ubicarDireccion("avenida Chacabuco 500");

  assert.ok(consultaHecha("mapbox"), "no se consultó Mapbox");
  assert.ok(consultaHecha("osm"), "no se consultó OpenStreetMap");
});

test("la búsqueda queda acotada a Arica", async () => {
  // Sin el recuadro, "colón 123" devuelve la Avenida Colón de Santiago.
  respuestas.mapbox = MAPBOX.exacta;
  await ubicarDireccion("avenida Colón 123");

  const url = consultas.find((u) => !u.includes("nominatim"));
  const params = new URL(url).searchParams;
  assert.equal(params.get("country"), "cl");
  assert.ok(params.get("bbox"), "falta el recuadro que acota a Arica");
});

test("se piden VARIOS candidatos, no uno solo", async () => {
  // Con limit=1 no hay forma de saber que la dirección era ambigua.
  respuestas.mapbox = MAPBOX.exacta;
  await ubicarDireccion("avenida Chacabuco 500");

  const url = consultas.find((u) => !u.includes("nominatim"));
  assert.ok(Number(new URL(url).searchParams.get("limit")) > 1);
});

// ===========================================================================
// geocodificarDireccion: la versión sin nadie a quien preguntar
// ===========================================================================

test("geocodificarDireccion sigue devolviendo coordenadas o null", async () => {
  // La usan la dirección de la EMPRESA (punto de partida) y nada más que necesite
  // preguntar. Su contrato no cambió.
  respuestas.mapbox = MAPBOX.exacta;
  const c = await geocodificarDireccion("avenida Chacabuco 500");
  assert.ok(Number.isFinite(c.lat) && Number.isFinite(c.lng));

  respuestas.mapbox = MAPBOX.vacia;
  assert.equal(await geocodificarDireccion("Calle Inexistente 1"), null);
});

test("una dirección ambigua NO queda elegida, aunque geocodificar devuelva algo", async () => {
  // Las dos funciones tienen contratos distintos a propósito: geocodificar es
  // "dame lo mejor que haya" y ubicar es "decime si puedo confiar". Un pedido
  // usa la segunda (ver reintentarUbicar en generar-ruta.ts).
  respuestas.mapbox = MAPBOX.ambigua;

  assert.ok(await geocodificarDireccion("Los Aromos 120"), "geocodificar tiene que dar algo");
  assert.equal(
    (await ubicarDireccion("Los Aromos 120")).elegida,
    null,
    "ubicar no puede elegir cuando hay dos lugares distintos",
  );
});
