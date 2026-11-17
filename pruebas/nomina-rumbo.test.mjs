// Spec 036, dónde volver al barrer la nómina (dueño, 2026-11-16: «si me salté una OF que
// tengo que confirmar, que marque con un ícono hacia dónde se encuentra, en la cámara en
// vivo»): la flecha a lo que falta confirmar, los huecos (un encargo que la cámara se saltó
// entero) y los fantasmas (una por confirmar que salió en el lugar de otra firme). Calles
// reales con números, OF y nombres inventados.
import test from "node:test";
import assert from "node:assert/strict";
import { barrer, hojaDe, nominaInventada } from "./barrido-sintetico.mjs";

const { votosNominaVacios, votosDeLoLeido } = await import("@/lib/encomiendas/lectura/barrido-nomina");
const { sumarCuadroAlBarrido, resultadoDelBarrido, elegirVotosDelBarrido } = await import("@/lib/encomiendas/lectura/votos-barrido");
const { hojaDelBarrido, flechasDelCuadro, sinFantasmas } = await import("@/lib/encomiendas/lectura/rumbo-nomina");
const { formatoOf } = await import("@/lib/encomiendas/paquete");

const OFS = ["270000101", "270000202", "270000303", "270000404", "270000505", "270000606"];
const [A, B, C, D, E, F] = OFS;
/** Una hoja hecha a mano: las seis OF en orden. */
const hoja = (pendientes = [], huecos = []) => ({
  lugar: new Map(OFS.map((of, i) => [of, i])),
  ofs: OFS,
  posicion: new Map([...OFS.map((of, i) => [of, i]), ...pendientes.map((p) => [p.of, p.i])]),
  pendientes,
  huecos,
  posibles: 0,
  alto: 17,
});
/** La caja de un encargo entero en el cuadro, a la altura `y`. */
const caja = (of, y) => ({ of, x: 10, y, ancho: 600, alto: 300, altoFila: 32, entero: true });

test("una OF por confirmar más arriba de lo que se ve lleva ▲ con su OF y cuántos encargos hay hasta ella", () => {
  const r = flechasDelCuadro([caja(D, 100), caja(E, 600)], hoja([{ of: B, i: 1 }]), {});
  assert.deepEqual(r.flechas, [{ sentido: "arriba", tipo: "falta", etiqueta: `${formatoOf(B)} · 2` }]);
  assert.deepEqual(r.visibles, [D, E]);
  // Más abajo: ▼.
  assert.deepEqual(flechasDelCuadro([caja(B, 100)], hoja([{ of: F, i: 5 }]), {}).flechas, [
    { sentido: "abajo", tipo: "falta", etiqueta: `${formatoOf(F)} · 4` },
  ]);
  // A la vista: sin flecha (su recuadro ya va punteado).
  assert.deepEqual(flechasDelCuadro([caja(B, 100), caja(C, 600)], hoja([{ of: B, i: 1 }]), {}).flechas, []);
});

test("arriba y abajo a la vez, la más cercana de cada lado; un hueco va con «?»", () => {
  const r = flechasDelCuadro([caja(D, 100)], hoja([{ of: A, i: 0 }, { of: F, i: 5 }], [{ despuesDe: 1, motivo: "separados" }]), {});
  assert.deepEqual(r.flechas, [
    { sentido: "arriba", tipo: "hueco", etiqueta: "? · 2" },
    { sentido: "abajo", tipo: "falta", etiqueta: `${formatoOf(F)} · 2` },
  ]);
});

test("la que recién salió de la vista espera; una mala lectura se ubica por su OF; sin nada conocido a la vista no hay flecha", () => {
  const pendiente = hoja([{ of: B, i: 1 }]);
  assert.deepEqual(flechasDelCuadro([caja(D, 100)], pendiente, {}, { esperar: (of) => of === B }).flechas, []);
  // «270000440» es una mala lectura de E: la cámara está en E.
  assert.deepEqual(flechasDelCuadro([caja("270000440", 100)], pendiente, { 270000440: E }).flechas, [
    { sentido: "arriba", tipo: "falta", etiqueta: `${formatoOf(B)} · 3` },
  ]);
  assert.deepEqual(flechasDelCuadro([caja("281999000", 100)], pendiente, {}).flechas, []);
  // Lo que no se ve en el recuadro (detrás del resumen) no cuenta para saber dónde está la cámara.
  const r = flechasDelCuadro([caja(B, 100), caja(D, 900)], pendiente, {}, { dentro: (c) => c.y > 500 });
  assert.deepEqual(r.flechas, [{ sentido: "arriba", tipo: "falta", etiqueta: `${formatoOf(B)} · 2` }]);
});

