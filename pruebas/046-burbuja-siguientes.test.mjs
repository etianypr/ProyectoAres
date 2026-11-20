// La burbuja con las siguientes paradas y la tarjeta de la parada (spec 046): la dirección en
// corto (calle y número, nunca se pierde el número), la ficha del pago (nunca «pagado» sin
// leerlo), las pendientes que siguen y lo que la web le manda a la burbuja de la APK 1.11.0.
// La ventana nativa se recorre en el teléfono. Calles reales, números y nombres inventados.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = { open: () => {}, location: { href: "" } };

const { direccionCorta, textoDireccionCorta } = await import("@/lib/encomiendas/direccion-corta");
const { pagoDelPedido } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/por-pagar");
const { vistaDeBurbuja, siguientesParadas } = await import("@/app/(conductor)/conductor/encomiendas/_hooks/vista-burbuja");

test("direccionCorta: solo la calle y su número, como nombre propio y con Av./Pje.", () => {
  assert.deepEqual(direccionCorta("DAVID GIRVAN 931 DEPTO 12"), { calle: "David Girvan", numero: "931" });
  assert.deepEqual(direccionCorta("PASAJE FRANCISCO ALVARES ROMERO 1204, ARICA"), { calle: "Pje. Francisco Alvares Romero", numero: "1204" });
  assert.deepEqual(direccionCorta("AV SANTA MARIA 2150"), { calle: "Av. Santa Maria", numero: "2150" });
  assert.deepEqual(direccionCorta("18 DE SEPTIEMBRE 940"), { calle: "18 de Septiembre", numero: "940" });
  // El número del nombre no es el de la casa: «Pasaje 1 1450».
  assert.deepEqual(direccionCorta("PASAJE 1 1450"), { calle: "Pje. 1", numero: "1450" });
});

test("direccionCorta: la referencia y el sector quedan fuera; lo escrito con minúsculas se respeta", () => {
  assert.deepEqual(direccionCorta("LA PAZ 940 CON CALLE 5"), { calle: "La Paz", numero: "940" });
  assert.deepEqual(direccionCorta("DAVID GIRVAN 941 CHINCHORRO ALTO"), { calle: "David Girvan", numero: "941" });
  assert.deepEqual(direccionCorta("Marcoleta 920"), { calle: "Marcoleta", numero: "920" });
  assert.deepEqual(direccionCorta("LOS AROMOS"), { calle: "Los Aromos", numero: null }, "sin número, todo es la calle");
  assert.deepEqual(direccionCorta(""), { calle: "", numero: null });
  assert.equal(textoDireccionCorta("DAVID GIRVAN 931 DEPTO 12"), "David Girvan 931");
});

test("pagoDelPedido: POR PAGAR con o sin monto, PAGADO, y sin leer nunca es pagado", () => {
  assert.deepEqual(pagoDelPedido({ porPagar: true, montoPorPagar: 12990, origenCarga: "guia" }), { tipo: "cobro", monto: 12990 });
  assert.deepEqual(pagoDelPedido({ porPagar: true, montoPorPagar: null, origenCarga: "guia" }), { tipo: "cobro", monto: null });
  assert.deepEqual(pagoDelPedido({ porPagar: false, montoPorPagar: null, origenCarga: "guia" }), { tipo: "pagado" });
  assert.deepEqual(pagoDelPedido({ porPagar: null, montoPorPagar: null, origenCarga: "guia" }), { tipo: "sin_leer" });
  assert.equal(pagoDelPedido({ porPagar: null, montoPorPagar: null, origenCarga: "manual" }), null, "a mano y sin dato: sin ficha");
});

function parada(secuencia, pedido = {}) {
  return {
    secuencia,
    hayQueContactar: false,
    pedido: {
      id: `p-${secuencia}`,
      of: "282000512",
      nombre: `N. Inventado ${secuencia}`,
      direccion: `MARCOLETA ${900 + secuencia}`,
      telefono: "+56900000000",
      lat: -18.4783,
      lng: -70.3126,
      disponibilidad: null,
      llamada: null,
      bloqueHorarioId: null,
      resultado: "pendiente",
      porPagar: null,
      montoPorPagar: null,
      origenCarga: "guia",
      ...pedido,
    },
  };
}

test("siguientesParadas: las 3 pendientes que siguen a la activa, en el orden de la ruta", () => {
  const paradas = [
    parada(11, { resultado: "entregado" }),
    parada(12),
    parada(13),
    parada(14, { resultado: "no_entregado" }),
    parada(15),
    parada(16),
    parada(17),
  ];
  assert.deepEqual(siguientesParadas(paradas, paradas[1]).map((p) => p.secuencia), [13, 15, 16]);
  assert.deepEqual(siguientesParadas(paradas, paradas[6]), [], "la última no tiene siguientes");
});

test("vistaDeBurbuja: lo de la APK 1.11.0 (dirección, nombre, OF, pago, foto y siguientes)", () => {
  const paradas = [parada(12, { porPagar: true, montoPorPagar: 12990 }), parada(13, { telefono: null }), parada(14), parada(15), parada(16)];
  const v = vistaDeBurbuja(paradas[0], "en_parada", { whatsapp: false, aviso: null, nueva: false, paradas, foto: "BASE64" });
  assert.deepEqual([v.calle, v.numero, v.nombre, v.of], ["Marcoleta", "912", "N. Inventado 12", "282 000 512"]);
  assert.equal(v.pago.tipo, "cobro");
  assert.match(v.pago.monto, /^\$\s?12\.990$/);
  assert.equal(v.foto, "BASE64");
  assert.deepEqual(
    v.siguientes.map((s) => [s.id, s.secuencia, s.calle, s.numero, s.conTelefono]),
    [
      ["p-13", 13, "Marcoleta", "913", false],
      ["p-14", 14, "Marcoleta", "914", true],
      ["p-15", 15, "Marcoleta", "915", true],
    ],
  );
  // Lo de antes sigue, para la APK 1.10.
  assert.match(v.titulo, /^OF /);

  const pagado = vistaDeBurbuja(parada(12, { porPagar: false, of: null }), "en_parada", { whatsapp: false, aviso: null, nueva: false });
  assert.deepEqual(pagado.pago, { tipo: "pagado", monto: null });
  assert.equal(pagado.of, null, "sin OF la ficha dice «OF» sola");
  assert.deepEqual(pagado.siguientes, [], "sin las paradas del día no hay siguientes");
});

test("vistaDeBurbuja: sin «Contestó»; el horario pedido y el ⚠ de adelante sí van", () => {
  const opciones = { whatsapp: true, aviso: null, nueva: false };
  assert.equal(vistaDeBurbuja(parada(12, { disponibilidad: "confirmado" }), "en_parada", opciones).estado, null);
  assert.equal(vistaDeBurbuja(parada(12), "en_parada", opciones).estado, null, "«Sin respuesta» tampoco");
  const adelante = vistaDeBurbuja(parada(12), "en_parada", { ...opciones, adelante: "⚠ En 2 paradas: calle en dos lugares" });
  assert.deepEqual(adelante.estado, { texto: "⚠ En 2 paradas: calle en dos lugares", tono: "marca" });
});
