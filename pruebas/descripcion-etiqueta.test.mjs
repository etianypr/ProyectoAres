// La descripción del paquete sale siempre de la IA (terreno 2026-10-28): si el
// texto de la etiqueta ya traía los datos, mandan esos y la IA pone la
// descripción; si no, manda la IA. Datos inventados.
import test from "node:test";
import assert from "node:assert/strict";

const { conDescripcion } = await import("@/lib/encomiendas/lectura/etiqueta");

const etiqueta = (extra) => ({
  ofImpresa: null,
  bulto: 1,
  bultosTotal: 1,
  destinatario: "Ana Pérez",
  telefono: "+56911112222",
  direccion: "Calle Uno 100",
  porPagar: false,
  montoPorPagar: null,
  dudosos: [],
  referencia: null,
  ...extra,
});
const caja = { tipo: "caja", tamano: "mediano", color: "cafe", nota: null };

test("el texto trae los datos: mandan esos y la IA pone la descripción", () => {
  const r = conDescripcion(etiqueta(), etiqueta({ destinatario: "Ana Peres", referencia: caja }));
  assert.equal(r.destinatario, "Ana Pérez", "el dato es el del texto, como antes");
  assert.deepEqual(r.referencia, caja, "la descripción es la de la IA");
});

test("al texto le falta algo, o no hubo texto: manda la IA", () => {
  const ia = etiqueta({ referencia: caja });
  assert.equal(conDescripcion(etiqueta({ telefono: null }), ia), ia);
  assert.equal(conDescripcion(null, ia), ia);
});
