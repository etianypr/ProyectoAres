// Spec 039 (dueño, 2026-11-17): al escanear la nómina el lector ve «0» donde hay un «8», en casi
// todos los escaneos, y las OF de un día son de una misma serie («a lo más entre 281 000 000 y
// 282 000 000»). Lo que se fija:
//   · el rango se aprende del mismo escaneo y una OF fuera de él vuelve cambiando «0» por «8»
//     (o queda por confirmar si no hay una sola forma);
//   · un «0» con «8» al lado en sus votos es un «8», y los «0» de un «8» lo firman;
//   · en un barrido inventado con ese error ya casi no queda una OF firme con otro número, y sin
//     el error se decide lo mismo que antes (eso lo fija la dorada de nomina-rapida.test.mjs);
//   · al escanear la etiqueta, el código de barras (exacto) corrige la OF del pedido si difiere
//     solo en «0» y «8» y hay un solo pedido así.
// OF y direcciones inventadas (calles reales con números inventados).
import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { barrer, hojaDe, nominaInventada } from "./barrido-sintetico.mjs";

const { alRango, rangoDelEscaneo, mismaSalvoOchoYCero, ANCHO_RANGO } = await import("@/lib/encomiendas/lectura/rango-nomina");
const bn = await import("@/lib/encomiendas/lectura/barrido-nomina");
const { sumarCuadroAlBarrido, resultadoDelBarrido } = await import("@/lib/encomiendas/lectura/votos-barrido");
const almacen = await import("@/lib/encomiendas/local/almacen");
const idb = await import("@/lib/encomiendas/local/idb");
const { leerCodigoEtiqueta } = await import("@/lib/encomiendas/lectura/codigo-barras");

const HOY = "2026-11-18";

// ---------------------------------------------------------------- el rango del escaneo

test("el rango sale de la mediana de las firmes de 9 dígitos, con 3 o más", () => {
  const firme = (of) => ({ of, firme: true });
  assert.equal(rangoDelEscaneo([firme("281200000"), firme("281300000")]), null, "con 2 no alcanza");
  assert.equal(rangoDelEscaneo([firme("281200000"), firme("281300000"), { of: "281400000", firme: false }]), null, "solo las firmes");
  assert.equal(rangoDelEscaneo([firme("281200000"), firme("281300000"), firme("7000123")]), null, "las de otro largo no cuentan");
  assert.deepEqual(rangoDelEscaneo([firme("281200000"), firme("281300000"), firme("281700000")]), {
    desde: 281300000 - ANCHO_RANGO,
    hasta: 281300000 + ANCHO_RANGO,
    prefijos: ["281"],
  });
  assert.deepEqual(rangoDelEscaneo([firme("281900000"), firme("282000100"), firme("282000200")]).prefijos, ["281", "282"]);
});

test("una OF fuera del rango vuelve cambiando los «0» que eran «8»; si no hay una sola forma, queda por confirmar", () => {
  const rango = { desde: 280500000, hasta: 282500000 };
  // «281» leído «201»: un solo cambio la deja dentro.
  assert.deepEqual(alRango({ of: "201285183", firme: true }, rango), { of: "281285183", firme: true });
  // Dentro del rango, igual (aunque traiga ceros).
  const dentro = { of: "281205103", firme: true };
  assert.equal(alRango(dentro, rango), dentro);
  // Ninguna forma de entrar cambiando «0» por «8»: se deja, sin firmar.
  assert.deepEqual(alRango({ of: "279123456", firme: true }, rango), { of: "279123456", firme: false });
  // Dos formas con un solo cambio: no se elige a ciegas.
  assert.deepEqual(alRango({ of: "200000000", firme: true }, { desde: 280000000, hasta: 290000000 }), { of: "280000000", firme: true });
  assert.deepEqual(alRango({ of: "201000000", firme: true }, { desde: 200000000, hasta: 300000000 }), { of: "201000000", firme: true });
  const dos = alRango({ of: "100000001", firme: true }, { desde: 100000002, hasta: 180000002 });
  assert.equal(dos.firme, false, "180000001, 108000001… caen dentro con un cambio: no se elige");
  // Sin rango, o de otro largo, no se toca.
  assert.deepEqual(alRango({ of: "201285183", firme: true }, null), { of: "201285183", firme: true });
  assert.deepEqual(alRango({ of: "7000123", firme: true }, rango), { of: "7000123", firme: true });
});