test("un hueco a la vista se marca entre sus dos encargos", () => {
  const r = flechasDelCuadro([caja(B, 100), caja(C, 1000)], hoja([], [{ despuesDe: 1, motivo: "separados" }]), {});
  assert.deepEqual(r.flechas, []);
  assert.deepEqual(r.cajasHueco, [{ x: 10, y: 400, ancho: 600, alto: 600 }]);
});

// --------------------------------------------- la hoja de un barrido de verdad (inventado)

/** El barrido de una nómina inventada, como lo hace la pantalla. */
function barrerNomina(n, opciones = {}) {
  const nomina = nominaInventada(n, opciones.semillaNomina ?? 11);
  const cuadros = barrer(hojaDe(nomina), { error: 0.02, ...opciones });
  let votos = { porFilas: votosNominaVacios(), comoLlegan: votosNominaVacios() };
  for (const c of cuadros) votos = sumarCuadroAlBarrido(votos, c.renglones);
  const r = resultadoDelBarrido(votos);
  return { nomina, votos, r, hoja: hojaDelBarrido(r, elegirVotosDelBarrido(votos), { huecos: true }) };
}

test("barriendo sin saltarse nada no sale ningún hueco, y un encargo mide lo de siempre", () => {
  const { r, hoja: h } = barrerNomina(20);
  assert.ok(r.lista.length >= 20);
  assert.deepEqual(h.huecos, []);
  // 8 renglones a 70 px, con letra de 32 px.
  assert.ok(Math.abs(h.alto - 17.5) <= 0.5, `alto ${h.alto}`);
});

test("un encargo que la cámara se saltó entero sale como hueco entre sus dos vecinos", () => {
  const { nomina, r, hoja: h } = barrerNomina(20, { saltos: [8] });
  assert.ok(!r.lista.some((l) => l.of === nomina[8].of), "la saltada no se leyó");
  assert.equal(h.huecos.length, 1);
  const [hueco] = h.huecos;
  assert.equal(h.ofs[hueco.despuesDe], nomina[7].of);
  assert.equal(h.ofs[hueco.despuesDe + 1], nomina[9].of);
  assert.equal(hueco.motivo, "separados");
});

test("con el celular tan cerca que entra un encargo por cuadro tampoco salen huecos", () => {
  const { hoja: h } = barrerNomina(12, { altoCuadro: 640, paso: 50 });
  assert.deepEqual(h.huecos, []);
});

test("la flecha apunta a una OF que quedó por confirmar más arriba", () => {
  const { nomina, votos } = barrerNomina(12);
  // La cámara vuelve a pasar por el encargo 3 con la OF mal leída en un cuadro suelto: queda
  // un pendiente a la altura del 3 (salió junto al 2).
  const otra = "281999777";
  const renglones = [
    { texto: `${nomina[2].of} 1 0 1`, x: 10, y: 100, ancho: 300, alto: 32, numeros: [] },
    { texto: "DIRECCION", x: 10, y: 170, ancho: 150, alto: 32 },
    { texto: `${nomina[2].destino} .`, x: 10, y: 240, ancho: 300, alto: 32 },
    { texto: "VALOR $ FORMA PAGO DD", x: 10, y: 310, ancho: 380, alto: 32 },
    { texto: `${otra} 1 0 1`, x: 10, y: 660, ancho: 300, alto: 32 },
    { texto: "DIRECCION", x: 10, y: 730, ancho: 150, alto: 32 },
    { texto: "BAQUEDANO 250 .", x: 10, y: 800, ancho: 300, alto: 32 },
    { texto: "VALOR $ FORMA PAGO DD", x: 10, y: 870, ancho: 380, alto: 32 },
  ];
  const conPendiente = sumarCuadroAlBarrido(votos, renglones);
  const r = resultadoDelBarrido(conPendiente);
  const h = hojaDelBarrido(r, elegirVotosDelBarrido(conPendiente));
  // Tiene lugar: salió justo debajo de la 3.ª, aunque en la lista quedó al final (solo se
  // vio con encargos de un lado).
  assert.deepEqual(h.pendientes.find((p) => p.of === otra), { of: otra, i: h.lugar.get(nomina[2].of) + 0.5 });
  // La cámara ya está en los últimos encargos: la flecha apunta arriba, a la pendiente.
  const abajo = [caja(nomina[10].of, 100), caja(nomina[11].of, 700)];
  const { flechas } = flechasDelCuadro(abajo, h, r.deLectura);
  assert.deepEqual(flechas, [{ sentido: "arriba", tipo: "falta", etiqueta: `${formatoOf(otra)} · ${h.lugar.get(nomina[10].of) - h.lugar.get(nomina[2].of)}` }]);
});

