// La burbuja de ARES sobre Google Maps (spec 020). Lo que se prueba acá es lo que
// decide la web: qué botones van en cada paso (los mismos para la tarjeta y la
// burbuja), qué se le manda a la burbuja, cuándo Google Maps va a otra parada, y
// que fuera de la APK los km abran Google Maps como siempre. La ventana nativa se
// prueba en el teléfono (quickstart). Datos inventados.
import test from "node:test";
import assert from "node:assert/strict";

const abiertos = [];
globalThis.window = { open: (url) => abiertos.push(url), location: { href: "" } };

const { botonesDeParada, estadoDeParada, atenderBoton } = await import(
  "@/app/(conductor)/conductor/encomiendas/_hooks/botones-parada"
);
const { vistaDeBurbuja, aDondeNavegar } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/vista-burbuja");
const { navegarA, permisoBurbuja, mostrarBurbuja, alTocarBurbuja } = await import("@/lib/nativo/burbuja");

function parada({ telefono = "+56900000000", lat = -18.4783, lng = -70.3126, ...pedido } = {}) {
  return {
    secuencia: 4,
    hayQueContactar: true,
    pedido: {
      id: "p-4",
      of: "123456789",
      nombre: "Cliente Prueba",
      direccion: "Calle Inventada 123",
      telefono,
      lat,
      lng,
      disponibilidad: null,
      llamada: null,
      bloqueHorarioId: null,
      ...pedido,
    },
  };
}

const ids = (filas) => filas.map((f) => f.map((b) => b.id));

test("botonesDeParada: los botones de cada paso, en filas (los de la tarjeta de hoy)", () => {
  assert.deepEqual(ids(botonesDeParada(parada(), "antes_llamar")), [["llamar"]]);
  assert.deepEqual(ids(botonesDeParada(parada({ telefono: null }), "antes_llamar")), [
    ["escanear"],
    ["telefono", "entregado", "no_se_pudo"],
  ]);
  assert.deepEqual(ids(botonesDeParada(parada(), "esperando_resultado")), [["contesto", "llamar", "no_contesto"]]);
  for (const fase of ["confirmado", "esperando_entrega"]) {
    assert.deepEqual(ids(botonesDeParada(parada(), fase)), [["finalizado"], ["llamar", "no_se_pudo"]]);
  }
  assert.deepEqual(ids(botonesDeParada(parada(), "salidas")), [["pendiente"], ["no_entregado"], ["volver"]]);
});

test("botonesDeParada: escanear y teléfono necesitan ARES; los que escriben se apagan al guardar", () => {
  const sinTelefono = botonesDeParada(parada({ telefono: null }), "antes_llamar").flat();
  assert.deepEqual(sinTelefono.filter((b) => b.abreAres).map((b) => b.id), ["escanear", "telefono"]);
  const resultado = botonesDeParada(parada(), "esperando_resultado")[0];
  assert.deepEqual(resultado.map((b) => b.escribe), [true, false, true]);
  assert.equal(resultado[1].soloIcono, true, "volver a llamar es el redondo del medio");
  const salidas = botonesDeParada(parada(), "salidas").flat();
  assert.ok(salidas.filter((b) => b.id !== "volver").every((b) => b.detalle), "la consecuencia va escrita");
});

test("estadoDeParada: horario pedido, confirmado o sin respuesta (con ícono y texto)", () => {
  assert.deepEqual(estadoDeParada(parada({ disponibilidad: "confirmado" }), true), {
    texto: "Estará en su domicilio",
    tono: "ok",
    icono: "check",
  });
  assert.equal(estadoDeParada(parada(), true).texto, "Sin respuesta todavía");
  assert.equal(estadoDeParada(parada(), false), null, "sin WhatsApp no hay respuesta que esperar");
  assert.equal(estadoDeParada(parada({ llamada: "no_contesto" }), true), null);
});

test("atenderBoton: cada botón llama a la misma función que en la tarjeta", () => {
  const llamadas = [];
  const acciones = Object.fromEntries(
    ["llamar", "escanear", "editar", "finalizar", "noSePudo", "contesto", "noContesto", "volver", "deshacer"].map(
      (n) => [n, () => llamadas.push(n)],
    ),
  );
  acciones.salida = (s) => llamadas.push(`salida:${s.clave}`);
  for (const id of ["llamar", "escanear", "telefono", "entregado", "finalizado", "no_se_pudo", "contesto", "no_contesto", "pendiente", "no_entregado", "volver", "deshacer", "navegar", "ares"]) {
    atenderBoton(id, acciones);
  }
  assert.deepEqual(llamadas, [
    "llamar",
    "escanear",
    "editar",
    "finalizar",
    "finalizar",
    "noSePudo",
    "contesto",
    "noContesto",
    "salida:pendiente",
    "salida:no_entregado",
    "volver",
    "deshacer",
  ]);
});

test("vistaDeBurbuja: la parada, su punto, sus botones y el aviso con Deshacer", () => {
  const v = vistaDeBurbuja(parada(), "confirmado", {
    whatsapp: true,
    aviso: { texto: "Entrega registrada", deshacer: true },
    nueva: true,
  });
  assert.equal(v.secuencia, 4);
  assert.match(v.titulo, /^OF /);
  assert.equal(v.detalle, "Cliente Prueba · Calle Inventada 123");
  assert.deepEqual(v.destino, { lat: -18.4783, lng: -70.3126 });
  assert.deepEqual(ids(v.filas), [["finalizado"], ["llamar", "no_se_pudo"]]);
  assert.deepEqual(v.aviso, { texto: "Entrega registrada", deshacer: true });

  const sinOf = vistaDeBurbuja(parada({ of: null, lat: null, lng: null }), "antes_llamar", {
    whatsapp: false,
    aviso: null,
    nueva: false,
  });
  assert.equal(sinOf.titulo, "Parada 4");
  assert.equal(sinOf.destino, null, "sin punto: Navegar abre ARES para ubicarla");
});

test("aDondeNavegar: Google Maps va a la parada nueva solo con la burbuja en curso y si tiene punto", () => {
  const p = parada();
  assert.deepEqual(aDondeNavegar(true, "p-3", p), { lat: -18.4783, lng: -70.3126 }, "se cerró la anterior");
  assert.equal(aDondeNavegar(true, "p-4", p), null, "la misma parada: Google Maps ya va ahí");
  assert.equal(aDondeNavegar(false, "p-3", p), null, "sin burbuja, se navega con los km");
  assert.equal(aDondeNavegar(true, "p-3", parada({ lat: null, lng: null })), null);
  assert.equal(aDondeNavegar(true, "p-3", null), null);
});

test("fuera de la APK: sin burbuja, y los km abren Google Maps con solo el punto", async () => {
  assert.equal(await permisoBurbuja(), "no_disponible");
  await mostrarBurbuja(vistaDeBurbuja(parada(), "antes_llamar", { whatsapp: true, aviso: null, nueva: true }));
  const soltar = alTocarBurbuja(() => assert.fail("fuera de la APK la burbuja no existe"));
  soltar();

  abiertos.length = 0;
  assert.equal(await navegarA({ lat: -18.4783, lng: -70.3126 }), "navegador");
  assert.equal(abiertos.length, 1);
  assert.match(abiertos[0], /google\.com\/maps\/dir\/.*destination=-18\.4783,-70\.3126/);
  assert.doesNotMatch(abiertos[0], /OF|Cliente|Calle/, "a Google va solo el punto");
});
