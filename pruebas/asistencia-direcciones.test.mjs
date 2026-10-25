// Teléfonos y direcciones: el punto donde un dato mal interpretado manda al
// conductor —o el aviso de WhatsApp— a otra persona.
//
// Los dos proveedores de mapas se responden con los fixtures de
// pruebas/fixtures/ (sustituyendo el fetch global), así que estas pruebas no
// tocan la red y no dependen de que Mapbox devuelva hoy lo mismo que ayer. Lo
// que se ejercita es el código REAL de src/lib/geo/geocoding: cómo normaliza la
// consulta, cómo combina las dos listas, y sobre todo cuándo se NIEGA a elegir.
//
// Los casos no son inventados: salen de direcciones reales de la operación en
// Arica. El peor de todos es el de "Los Aromos 120", que existe en la ciudad y
// en el valle de Azapa a nueve kilómetros: quedándose con el primer resultado,
// el conductor sale con el paquete hacia el lugar equivocado y se entera al llegar.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { normalizarTelefono, telefonoParaGuardar, puedeRecibirAviso } = await import(
  "@/lib/comun/telefono"
);
const geo = await import("@/lib/geo/geocoding");
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
    // constitución exige que un fallo deje al conductor con algo accionable.
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
  // Es lo más común: el conductor copia el número de una etiqueta que solo trae los
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
  // Vaciarlo dejaría al conductor sin la única pista de en qué se equivocó.
  assert.equal(telefonoParaGuardar("  12345  "), "12345");
});

test("el número legible es el que el conductor reconoce", () => {
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
  // el conductor es el timbre que tiene que tocar. Por eso esto normaliza la
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
  // "Av." normaliza a "avenida", que pasa el largo mínimo — pero el conductor no
  // escribió una dirección todavía.
  assert.deepEqual(await sugerirDirecciones("Av"), []);
  assert.equal(consultas.length, 0, "se consultó por una abreviatura sola");
});

// ===========================================================================
// Calidad de cada sugerencia
// ===========================================================================

test("una dirección con número y coincidencia exacta es 'exacta'", async () => {
  respuestas.mapbox = MAPBOX.exacta;
  const [s] = await sugerirDirecciones("Quinsachata 1749");
  assert.equal(s.direccion, "Quinsachata 1749");
  assert.equal(s.confianza, "exacta");
  assert.equal(s.coincideNumero, true);
  assert.equal(s.soloCalle, false);
  assert.equal(s.fuente, "mapbox");
});

test("una puerta con confidence 'low' pero número 'matched' SIGUE siendo exacta", async () => {
  // La regresión que costó cara. Mapbox recalibró su confidence y hoy contesta
  // "low" para toda dirección de Arica —hasta para una puerta que SÍ tiene—
  // porque la consulta no trae código postal ni comuna. Cuando el código
  // decidía por ese campo, esta dirección quedaba "baja", ubicarDireccion()
  // dejaba `elegida` en null y NINGÚN pedido entraba a la ruta.
  assert.equal(
    MAPBOX.exacta.features[0].properties.match_code.confidence,
    "low",
    "el fixture dejó de tener el confidence 'low' que motivó esta prueba",
  );
  respuestas.mapbox = MAPBOX.exacta;
  const [s] = await sugerirDirecciones("Quinsachata 1749");
  assert.equal(s.confianza, "exacta", "se volvió a decidir por confidence");
});

test("la puerta INTERPOLADA es aproximada, y su número no es 'otro número'", async () => {
  // address_number "plausible": la calle es la correcta y el número cae en su
  // cuadra, pero Mapbox no tiene esa puerta y estima la posición. Son 10 de
  // cada 23 direcciones de Arica, así que esto es el caso NORMAL, no el raro.
  respuestas.mapbox = MAPBOX.puerta_interpolada;
  const [s] = await sugerirDirecciones("avenida Chacabuco 500");

  assert.equal(s.confianza, "aproximada", "una puerta interpolada no es exacta");
  assert.equal(s.soloCalle, false, "la calle sí trae número: no es una calle sola");
  // Ni true (no hay puerta) ni false (false le pinta al conductor la marca grave
  // "otro número" sobre una dirección que está bien escrita).
  assert.equal(s.coincideNumero, null);
});