test("fuera del rango y sin arreglo con «0»→«8»: los primeros 3 dígitos del día, si hay una sola forma de entrar", () => {
  // Terreno 2026-11-18: el «8» de «281» salía «6» en 7 de cada 10 cuadros y la OF nunca quedaba firme.
  // El dueño: «los primeros tres dígitos serán los mismos», sin exigir haber visto el del día.
  const rango = { desde: 280200000, hasta: 282200000, prefijos: ["281"] };
  const leida = { of: "261205103", firme: false, firmeSinPrefijo: true };
  // La OF es la del día y vale por el resto de sus dígitos.
  assert.deepEqual(alRango(leida, rango), { ...leida, of: "281205103", firme: true });
  assert.equal(alRango({ of: "287802615", firme: false, firmeSinPrefijo: true }, rango).of, "281802615");
  assert.equal(alRango({ ...leida, of: "279205103" }, rango).of, "281205103");
  // Con el resto sin firmar, se corrige pero no se firma.
  assert.equal(alRango({ ...leida, firmeSinPrefijo: false }, rango).firme, false);
  // Dos prefijos del día que la dejan dentro: no se elige a ciegas.
  const dos = alRango({ of: "261205103", firme: true, firmeSinPrefijo: true }, { desde: 280000000, hasta: 283000000, prefijos: ["281", "282"] });
  assert.deepEqual([dos.of, dos.firme], ["261205103", false]);
  // Ninguno la deja dentro (el resto también está lejos): queda por confirmar.
  const lejos = { desde: 280200000, hasta: 281500000, prefijos: ["281"] };
  assert.deepEqual(alRango({ ...leida, of: "261905103" }, lejos), { ...leida, of: "261905103", firme: false });
});

test("misma OF salvo «0» y «8»: solo esas diferencias, del mismo largo, y no iguales", () => {
  assert.equal(mismaSalvoOchoYCero("281205103", "281285183"), true);
  assert.equal(mismaSalvoOchoYCero("281285183", "281205103"), true);
  assert.equal(mismaSalvoOchoYCero("281285183", "281285183"), false);
  assert.equal(mismaSalvoOchoYCero("281285183", "281285193"), false);
  assert.equal(mismaSalvoOchoYCero("28128518", "281285183"), false);
});

// ---------------------------------------------------------------- el título «DIRECCION»

test("el título «DIRECCION» con el comienzo mal leído igual arma el encargo; «SECCION» o «ELECCION» no son el título", async () => {
  // Terreno 2026-11-18: en una sola fila de la boleta el título salía «VLRECCION», «LRECCION» o
  // «4LRECCION» en todos los cuadros y esa OF no se leía nunca. OF y dirección inventadas.
  const { piezasNomina } = await import("@/lib/encomiendas/lectura/nomina");
  const encargo = (titulo, direccion = "21 DE MAYO 901") => ["281300555 1 0 1", titulo, direccion, "VALOR $ FORMA PAGO DD"];
  for (const titulo of ["DIRECCION", "DIRECCI0N:", "VLRECCION", "LRECCION", "4LRECCION", "DIRECION"]) {
    assert.deepEqual(piezasNomina(encargo(titulo)).bloques.map((b) => [b.of, b.destino]), [["281300555", "21 DE MAYO 901"]], titulo);
  }
  // Con la dirección en el mismo renglón del título mal leído.
  assert.deepEqual(piezasNomina(["281300555 1 0 1", "LRECCION 21 DE MAYO 901", "VALOR $ FORMA PAGO DD"]).bloques.map((b) => b.destino), ["21 DE MAYO 901"]);
  // Una palabra de dirección parecida no es el título: sin título no hay encargo entero.
  for (const titulo of ["SECCION 3", "ELECCION", "LECCION"]) assert.deepEqual(piezasNomina(encargo(titulo)).bloques, [], titulo);
});

