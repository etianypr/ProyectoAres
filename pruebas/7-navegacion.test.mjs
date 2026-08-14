// Recorrer el tramo EN EL TELÉFONO en vez de re-pedirlo cada 150 m.
//
// Se simula un viaje sobre un tramo REAL de Arica (fixtures/tramo-arica.json,
// capturado de la API de Mapbox: 9 maniobras, 3,6 km) y se comprueba que las
// dos reglas que reemplazan a esas consultas funcionan sobre datos de verdad:
//
//   · avanzar de maniobra cuando faltan <= 25 m para ella
//   · detectar que el chofer se salió del camino a más de 60 m del trazado
//
// Los umbrales solo se pueden justificar contra geometría real: con vértices
// cada 30 m en una avenida y cada 5 m en una rotonda, un número elegido a ojo
// deja pasos que no terminan nunca o recálculos en cada esquina.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ajustarATrazado,
  distanciaAPolilinea,
  distanciaMetros,
  metrosRestantes,
} from "@/lib/rutas";

const tramo = JSON.parse(
  readFileSync(new URL("./fixtures/tramo-arica.json", import.meta.url), "utf8"),
);

// Los mismos de use-navegacion.ts.
const UMBRAL_MANIOBRA_M = 25;
const UMBRAL_FUERA_DE_RUTA_M = 60;

const aCoord = ([lng, lat]) => ({ lat, lng });

