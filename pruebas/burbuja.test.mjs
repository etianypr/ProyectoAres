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

test("botonesDeParada: en la parada, siempre entregado · llamar · no se entrega (el dueño, 2026-11-06)", () => {
  assert.deepEqual(ids(botonesDeParada(parada(), "en_parada")), [["entregado", "llamar", "no_se_pudo"]]);
  // Sin teléfono, el del medio escanea la etiqueta; abajo, escribirlo a mano.
  assert.deepEqual(ids(botonesDeParada(parada({ telefono: null }), "en_parada")), [
    ["entregado", "escanear", "no_se_pudo"],
    ["telefono"],
  ]);
  assert.deepEqual(ids(botonesDeParada(parada(), "salidas")), [["pendiente"], ["no_entregado"], ["volver"]]);
});

test("botonesDeParada: entregado en verde, no se entrega en rojo, el del medio redondo", () => {
  const [entregado, llamar, noSeEntrega] = botonesDeParada(parada(), "en_parada")[0];
  assert.deepEqual([entregado.texto, entregado.tono], ["Pedido entregado", "ok"]);
  assert.deepEqual([noSeEntrega.texto, noSeEntrega.tono], ["No se entrega", "peligro"]);
  assert.equal(llamar.soloIcono, true);
  assert.deepEqual([entregado.escribe, llamar.escribe, noSeEntrega.escribe], [true, false, false]);
});

test("botonesDeParada: escanear y teléfono necesitan ARES; las salidas dicen su consecuencia", () => {
  const sinTelefono = botonesDeParada(parada({ telefono: null }), "en_parada").flat();
  assert.deepEqual(sinTelefono.filter((b) => b.abreAres).map((b) => b.id), ["escanear", "telefono"]);
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
});

test("atenderBoton: cada botón llama a la misma función que en la tarjeta", () => {
  const llamadas = [];
  const acciones = Object.fromEntries(
    ["llamar", "escanear", "editar", "finalizar", "noSePudo", "volver", "deshacer"].map(
      (n) => [n, () => llamadas.push(n)],
    ),
  );
  acciones.salida = (s) => llamadas.push(`salida:${s.clave}`);
  for (const id of ["llamar", "escanear", "telefono", "entregado", "no_se_pudo", "pendiente", "no_entregado", "volver", "deshacer", "navegar", "ares"]) {
    atenderBoton(id, acciones);
  }
  assert.deepEqual(llamadas, [
    "llamar",
    "escanear",
    "editar",
    "finalizar",
    "noSePudo",
    "salida:pendiente",
    "salida:no_entregado",
    "volver",
    "deshacer",
  ]);
});

test("vistaDeBurbuja: la parada, su punto, sus botones y el aviso con Deshacer", () => {
  const v = vistaDeBurbuja(parada(), "en_parada", {
    whatsapp: true,
    aviso: { texto: "Entrega registrada", deshacer: true },
    nueva: true,
  });
  assert.equal(v.secuencia, 4);
  assert.match(v.titulo, /^OF /);
  assert.equal(v.detalle, "Cliente Prueba · Calle Inventada 123");
  assert.deepEqual(v.destino, { lat: -18.4783, lng: -70.3126 });
  assert.deepEqual(ids(v.filas), [["entregado", "llamar", "no_se_pudo"]]);
  assert.deepEqual(v.aviso, { texto: "Entrega registrada", deshacer: true });

  const sinOf = vistaDeBurbuja(parada({ of: null, lat: null, lng: null }), "en_parada", {
    whatsapp: false,
    aviso: null,
    nueva: false,
  });
  assert.equal(sinOf.titulo, "Parada 4");
  assert.equal(sinOf.destino, null, "sin punto: Navegar abre ARES para ubicarla");
});

test("paridad: en cada caso la burbuja muestra los botones de la tarjeta y cada uno hace lo mismo", () => {
  const casos = [
    ["con teléfono", parada(), "en_parada"],
    ["sin teléfono", parada({ telefono: null }), "en_parada"],
    ["sin punto", parada({ lat: null, lng: null }), "en_parada"],
    ["confirmado por WhatsApp", parada({ disponibilidad: "confirmado" }), "en_parada"],
    ["eligiendo salida", parada(), "salidas"],
  ];
  for (const [nombre, p, fase] of casos) {
    const tarjeta = botonesDeParada(p, fase);
    const vista = vistaDeBurbuja(p, fase, { whatsapp: true, aviso: null, nueva: false });
    // Lo que dibuja la burbuja es lo mismo que la tarjeta: ids, textos, tonos y si abre ARES.
    assert.deepEqual(vista.filas, tarjeta, `${nombre}: la burbuja no muestra lo mismo que la tarjeta`);
    const estado = estadoDeParada(p, true);
    assert.deepEqual(vista.estado, estado ? { texto: estado.texto, tono: estado.tono } : null, `${nombre}: el estado del receptor difiere`);
    // Cada botón de la parada termina en una acción de la tarjeta (ninguno queda sin cablear).
    for (const boton of tarjeta.flat()) {
      let llamadas = 0;
      const acciones = new Proxy({}, { get: () => () => (llamadas += 1) });
      atenderBoton(boton.id, acciones);
      assert.equal(llamadas, 1, `${nombre}: "${boton.texto}" no llama a ninguna acción de la tarjeta`);
    }
  }
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
  await mostrarBurbuja(vistaDeBurbuja(parada(), "en_parada", { whatsapp: true, aviso: null, nueva: true }));
  const soltar = alTocarBurbuja(() => assert.fail("fuera de la APK la burbuja no existe"));
  soltar();

  abiertos.length = 0;
  assert.equal(await navegarA({ lat: -18.4783, lng: -70.3126 }), "navegador");
  assert.equal(abiertos.length, 1);
  assert.match(abiertos[0], /google\.com\/maps\/dir\/.*destination=-18\.4783,-70\.3126/);
  assert.doesNotMatch(abiertos[0], /OF|Cliente|Calle/, "a Google va solo el punto");
});