test("los vecinos sobreviven al guardado (JSON) y a otra pasada solo entre lo leído", () => {
  const { votos } = barrerNomina(8);
  const guardados = JSON.parse(JSON.stringify(votos.porFilas));
  assert.deepEqual(guardados.vecinos, votos.porFilas.vecinos);
  const limpio = votosDeLoLeido(guardados);
  for (const [a, abajo] of Object.entries(limpio.vecinos)) {
    assert.ok(limpio.ofs[a], a);
    for (const b of Object.keys(abajo)) assert.ok(limpio.ofs[b], b);
  }
});

// ------------------------------------------------------------------------- fantasmas

/** Un encargo entero en un cuadro, con su fila de OF a la altura `y`. */
const encargo = (of, y, destino = "21 DE MAYO 123") => [
  { texto: `${of} 1 0 1`, x: 10, y, ancho: 300, alto: 32 },
  { texto: "DIRECCION", x: 10, y: y + 70, ancho: 150, alto: 32 },
  { texto: `${destino} .`, x: 10, y: y + 140, ancho: 300, alto: 32 },
  { texto: "VALOR $ FORMA PAGO DD", x: 10, y: y + 210, ancho: 380, alto: 32 },
  { texto: "0 CTAC 0", x: 10, y: y + 280, ancho: 120, alto: 32 },
];
const barrerCuadros = (cuadros) => cuadros.reduce((v, renglones) => sumarCuadroAlBarrido(v, renglones), { porFilas: votosNominaVacios(), comoLlegan: votosNominaVacios() });

test("una OF por confirmar que solo salió en el lugar de otra firme es un fantasma: se va y apunta a ella", () => {
  const [a, b, c, g] = ["270000101", "270000202", "270000303", "281999777"];
  const normal = [...encargo(a, 100), ...encargo(b, 660, "BOLOGNESI 300"), ...encargo(c, 1220, "MAIPU 700")];
  // Dos cuadros en que la fila de B se leyó como otro número (4 dígitos distintos).
  const movido = [...encargo(a, 100), ...encargo(g, 660, "BOLOGNESI 300"), ...encargo(c, 1220, "MAIPU 700")];
  const votos = barrerCuadros([normal, normal, normal, movido, movido, normal]);
  const r = resultadoDelBarrido(votos);
  assert.ok(r.lista.some((l) => l.of === g && l.estado !== "firme"), "sin botar fantasmas, la mala lectura queda por confirmar");
  const { resultado, fantasmas } = sinFantasmas(r, elegirVotosDelBarrido(votos));
  assert.equal(fantasmas, 1);
  assert.deepEqual(resultado.lista.map((l) => l.of), [a, b, c]);
  assert.equal(resultado.deLectura[g], b);
  assert.equal(resultadoDelBarrido(votos, { fantasmas: true }).lista.length, 3);
});

test("una OF de verdad entre dos firmes no es fantasma: entre ellas cabía otra", () => {
  const [a, x, b, c] = ["270000101", "281999777", "270000202", "270000303"];
  // Con las tres, X va a un encargo de A y B a dos. Sin la fila de X (ML Kit no la leyó), A y B
  // siguen a dos alturas de encargo: hay lugar para X.
  const tres = [...encargo(a, 100), ...encargo(x, 660, "MAIPU 700"), ...encargo(b, 1220, "BOLOGNESI 300")];
  const sinX = [...encargo(a, 100), ...encargo(b, 1220, "BOLOGNESI 300")];
  const bc = [...encargo(b, 100, "BOLOGNESI 300"), ...encargo(c, 660, "COLON 600")];
  const votos = barrerCuadros([tres, tres, sinX, sinX, bc, bc, bc]);
  const r = resultadoDelBarrido(votos);
  assert.ok(r.lista.some((l) => l.of === x && l.estado !== "firme"));
  assert.equal(sinFantasmas(r, elegirVotosDelBarrido(votos)).fantasmas, 0);
});