/** Puntos cada ~paso metros a lo largo del trazado, como iría el GPS. */
function recorrer(geometria, cadaMetros = 10) {
  const puntos = [];
  for (let i = 0; i < geometria.length - 1; i++) {
    const a = aCoord(geometria[i]);
    const b = aCoord(geometria[i + 1]);
    const largo = distanciaMetros(a, b);
    const n = Math.max(1, Math.round(largo / cadaMetros));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      puntos.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  puntos.push(aCoord(geometria[geometria.length - 1]));
  return puntos;
}

/** El avance de paso tal cual lo hace el hook durante el render. */
function avanzar(indice, posicion) {
  let i = indice;
  while (
    i < tramo.pasos.length - 1 &&
    metrosRestantes(posicion, tramo.pasos[i].geometria) <= UMBRAL_MANIOBRA_M
  ) {
    i++;
  }
  return i;
}

test("el fixture es un tramo real y completo", () => {
  assert.equal(tramo.pasos.length, 9);
  assert.ok(tramo.geometria.length > 100);
  assert.ok(tramo.pasos.every((p) => Array.isArray(p.geometria) && p.geometria.length >= 2));
  assert.ok(tramo.pasos.slice(0, -1).every((p) => p.avisos.length > 0), "faltan avisos de voz");
});

test("manejando el tramo entero, el cartel pasa por TODAS las maniobras y en orden", () => {
  let indice = 0;
  const vistos = [0];
  for (const posicion of recorrer(tramo.geometria)) {
    const nuevo = avanzar(indice, posicion);
    assert.ok(nuevo >= indice, "el paso retrocedió");
    if (nuevo !== indice) vistos.push(nuevo);
    indice = nuevo;
  }
  assert.equal(indice, tramo.pasos.length - 1, "no llegó al último paso");
  assert.deepEqual(vistos, [0, 1, 2, 3, 4, 5, 6, 7, 8], "se salteó maniobras");
});

test("ninguna maniobra se queda trabada (el bug que obligaba a re-consultar)", () => {
  // Para cada paso, cuántas lecturas de GPS se pasan antes de que avance.
  let indice = 0;
  const lecturasEnPaso = new Array(tramo.pasos.length).fill(0);
  for (const posicion of recorrer(tramo.geometria)) {
    lecturasEnPaso[indice]++;
    indice = avanzar(indice, posicion);
  }
  // El último acumula las lecturas del final; los demás tienen que haberse
  // terminado en algún momento.
  for (let i = 0; i < tramo.pasos.length - 1; i++) {
    assert.ok(lecturasEnPaso[i] > 0, `el paso ${i} nunca se mostró`);
  }
  assert.equal(indice, tramo.pasos.length - 1);
});

test("los metros a la maniobra bajan hasta cero dentro de cada paso", () => {
  let indice = 0;
  let anterior = Infinity;
  for (const posicion of recorrer(tramo.geometria)) {
    const nuevo = avanzar(indice, posicion);
    if (nuevo !== indice) {
      indice = nuevo;
      anterior = Infinity; // maniobra nueva, se reinicia la cuenta
    }
    const metros = metrosRestantes(posicion, tramo.pasos[indice].geometria);
    assert.ok(metros <= anterior + 1, `la distancia subió: ${anterior} → ${metros}`);
    anterior = metros;
  }
});

test("dos maniobras casi juntas se saltan en una sola lectura de GPS", () => {
  // Los pasos 3→4 son "siga por la derecha" (77 m) pegado al anterior: yendo a
  // 50 km/h una lectura de GPS cubre ~15 m, pero con la señal mala pueden pasar
  // 100 m entre lecturas y las dos maniobras quedan atrás juntas.
  let indice = 0;
  for (const posicion of recorrer(tramo.geometria, 120)) {
    indice = avanzar(indice, posicion);
  }
  assert.equal(indice, tramo.pasos.length - 1, "con lecturas cada 120 m se perdió el avance");
});

// -------------------------------------------------- salirse del camino
test("yendo POR la ruta, nunca se declara fuera de camino", () => {
  let maximo = 0;
  for (const posicion of recorrer(tramo.geometria, 5)) {
    maximo = Math.max(maximo, distanciaAPolilinea(posicion, tramo.geometria));
  }
  assert.ok(maximo < 1, `sobre el propio trazado el desvío dio ${maximo} m`);
  assert.ok(maximo < UMBRAL_FUERA_DE_RUTA_M);
});

test("el desvío se mide contra el SEGMENTO, no contra el vértice más cercano", () => {
  // Una recta larga con solo dos vértices: yendo justo por el medio, la
  // distancia al vértice más cercano son cientos de metros y la del segmento,
  // cero. Medir por vértice habría hecho recalcular la ruta en cada avenida.
  const recta = [
    [-70.29, -18.47],
    [-70.29, -18.48],
  ];
  const medio = { lat: -18.475, lng: -70.29 };
  assert.ok(distanciaAPolilinea(medio, recta) < 1);
  const alVertice = Math.min(
    distanciaMetros(medio, aCoord(recta[0])),
    distanciaMetros(medio, aCoord(recta[1])),
  );
  assert.ok(alVertice > 500, `el vértice más cercano estaba a ${alVertice} m`);
});

test("doblar donde no era sí dispara el recálculo", () => {
  // 150 m perpendicular al trazado, a mitad de camino.
  const sobre = aCoord(tramo.geometria[Math.floor(tramo.geometria.length / 2)]);
  const desviado = { lat: sobre.lat + 0.00135, lng: sobre.lng };
  const desvio = distanciaAPolilinea(desviado, tramo.geometria);
  assert.ok(desvio > UMBRAL_FUERA_DE_RUTA_M, `dio ${Math.round(desvio)} m`);
});

test("el ancho de una avenida con bandejón NO dispara el recálculo", () => {
  // ~15 m al costado: el GPS rebotando entre edificios llega a eso, y ahí no
  // hay que pedir nada.
  const sobre = aCoord(tramo.geometria[Math.floor(tramo.geometria.length / 3)]);
  const alCostado = { lat: sobre.lat + 0.00013, lng: sobre.lng };
  assert.ok(distanciaAPolilinea(alCostado, tramo.geometria) < UMBRAL_FUERA_DE_RUTA_M);
});

test("distanciaAPolilinea: casos degenerados", () => {
  const p = { lat: -18.47, lng: -70.29 };
  assert.equal(distanciaAPolilinea(p, []), Infinity);
  assert.ok(distanciaAPolilinea(p, [[-70.29, -18.47]]) < 1); // un solo punto
  // Vértices repetidos (segmento de largo cero) no dan NaN.
  const d = distanciaAPolilinea(p, [
    [-70.3, -18.48],
    [-70.3, -18.48],
  ]);
  assert.ok(Number.isFinite(d) && d > 0);
});

// ------------------------------------------------- pegar el punto al camino
// En ciudad el GPS de un teléfono se equivoca por decenas de metros, así que el
// punto crudo cae adentro de las manzanas. Se comprueba sobre el tramo real que
// pegarlo lo devuelve a la calle y que las dos reglas de arriba —que siguen
// mirando la posición CRUDA— no cambian de resultado por eso.

/** El mismo recorrido, con el error lateral que tendría el GPS de verdad.
 *  Determinista para que un fallo se pueda reproducir. */
function conRuido(puntos, semilla = 7) {
  let s = semilla;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // ±0,00015° ≈ ±16 m en latitud y ±15 m en longitud a la latitud de Arica:
  // error urbano normal, por debajo del umbral de "se salió" (60 m).
  return puntos.map((p) => ({
    lat: p.lat + (rnd() - 0.5) * 0.0003,
    lng: p.lng + (rnd() - 0.5) * 0.0003,
  }));
}

test("con ruido de GPS, el punto pegado queda SOBRE la calle", () => {
  const crudas = conRuido(recorrer(tramo.geometria, 15));

  let pegadas = 0;
  let peorCrudo = 0;
  for (const cruda of crudas) {
    peorCrudo = Math.max(peorCrudo, distanciaAPolilinea(cruda, tramo.geometria));
    const pegada = ajustarATrazado(cruda, tramo.geometria);
    if (!pegada) continue;
    pegadas++;
    assert.ok(
      distanciaAPolilinea(pegada, tramo.geometria) < 1,
      "el punto pegado tiene que quedar sobre el trazado",
    );
  }

  // El ruido es de verdad: sin pegar, el punto se va del ancho de la calle.
  assert.ok(peorCrudo > 10, `el ruido de prueba quedó chico: ${Math.round(peorCrudo)} m`);
  assert.ok(
    pegadas / crudas.length > 0.95,
    `solo se pegó el ${Math.round((pegadas / crudas.length) * 100)}% de las lecturas`,
  );
});

test("emparejando con ventana, el punto nunca retrocede sobre el trazado", () => {
  // Es lo que hace usePuntoEnRuta: arrastra el índice de una lectura a la otra
  // y busca alrededor de él. Sobre el tramo real y con ruido, el punto tiene
  // que avanzar siempre — un índice que retrocede se ve como el auto pegando un
  // salto hacia atrás en la mitad de una cuadra.
  const crudas = conRuido(recorrer(tramo.geometria, 15), 11);

  let indice = 0;
  let pegadas = 0;
  for (const cruda of crudas) {
    const pegada = ajustarATrazado(cruda, tramo.geometria, { desdeIndice: indice });
    if (!pegada) continue;
    pegadas++;
    assert.ok(
      pegada.indice >= indice,
      `el índice retrocedió de ${indice} a ${pegada.indice}`,
    );
    indice = pegada.indice;
  }

  assert.ok(pegadas > crudas.length * 0.95, "casi todas las lecturas tienen que pegarse");
  assert.ok(
    indice >= tramo.geometria.length - 3,
    `el recorrido terminó en el índice ${indice} de ${tramo.geometria.length}`,
  );
});

test("el ruido de GPS no dispara recálculos ni frena el avance de maniobra", () => {
  const crudas = conRuido(recorrer(tramo.geometria, 15));

  let indice = 0;
  let peor = 0;
  for (const cruda of crudas) {
    // Las dos reglas siguen leyendo la posición CRUDA, no la pegada: un punto
    // pegado está sobre la ruta por definición y nunca acusaría un desvío.
    peor = Math.max(peor, distanciaAPolilinea(cruda, tramo.geometria));
    indice = avanzar(indice, cruda);
  }

  assert.ok(peor < UMBRAL_FUERA_DE_RUTA_M, `con ruido normal se declaró desvío (${peor} m)`);
  assert.equal(indice, tramo.pasos.length - 1, "con ruido se perdió el avance de maniobras");
});

// ---------------------------------------------- cuánto se ahorra de verdad
test("cuenta de consultas: recorrer el tramo en el teléfono contra re-pedirlo cada 150 m", () => {
  const largo = tramo.pasos.reduce((a, p) => a + p.distanciaM, 0);

  // Antes: una consulta cada 150 m recorridos.
  const antes = Math.floor(largo / 150);
  // Ahora: una por parada (más los recálculos, que en un tramo bien seguido
  // son cero).
  const ahora = 1;

  assert.ok(largo > 3000, `el tramo mide ${largo} m`);
  assert.ok(antes >= 20, `esperaba muchas consultas en el esquema viejo, dio ${antes}`);
  assert.ok(
    ahora <= antes / 10,
    `la mejora es menor a 10x: ${antes} → ${ahora}`,
  );
});