test("cada valor de address_number cae donde tiene que caer", async () => {
  // La tabla completa, en un solo lugar. Mapbox ya cambió esto una vez sin
  // avisar; si agrega o renombra un valor, acá se ve.
  const casos = [
    ["matched", "exacta"],
    ["plausible", "aproximada"],
    ["not_applicable", "aproximada"],
    [undefined, "aproximada"],
  ];

  for (const [valor, esperada] of casos) {
    const base = MAPBOX.exacta.features[0];
    respuestas.mapbox = {
      features: [
        {
          ...base,
          properties: {
            ...base.properties,
            match_code: { ...base.properties.match_code, address_number: valor },
          },
        },
      ],
    };
    const [s] = await sugerirDirecciones("Quinsachata 1749");
    assert.equal(s.confianza, esperada, `address_number=${valor} dio ${s.confianza}`);
  }
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
  // con el 2000. Mandar al conductor ahí es mandarlo a otro barrio con el paquete.
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
  // kilómetros. Quedándose con el primero, el conductor se entera al llegar.
  respuestas.mapbox = MAPBOX.ambigua;
  const r = await ubicarDireccion("Los Aromos 120");

  assert.equal(r.tipo, "ambigua");
  assert.equal(r.elegida, null, "la aplicación eligió entre dos lugares distintos");
  assert.equal(r.candidatos.length, 2, "los dos candidatos tienen que llegar al conductor");
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
          coordinates: { longitude: -70.28975, latitude: -18.4713 },
        },
      },
    ],
  };
  const r = await ubicarDireccion("Quinsachata 1749");
  assert.equal(r.tipo, "exacta");
  assert.ok(r.elegida);
});

test("una puerta interpolada ENTRA a la ruta, pero con la advertencia puesta", async () => {
  // La decisión: dejarlas fuera es lo que estuvo pasando y significaba que el
  // conductor confirmaba a mano media ruta. Nadie confirma media ruta —se sale
  // igual, o no se sale—. Llegar a la cuadra correcta con el cartel puesto es
  // mejor que no llegar. Lo que NO se negocia es que el cartel esté.
  respuestas.mapbox = MAPBOX.puerta_interpolada;
  const r = await ubicarDireccion("avenida Chacabuco 500");

  assert.equal(r.tipo, "aproximada");
  assert.ok(r.elegida, "una puerta interpolada tiene que quedar utilizable");
  assert.ok(r.advertencia, "entró a la ruta sin decir que era aproximada");
  assert.match(r.advertencia, /aproximada|cuadra/i);
});

