// El escáner en vivo junta los cuadros de una misma etiqueta (spec 028): un dato
// queda firme cuando sale igual en ≥ 2 cuadros; lo que se contradice queda por
// revisar; la OF sale solo del código, y el texto de otra etiqueta no se mezcla.
// El dueño: «es más importante que se demore más … y que todos los datos
// importantes estén bien» (2026-11-08). Datos inventados.
import test from "node:test";
import assert from "node:assert/strict";

const { sumarCuadro, resultadoVotos } = await import("@/lib/encomiendas/lectura/etiqueta/votos");
const { leerEtiqueta } = await import("@/lib/encomiendas/lectura/etiqueta");

const CODIGO = { of: "200000002", bulto: 1 };
const OTRO = { of: "200000003", bulto: 1 };
const etiqueta = ({ tel = "9 1234 5678", pago = "POR PAGAR\nTotal Monto O.F. $ 12.990", of = "" } = {}) =>
  leerEtiqueta(`${of}DESTINATARIO: ANA ROJAS\nTel. ${tel}\n${pago}\nBulto N° 001/002`);

/** Varios cuadros seguidos de la misma etiqueta. */
function cuadros(...lecturas) {
  return lecturas.reduce((v, [codigo, lectura]) => sumarCuadro(v, codigo, lectura), null);
}

test("un dato visto en un solo cuadro todavía no está firme", () => {
  const r = resultadoVotos(cuadros([CODIGO, etiqueta()]));
  assert.equal(r.lectura.telefono, "+56912345678");
  assert.ok(r.lectura.dudosos.includes("telefono"));
  assert.equal(r.listo, false);
});

test("dos cuadros iguales: firmes, y la etiqueta queda leída", () => {
  const r = resultadoVotos(cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta()]));
  assert.equal(r.of, "200000002");
  assert.equal(r.bulto, 1);
  assert.deepEqual(
    [r.lectura.destinatario, r.lectura.telefono, r.lectura.porPagar, r.lectura.montoPorPagar],
    ["ANA ROJAS", "+56912345678", true, 12990],
  );
  assert.deepEqual([r.lectura.bultosTotal, r.lectura.dudosos.filter((d) => d !== "direccion")], [2, []]);
  assert.equal(r.listo, true);
});

test("cuadros que se contradicen: gana el que más se repite; empatados, por revisar", () => {
  const empate = resultadoVotos(cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta({ tel: "9 1234 5679" })]));
  assert.ok(empate.lectura.dudosos.includes("telefono"));
  assert.equal(empate.listo, false);
  const gana = resultadoVotos(
    cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta({ tel: "9 1234 5679" })], [CODIGO, etiqueta()]),
  );
  assert.equal(gana.lectura.telefono, "+56912345678");
  assert.equal(gana.lectura.dudosos.includes("telefono"), false);
});

test("con la plata no se adivina: un monto empatado queda sin leer", () => {
  const r = resultadoVotos(
    cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta({ pago: "POR PAGAR\nTotal Monto O.F. $ 12.890" })]),
  );
  assert.equal(r.lectura.porPagar, true);
  assert.equal(r.lectura.montoPorPagar, null);
  assert.ok(r.lectura.dudosos.includes("montoPorPagar"));
});

test("otra etiqueta en cámara (otro código) empieza de cero", () => {
  const v = cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta()], [OTRO, etiqueta({ tel: "9 2222 3333" })]);
  const r = resultadoVotos(v);
  assert.equal(r.of, "200000003");
  assert.equal(r.lectura.telefono, "+56922223333");
  assert.equal(r.listo, false, "un cuadro de la nueva no alcanza");
});

test("el texto de un cuadro sin el código de la etiqueta no cuenta (puede ser la caja del lado)", () => {
  const v = cuadros([CODIGO, etiqueta()], [null, etiqueta({ tel: "9 2222 3333" })], [null, etiqueta({ tel: "9 2222 3333" })]);
  const r = resultadoVotos(v);
  assert.equal(r.lectura.telefono, "+56912345678");
  assert.equal(r.listo, false);
  assert.equal(sumarCuadro(null, null, etiqueta()), null, "sin código no hay etiqueta que juntar");
});

// Terreno 2026-11-08: en el escáner el nombre no quedaba nunca firme, porque cada
// cuadro lo lee con alguna diferencia (un punto, una letra) y cada variante
// contaba aparte.
const conNombre = (nombre) => leerEtiqueta(`DESTINATARIO: ${nombre}\nTel. 9 1234 5678\nCONTADO`);

test("el nombre leído con pequeñas diferencias entre cuadros es el mismo voto", () => {
  const r = resultadoVotos(
    cuadros(
      [CODIGO, conNombre("MONICA ARAVENA")],
      [CODIGO, conNombre("MONlCA ARAVENA")],
      [CODIGO, conNombre("MONICA ARAVEN")],
      [CODIGO, conNombre("M0NICA ARAVENA")],
    ),
  );
  assert.equal(r.lectura.destinatario, "MONICA ARAVENA", "se muestra la forma más parecida a todas");
  assert.equal(r.lectura.dudosos.includes("destinatario"), false);
  assert.equal(r.listo, true);
});

test("nombres distintos de verdad no se juntan: quedan por revisar", () => {
  const r = resultadoVotos(cuadros([CODIGO, conNombre("ANA ROJAS")], [CODIGO, conNombre("PEDRO SOTO")]));
  assert.ok(r.lectura.dudosos.includes("destinatario"));
});

test("la OF impresa mal leída en un cuadro no descarta su texto (la OF sale del código)", () => {
  // Los 26 dígitos impresos salen mal leídos seguido: antes eso botaba el cuadro.
  const malLeida = etiqueta({ of: "O.F. 200000082\n" });
  const r = resultadoVotos(cuadros([CODIGO, malLeida], [CODIGO, malLeida]));
  assert.equal(r.of, "200000002");
  assert.equal(r.lectura.telefono, "+56912345678");
  assert.equal(r.ofConfirmada, false, "no confirma, pero tampoco bota la lectura");
});

test("la OF y el bulto salen solo del código; la OF impresa igual confirma la lectura", () => {
  const conOf = etiqueta({ of: "O.F. 200000002\n" });
  const r = resultadoVotos(cuadros([CODIGO, conOf], [CODIGO, conOf]));
  assert.equal(r.of, "200000002");
  assert.equal(r.ofConfirmada, true);
  assert.equal(resultadoVotos(cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta()])).ofConfirmada, false);
});

test("datosFirmes cuenta los tres datos que suenan (nombre, teléfono y pago) a medida que quedan firmes", async () => {
  const { datosFirmes } = await import("@/lib/encomiendas/lectura/etiqueta/votos");
  const uno = resultadoVotos(cuadros([CODIGO, etiqueta()]));
  assert.equal(datosFirmes(uno), 0, "un cuadro: nada firme todavía");
  const dos = resultadoVotos(cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta()]));
  assert.equal(datosFirmes(dos), 3, "nombre, teléfono y POR PAGAR con su monto");
  const sinMonto = resultadoVotos(
    cuadros([CODIGO, etiqueta()], [CODIGO, etiqueta({ pago: "POR PAGAR\nTotal Monto O.F. $ 12.890" })]),
  );
  assert.equal(datosFirmes(sinMonto), 2, "el pago sin su monto firme no cuenta");
});