// ---------------------------------------------------------------- el barrido

/** El barrido inventado de la serie 281 con un «8» que sale «0» en la proporción dada. */
function barrido({ semillaNomina, semillaBarrido, ochoACero }) {
  const nomina = nominaInventada(60, semillaNomina, { desde: 281000000 });
  const verdad = new Set(nomina.map((e) => e.of));
  let votos = { porFilas: bn.votosNominaVacios(), comoLlegan: bn.votosNominaVacios() };
  for (const c of barrer(hojaDe(nomina), { semilla: semillaBarrido, ochoACero })) votos = sumarCuadroAlBarrido(votos, c.renglones);
  const firmes = resultadoDelBarrido(votos).lista.filter((l) => l.estado === "firme");
  return { bien: firmes.filter((l) => verdad.has(l.of)).length, mal: firmes.filter((l) => !verdad.has(l.of)).length };
}

test("con un «8» leído «0» en 3 de cada 10 cuadros, las firmes salen con su número", () => {
  // Antes de la 039, en 6 barridos así (60 OF cada uno): 208 firmes bien de 360 y 11 con otro
  // número; con la mitad de los «8» leídos «0», 38 bien y 55 con otro número (spec 039).
  let bien = 0;
  let mal = 0;
  for (const s of [1, 2, 3]) {
    const r = barrido({ semillaNomina: 100 + s, semillaBarrido: 10 + s, ochoACero: 0.3 });
    bien += r.bien;
    mal += r.mal;
  }
  assert.equal(mal, 0, "ninguna OF firme con otro número");
  assert.ok(bien >= 165, `firmes bien: ${bien} de 180`);
});

test("con la mitad de los «8» leídos «0», casi todas salen bien (antes casi ninguna)", () => {
  let bien = 0;
  let mal = 0;
  for (const s of [1, 2, 3]) {
    const r = barrido({ semillaNomina: 100 + s, semillaBarrido: 10 + s, ochoACero: 0.5 });
    bien += r.bien;
    mal += r.mal;
  }
  assert.ok(bien >= 150, `firmes bien: ${bien} de 180`);
  assert.ok(mal <= 5, `firmes con otro número: ${mal}`);
});

test("volver a pasar por la misma boleta no deja por confirmar lo ya leído, ni la misma OF dos veces", () => {
  // Terreno 2026-11-18 (dueño): «volví a leer la misma boleta y sale por confirmar OF ya leídas».
  // Antes, con un «8» leído «0» en 3 de cada 10 cuadros, 5 firmes de 220 volvían atrás en la segunda
  // pasada y la misma OF salía dos veces (6 boletas de 40 OF, medido).
  for (const ochoACero of [0, 0.3]) {
    for (const reentrar of [false, true]) {
      for (const s of [1, 2, 3]) {
        const nomina = nominaInventada(40, 300 + s, { desde: 281000000 });
        const hoja = hojaDe(nomina);
        const pasar = (v, semilla) => barrer(hoja, { semilla, ochoACero }).reduce((x, c) => sumarCuadroAlBarrido(x, c.renglones), v);
        let votos = pasar({ porFilas: bn.votosNominaVacios(), comoLlegan: bn.votosNominaVacios() }, 30 + s);
        const firmes = resultadoDelBarrido(votos).lista.filter((l) => l.estado === "firme").map((l) => l.of);
        if (reentrar) votos = { porFilas: bn.votosDeLoLeido(votos.porFilas), comoLlegan: bn.votosDeLoLeido(votos.comoLlegan) };
        const r = resultadoDelBarrido(pasar(votos, 1030 + s));
        const caso = `8→0 ${ochoACero}, ${reentrar ? "volviendo a entrar" : "misma sesión"}, boleta ${s}`;
        for (const of of firmes) assert.ok(r.lista.some((l) => l.of === of && l.estado === "firme"), `${caso}: ${of} sigue firme`);
        assert.equal(r.lista.length, new Set(r.lista.map((l) => l.of)).size, `${caso}: ninguna OF dos veces`);
      }
    }
  }
});