test("solo la calle: se avisa y no se elige", async () => {
  respuestas.mapbox = MAPBOX.solo_calle;
  const r = await ubicarDireccion("avenida Chacabuco");
  assert.equal(r.tipo, "solo_calle");
  assert.equal(r.elegida, null);
  assert.match(r.advertencia, /mitad de cuadra|número/i);
  // Pero el candidato se ofrece: el conductor puede decidir que le sirve.
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
  // Principio IV de la constitución: un proveedor caído no puede dejar al conductor
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

// ===========================================================================
// El número que queda colgando: "Linderos 3536"
// ===========================================================================
//
// La calle se llama "Avenida Linderos Poniente" y en la boleta dice "Linderos
// 3536". Los proveedores contestan la CALLE sin número —el 3536 se pierde— y la
// puerta aparece recién escribiendo el nombre largo entero (ver
// completarNumeroEnCalles en lib/geo/geocoding).
//
// Cada prueba usa un NÚMERO distinto a propósito: lo ya preguntado se recuerda
// mientras dure el módulo (escribiendo "3536" dígito a dígito la misma consulta
// vuelve a caer, y cada una se paga), así que reusar el número haría que una
// prueba contestara con la memoria de la anterior.

/** Qué puertas existen de verdad en cada avenida. Hace de "lo que sabe Mapbox"
 *  para estas pruebas: cada número está en una avenida, en las dos, o en
 *  ninguna. */
const AVENIDAS = [
  {
    nombre: "Avenida Linderos Poniente",
    lng: -70.3128,
    lat: -18.4795,
    numeros: ["3536", "3540", "3542", "3544"],
  },
  { nombre: "Avenida Linderos Oriente", lng: -70.2865, lat: -18.4712, numeros: ["3538", "3540"] },
];

/** Una puerta con número, en la forma exacta que devuelve la v6 de Mapbox (la
 *  misma del caso "exacta" del fixture). Se arma acá y no se guarda en el
 *  fixture porque cada prueba pide un número distinto. */
function puertaMapbox(avenida, numero) {
  return {
    features: [
      {
        id: `urn:prueba:${numero}`,
        properties: {
          mapbox_id: `urn:prueba:${numero}`,
          feature_type: "address",
          name: `${avenida.nombre} ${numero}`,
          place_formatted: "Arica, Región de Arica y Parinacota, Chile",
          coordinates: { longitude: avenida.lng, latitude: avenida.lat },
          match_code: { street: "matched", address_number: "matched", confidence: "exact" },
        },
      },
    ],
  };
}

/** El doble de Mapbox para estos casos: si le preguntan por una avenida con
 *  número contesta la puerta cuando existe, y para cualquier otra cosa contesta
 *  las dos avenidas sin número —que es lo que hace hoy con "Linderos 3536"—. */
function mapboxLinderos(url) {
  const q = new URL(url).searchParams.get("q") ?? "";
  const m = /^(.*[^\d\s])\s+(\d+)$/.exec(q.trim());
  if (m) {
    const pedida = m[1].trim().toLowerCase();
    const avenida = AVENIDAS.find((a) => a.nombre.toLowerCase() === pedida);
    if (avenida) {
      return avenida.numeros.includes(m[2]) ? puertaMapbox(avenida, m[2]) : MAPBOX.vacia;
    }
  }
  return MAPBOX.linderos_calles;
}

/** Las consultas `q` que se le hicieron a Mapbox, en orden. */
function consultasMapbox() {
  return consultas
    .filter((u) => !u.includes("nominatim"))
    .map((u) => new URL(u).searchParams.get("q"));
}

test("el número se busca en la calle cuyo nombre contiene lo escrito", async () => {
  respuestas.mapbox = mapboxLinderos;

  const r = await ubicarDireccion("Linderos 3536");

  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Avenida Linderos Poniente 3536");
  // La segunda vuelta se hizo con el nombre OFICIAL, que es lo único que hace
  // aparecer la puerta.
  assert.ok(
    consultasMapbox().includes("Avenida Linderos Poniente 3536"),
    consultasMapbox().join(" | "),
  );
});

test("la calle que NO tiene ese número desaparece de la lista", async () => {
  respuestas.mapbox = mapboxLinderos;

  const r = await ubicarDireccion("Linderos 3536");
  const textos = r.candidatos.map((c) => c.direccion);

  // Con el número escrito, una avenida que no lo tiene dejó de ser una opción:
  // dejarla —encima marcada "sin número"— es ofrecer justo la equivocada.
  assert.ok(!textos.includes("Avenida Linderos Oriente"), textos.join(" | "));
  // Y la calle sola de la que SÍ salió la puerta tampoco queda repetida debajo.
  assert.ok(!textos.includes("Avenida Linderos Poniente"), textos.join(" | "));
  assert.equal(textos[0], "Avenida Linderos Poniente 3536");
});

test("si el número existe en las DOS calles, no se elige ninguna", async () => {
  respuestas.mapbox = mapboxLinderos;

  // El 3540 existe en Linderos Poniente y en Linderos Oriente, a casi tres
  // kilómetros una de otra. Son dos avenidas distintas, no dos formas de
  // escribir la misma: elige el conductor.
  const r = await ubicarDireccion("Linderos 3540");

  assert.equal(r.tipo, "ambigua");
  assert.equal(r.elegida, null);
  const textos = r.candidatos.map((c) => c.direccion);
  assert.ok(textos.includes("Avenida Linderos Poniente 3540"), textos.join(" | "));
  assert.ok(textos.includes("Avenida Linderos Oriente 3540"), textos.join(" | "));
  assert.ok(r.advertencia?.length);
});

test("escribir más acota: 'Linderos Poniente' no pregunta por la otra avenida", async () => {
  respuestas.mapbox = mapboxLinderos;

  const r = await ubicarDireccion("Linderos Poniente 3542");

  assert.equal(r.elegida?.direccion, "Avenida Linderos Poniente 3542");
  // "poniente" y "oriente" distinguen una avenida de la otra: no son palabras
  // genéricas. Preguntar por las dos sería una consulta pagada al aire.
  assert.ok(
    !consultasMapbox().some((q) => q?.includes("Oriente")),
    consultasMapbox().join(" | "),
  );
});

test("una palabra a medias NO se toma por la calle", async () => {
  respuestas.mapbox = mapboxLinderos;

  // Aunque el proveedor devuelva igual las dos avenidas, "Linder" no es
  // "Linderos": la palabra tiene que estar entera. Es lo único que separa "es
  // esta calle" de "se parece a esta calle".
  await ubicarDireccion("Linder 3536");

  assert.deepEqual(consultasMapbox(), ["Linder 3536"]);
});

test("coincidir solo en una palabra genérica no es coincidir", async () => {
  respuestas.mapbox = mapboxLinderos;

  // "avenida" está en el nombre de las dos y no distingue nada. Sin esta regla,
  // escribir "Avenida 1234" mandaría a preguntar por todas las avenidas de
  // Arica.
  await ubicarDireccion("Avenida 1234");

  assert.deepEqual(consultasMapbox(), ["Avenida 1234"]);
});

test("el nombre de la calle lo puede aportar OSM y el número, Mapbox", async () => {
  // Es la razón por la que esto vive afuera de los dos proveedores: OSM tiene
  // los nombres de calle correctos y Mapbox los números de casa (ver la cabecera
  // de lib/geo/geocoding). Acá Mapbox no reconoce "Linderos 3544" y la calle sale
  // de OSM.
  respuestas.mapbox = (url) => {
    const q = new URL(url).searchParams.get("q") ?? "";
    return q.toLowerCase().startsWith("avenida linderos") ? mapboxLinderos(url) : MAPBOX.vacia;
  };
  respuestas.osm = [
    {
      osm_type: "way",
      osm_id: 5544,
      lat: "-18.4795",
      lon: "-70.3128",
      category: "highway",
      name: "Avenida Linderos Poniente",
      address: { road: "Avenida Linderos Poniente", city: "Arica" },
    },
  ];

  const r = await ubicarDireccion("Linderos 3544");

  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida?.direccion, "Avenida Linderos Poniente 3544");
});

test("con la puerta ya resuelta no se gasta ninguna consulta de más", async () => {
  respuestas.mapbox = MAPBOX.exacta;

  await ubicarDireccion("avenida Chacabuco 500");

  // El camino normal es este: alguien ya devolvió el número pedido, así que no
  // hay nada que completar. Una consulta a cada proveedor y nada más.
  assert.deepEqual(consultasMapbox(), ["avenida Chacabuco 500"]);
});

test("una calle sin número escrito no dispara la búsqueda de puertas", async () => {
  respuestas.mapbox = mapboxLinderos;

  // Sin número no hay puerta que buscar: el conductor todavía está escribiendo.
  await ubicarDireccion("Linderos");

  assert.deepEqual(consultasMapbox(), ["Linderos"]);
});

test("las puertas encontradas se muestran ARRIBA de lo que ya había", () => {
  // Lo que hace la lista mientras el conductor escribe (ver direccion-input.tsx):
  // la puerta encontrada primero, y afuera la calle que no tiene ese número.
  const lista = [
    {
      id: "a",
      direccion: "Avenida Linderos Oriente",
      detalle: null,
      lat: -18.4712,
      lng: -70.2865,
      soloCalle: true,
      confianza: "aproximada",
      coincideNumero: null,
      fuente: "mapbox",
    },
  ];
  const puerta = {
    id: "b",
    direccion: "Avenida Linderos Poniente 3536",
    detalle: null,
    lat: -18.4795,
    lng: -70.3128,
    soloCalle: false,
    confianza: "exacta",
    coincideNumero: true,
    fuente: "mapbox",
  };

  const conPuerta = geo.aplicarPuertas(lista, {
    puertas: [puerta],
    sinEseNumero: ["Avenida Linderos Oriente"],
  });
  assert.deepEqual(
    conPuerta.map((s) => s.direccion),
    ["Avenida Linderos Poniente 3536"],
  );

  // Y si no se encontró ninguna puerta no se saca nada: quedarse sin lista es
  // peor que una lista imperfecta.
  const sinNada = geo.aplicarPuertas(lista, {
    puertas: [],
    sinEseNumero: ["Avenida Linderos Oriente"],
  });
  assert.deepEqual(sinNada, lista);
});

// ===========================================================================
// Plus Codes escritos en el campo de dirección
// ===========================================================================
//
// El atajo para el problema de fondo de Arica. Está medido: de 23 direcciones
// reales, Mapbox tiene la puerta exacta en 2 y estima el resto. Para una casa
// sin número, un código dictado por teléfono ubica mejor que cualquier
// dirección escrita — y ubica igual de bien mañana.

test("un Plus Code no se le pregunta a NADIE", async () => {
  // Es la propiedad que lo hace valioso: sin red, sin API key, sin límite de
  // consultas y sin poder fallar. Si algún día esto sale a consultar, la
  // sugerencia deja de aparecer con el teléfono sin señal.
  respuestas.mapbox = MAPBOX.vacia;
  respuestas.osm = OSM.vacia;

  await sugerirDirecciones("57HFGMCP+MX");
  await sugerirEnOsm("57HFGMCP+MX");
  await ubicarDireccion("57HFGMCP+MX");

  assert.equal(consultas.length, 0, "se consultó un proveedor por un Plus Code");
});

test("un Plus Code queda elegido y sin dudas que resolver", async () => {
  const r = await ubicarDireccion("57HFGMCP+MX");

  assert.equal(r.tipo, "exacta");
  assert.ok(r.elegida, "un Plus Code ES la ubicación: no hay nada que preguntar");
  assert.equal(r.advertencia, null);
  assert.equal(r.elegida.fuente, "plus_code");
  assert.equal(r.elegida.soloCalle, false);
  // No hay número de casa en juego: no es que no coincida, es que no aplica.
  // false le pintaría al conductor la marca grave "otro número".
  assert.equal(r.elegida.coincideNumero, null);
  assert.ok(Math.abs(r.elegida.lat - -18.4783) < 0.01, "no cayó en Arica");
});

test("un código CORTO se guarda como el código completo", async () => {
  // "GMCP+MX" es lo que la gente dicta por teléfono, pero no significa nada sin
  // saber respecto de dónde se leyó. Lo que queda en el pedido tiene que
  // valerse solo.
  const r = await ubicarDireccion("gmcp+mx, Arica");

  assert.equal(r.tipo, "exacta");
  assert.equal(r.elegida.direccion, "57HFGMCP+MX");
});

test("un código impreciso entra igual, pero diciendo cuánto cubre", async () => {
  // Ocho dígitos cubren más de cinco kilómetros: sirve para orientarse, no para
  // entregar. Se usa —es lo que hay— con el tamaño a la vista.
  const r = await ubicarDireccion("57HFGM00+");

  assert.equal(r.tipo, "aproximada");
  assert.ok(r.elegida, "un código impreciso sigue siendo mejor que nada");
  assert.match(r.advertencia, /\d+ m/, "no dice cuánto cubre");
  assert.match(r.advertencia, /no a la puerta/i);
  assert.equal(r.elegida.confianza, "aproximada");
});

test("lo que no es un código sigue el camino de siempre", async () => {
  // La detección no puede quedarse con direcciones normales: "Los Aromos 120"
  // tiene que seguir consultando a los dos proveedores.
  assert.equal(geo.esPlusCode("Avenida Chacabuco 500"), false);
  assert.equal(geo.esPlusCode("Los Aromos 120"), false);
  assert.equal(geo.esPlusCode(""), false);

  respuestas.mapbox = MAPBOX.exacta;
  await ubicarDireccion("Quinsachata 1749");
  assert.ok(consultas.length > 0, "una dirección normal dejó de consultar");
});

test("cada fuente tiene nombre propio en pantalla", async () => {
  // Antes esto era `s.fuente === "osm" ? "OSM" : "Mapbox"` escrito en dos
  // pantallas, y ese `else` etiquetaba como "Mapbox" cualquier fuente nueva —
  // un Plus Code habría salido a pantalla diciendo "Mapbox".
  const r = await ubicarDireccion("57HFGMCP+MX");
  assert.equal(geo.NOMBRE_FUENTE[r.elegida.fuente], "Plus Code");

  for (const fuente of ["mapbox", "osm", "plus_code"]) {
    assert.ok(geo.NOMBRE_FUENTE[fuente], `la fuente "${fuente}" no tiene nombre`);
  }
});
