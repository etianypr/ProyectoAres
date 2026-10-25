// La estampilla de mapa que se muestra debajo del campo de dirección: dónde
// quedó el punto.
//
// Lo que se prueba acá es el armado de la URL de la imagen (Static Images de
// Mapbox), que tiene tres trampas y las tres se ven igual desde el teléfono —
// "la vista previa no carga" — sin decir cuál de las tres fue:
//
//   1. EL ORDEN. Mapbox pide longitud y DESPUÉS latitud. Invertido, el punto no
//      da error: cae en el mar frente a Somalía y el conductor ve un mapa azul.
//   2. EL ESCAPADO. Los paréntesis y las comas del marcador van literales. Si
//      alguien arma este trozo con URLSearchParams o encodeURIComponent, Mapbox
//      contesta 422 y no se dibuja nada.
//   3. EL TOPE DE TAMAÑO. Ningún lado puede pasar de 1280 px, y con "@2x" lo
//      pedido se duplica. Pasarse es otro error del proveedor, no una imagen
//      más grande.
//
// Nada de esto toca la red: se comprueba la URL, que es lo único que este
// módulo produce.
import test from "node:test";
import assert from "node:assert/strict";

const TOKEN = "pk.prueba";
process.env.NEXT_PUBLIC_MAPBOX_TOKEN = TOKEN;

const { urlMapaEstatico, ZOOM_PUNTO } = await import("@/lib/geo/mapbox/mapa-estatico");

// Una dirección real de la operación en Arica.
const PUNTO = { lat: -18.478_2, lng: -70.310_5 };
const TIRA = { ancho: 480, alto: 128 };

test("la URL apunta a la imagen estática de Mapbox y lleva el token", () => {
  const url = new URL(urlMapaEstatico({ ...PUNTO, ...TIRA }));

  assert.equal(url.host, "api.mapbox.com");
  assert.match(url.pathname, /^\/styles\/v1\/mapbox\/[\w-]+\/static\//);
  assert.equal(url.searchParams.get("access_token"), TOKEN);
});

test("la longitud va antes que la latitud, en el marcador y en el centro", () => {
  const url = urlMapaEstatico({ ...PUNTO, ...TIRA });

  // Arica está en el hemisferio sur y al oeste: las dos coordenadas son
  // negativas y por eso invertirlas NO da error, solo un lugar equivocado. La
  // única forma de fijarlo es comprobar el orden.
  assert.ok(url.includes("(-70.3105,-18.4782)"), url);
  assert.ok(url.includes("/-70.3105,-18.4782,"), url);
  assert.ok(!url.includes("(-18.4782,-70.3105)"), "coordenadas invertidas");
});

test("los paréntesis y las comas del marcador quedan literales", () => {
  const url = urlMapaEstatico({ ...PUNTO, ...TIRA });

  assert.ok(!url.includes("%28") && !url.includes("%29"), "paréntesis escapados");
  assert.ok(!url.includes("%2C") && !url.includes("%2c"), "comas escapadas");
  // Y sigue estando literal después de que un parser de URLs lo normalice: si
  // no, el fetch del navegador lo rompería igual.
  assert.ok(new URL(url).pathname.includes("(-70.3105,-18.4782)"));
});

test("el zoom por defecto muestra la cuadra, y se puede pedir otro", () => {
  assert.ok(urlMapaEstatico({ ...PUNTO, ...TIRA }).includes(`,${ZOOM_PUNTO}/`));
  assert.ok(urlMapaEstatico({ ...PUNTO, ...TIRA, zoom: 13 }).includes(",13/"));

  // Un zoom fuera de la escala de Mapbox se recorta en vez de salir a pedir una
  // imagen que el proveedor va a rechazar.
  assert.ok(urlMapaEstatico({ ...PUNTO, ...TIRA, zoom: 40 }).includes(",22/"));
  assert.ok(urlMapaEstatico({ ...PUNTO, ...TIRA, zoom: -5 }).includes(",0/"));
});

test("con @2x lo pedido se queda dentro del tope de 1280 px", () => {
  const url = urlMapaEstatico({ ...PUNTO, ancho: 900, alto: 900, retina: true });
  const tamano = url.split("/").pop().split("?")[0];

  assert.equal(tamano, "640x640@2x");

  // Y los 1280 completos siguen disponibles cuando no se pide retina.
  const sinRetina = urlMapaEstatico({ ...PUNTO, ancho: 2000, alto: 300 });
  assert.ok(sinRetina.includes("/1280x300?"), sinRetina);
});

test("dos veces la misma esquina es la misma URL: una sola petición", () => {
  // El navegador cachea por URL. Sin redondear, el mismo lugar con un decimal
  // de más sería una petición nueva cada vez que se abre el formulario, y estas
  // peticiones se pagan.
  const a = urlMapaEstatico({ lat: -18.478_200_1, lng: -70.310_499_9, ...TIRA });
  const b = urlMapaEstatico({ ...PUNTO, ...TIRA });

  assert.equal(a, b);
});

test("el pin es chico en las miniaturas y grande en la tira", () => {
  // Las miniaturas de la lista de dudas (56 px): con el pin grande no se ve la
  // cuadra, que es justo lo que hay que comparar entre una opción y otra.
  assert.ok(urlMapaEstatico({ ...PUNTO, ancho: 56, alto: 56 }).includes("/pin-s+"));
  assert.ok(urlMapaEstatico({ ...PUNTO, ...TIRA }).includes("/pin-l+"));
});

test("la atribución de Mapbox y OpenStreetMap no se puede apagar desde acá", () => {
  // Va dibujada en la imagen y es obligatoria por contrato. Que no aparezca
  // ningún parámetro para sacarla es la forma de que nadie lo haga sin querer.
  const url = urlMapaEstatico({ ...PUNTO, ...TIRA });

  assert.ok(!url.includes("attribution="));
  assert.ok(!url.includes("logo="));
});

test("sin coordenadas de verdad no se arma ninguna URL", () => {
  // Un pedido sin ubicar llega acá con null, y el componente no puede reventarle
  // el formulario al conductor por eso.
  for (const malo of [
    { lat: Number.NaN, lng: -70.31 },
    { lat: -18.47, lng: Number.POSITIVE_INFINITY },
    // Fuera de la proyección con la que se dibujan los mapas web: es un dato
    // roto, no un lugar.
    { lat: 91, lng: -70.31 },
    { lat: -18.47, lng: 181 },
  ]) {
    assert.equal(urlMapaEstatico({ ...malo, ...TIRA }), null, JSON.stringify(malo));
  }
});

test("sin token de Mapbox no hay vista previa, y no explota", () => {
  const antes = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  delete process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  try {
    assert.equal(urlMapaEstatico({ ...PUNTO, ...TIRA }), null);
  } finally {
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = antes;
  }
});