// ---------------------------------------------------------------- la etiqueta

test.beforeEach(async () => {
  for (const store of Object.values(idb.STORES)) await idb.escribir([store], ({ vaciar }) => vaciar(store));
});

/** El código de barras de una etiqueta normal con esa OF y bulto 1. */
const codigoDe = (of) => leerCodigoEtiqueta(`92000022560000${of}001`);

async function pedidosDe(...ofs) {
  const lineas = ofs.map((of, i) => ({ of, destino: `21 DE MAYO ${901 + i}` }));
  await almacen.crearDesdeGuia(lineas, HOY, { folio: null, origen: "guia_pegada" });
}

test("la etiqueta corrige la OF que la nómina dejó con un «0» donde había un «8»", async () => {
  await pedidosDe("281205103", "281300111");
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { ...codigoDe("281285183"), escaneo: true });
  assert.ok(r, "es ese pedido");
  assert.equal(r.pedido.of, "281285183");
  assert.equal(r.ofAntes, "281205103");
  assert.deepEqual(r.pedido.bultosEscaneados, [1]);
  const guardados = await almacen.leerPedidos(HOY);
  assert.deepEqual(guardados.map((p) => p.of).sort(), ["281285183", "281300111"]);
  // El segundo bulto ya calza tal cual.
  const otro = await almacen.aplicarLecturaEtiqueta(HOY, { ...leerCodigoEtiqueta("92000022560000281285183002"), escaneo: true });
  assert.equal(otro.ofAntes, null);
  assert.deepEqual(otro.pedido.bultosEscaneados, [1, 2]);
});

test("la OF exacta no cambia nada, y sin un único parecido sigue «no está en el día»", async () => {
  await pedidosDe("281285183", "281205103", "281285103");
  const exacta = await almacen.aplicarLecturaEtiqueta(HOY, { ...codigoDe("281285183"), escaneo: true });
  assert.equal(exacta.ofAntes, null);
  assert.equal(exacta.pedido.of, "281285183");
  // Otra diferencia que no es «0»/«8» (un «5» donde el pedido tiene «8»): no es ese pedido.
  assert.equal(await almacen.aplicarLecturaEtiqueta(HOY, { ...codigoDe("281288188"), escaneo: true }), null);
});

test("dos pedidos parecidos, uno ya escaneado o una OF escrita a mano: no se adivina", async () => {
  await pedidosDe("281205103", "281285103");
  // 281285183 es 281205103 salvo «0»/«8» y también 281285103: dos candidatos.
  assert.equal(await almacen.aplicarLecturaEtiqueta(HOY, { ...codigoDe("281285183"), escaneo: true }), null);
  // Con el segundo ya escaneado (con su propio código), queda uno solo: el primero.
  await almacen.aplicarLecturaEtiqueta(HOY, { ...codigoDe("281285103"), escaneo: true });
  const r = await almacen.aplicarLecturaEtiqueta(HOY, { ...codigoDe("281285183"), escaneo: true });
  assert.equal(r?.ofAntes, "281205103");
  // Escrita a mano (sin bulto): puede venir mal escrita, no corrige.
  await pedidosDe("281300101");
  assert.equal(await almacen.aplicarLecturaEtiqueta(HOY, { of: "281308181", bulto: null, escaneo: true }), null);
});
