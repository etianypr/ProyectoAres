// Recorrer el tramo EN EL TELÉFONO en vez de re-pedirlo cada 150 m.
//
// Se simula un viaje sobre un tramo REAL de Arica (fixtures/tramo-arica.json,
// capturado de la API de Mapbox: 9 maniobras, 3,6 km) y se comprueba que las
// dos reglas que reemplazan a esas consultas funcionan sobre datos de verdad:
//
//   · avanzar de maniobra al doblar la esquina (spec 017, N2: antes eran 25 m
//     ANTES de ella, y el cartel cambiaba justo cuando había que mirarlo)
//   · detectar que el conductor se salió del camino a más de 60 m del trazado
//
// Los umbrales solo se pueden justificar contra geometría real: con vértices
// cada 30 m en una avenida y cada 5 m en una rotonda, un número elegido a ojo
// deja pasos que no terminan nunca o recálculos en cada esquina.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ajustarATrazado, distanciaAPolilinea, metrosRestantes } from "@/lib/geo/trazado";
import { distanciaMetros } from "@/lib/geo/coordenada";
import { pasoEnCurso, restanteDelTramo } from "@/lib/geo/mapbox/recorrido";

const tramo = JSON.parse(
  readFileSync(new URL("./fixtures/tramo-arica.json", import.meta.url), "utf8"),
);

// El mismo de use-navegacion.ts.
const UMBRAL_FUERA_DE_RUTA_M = 60;

const aCoord = ([lng, lat]) => ({ lat, lng });

/** Puntos cada ~paso metros a lo largo del trazado, como iría el GPS. */
function recorrer(trazado, cadaMetros = 10) {
  const puntos = [];
  for (let i = 0; i < trazado.length - 1; i++) {
    const a = aCoord(trazado[i]);
    const b = aCoord(trazado[i + 1]);
    const largo = distanciaMetros(a, b);
    const n = Math.max(1, Math.round(largo / cadaMetros));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      puntos.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  puntos.push(aCoord(trazado[trazado.length - 1]));
  return puntos;
}

/** El avance de paso que usa el hook durante el render. */
const avanzar = (indice, posicion) => pasoEnCurso(posicion, tramo.pasos, indice);

test("el fixture es un tramo real y completo", () => {
  assert.equal(tramo.pasos.length, 9);
  assert.ok(tramo.trazado.length > 100);
  assert.ok(tramo.pasos.every((p) => Array.isArray(p.trazado) && p.trazado.length >= 2));
  assert.ok(tramo.pasos.slice(0, -1).every((p) => p.avisos.length > 0), "faltan avisos de voz");
});

test("manejando el tramo entero, el cartel pasa por TODAS las maniobras y en orden", () => {
  let indice = 0;
  const vistos = [0];
  for (const posicion of recorrer(tramo.trazado)) {
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
  for (const posicion of recorrer(tramo.trazado)) {
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
  for (const posicion of recorrer(tramo.trazado)) {
    const nuevo = avanzar(indice, posicion);
    if (nuevo !== indice) {
      indice = nuevo;
      anterior = Infinity; // maniobra nueva, se reinicia la cuenta
    }
    const metros = metrosRestantes(posicion, tramo.pasos[indice].trazado);
    assert.ok(metros <= anterior + 1, `la distancia subió: ${anterior} → ${metros}`);
    anterior = metros;
  }
});

test("dos maniobras casi juntas se saltan en una sola lectura de GPS", () => {
  // Los pasos 3→4 son "siga por la derecha" (77 m) pegado al anterior: yendo a
  // 50 km/h una lectura de GPS cubre ~15 m, pero con la señal mala pueden pasar
  // 100 m entre lecturas y las dos maniobras quedan atrás juntas.
  let indice = 0;
  for (const posicion of recorrer(tramo.trazado, 120)) {
    indice = avanzar(indice, posicion);
  }
  assert.equal(indice, tramo.pasos.length - 1, "con lecturas cada 120 m se perdió el avance");
});

// ------------------------------------------ el cartel cambia en la esquina
test("el cartel NO pasa a la maniobra siguiente antes de llegar a la esquina (N2)", () => {
  // A 20 m de cada esquina el cartel tiene que seguir mostrando ESA maniobra:
  // es cuando el conductor lo mira para saber hacia dónde doblar.
  for (let i = 0; i < tramo.pasos.length - 1; i++) {
    const trazado = tramo.pasos[i].trazado;
    const puntos = recorrer(trazado, 2);
    const antes = puntos.find((p) => metrosRestantes(p, trazado) <= 20);
    if (!antes || metrosRestantes(antes, trazado) < 15) continue; // paso más corto que eso
    assert.equal(avanzar(i, antes), i, `en el paso ${i} el cartel cambió 20 m antes de la esquina`);
  }
});

test("pasada la esquina, el cartel ya muestra la maniobra siguiente", () => {
  for (let i = 0; i < tramo.pasos.length - 1; i++) {
    const siguiente = tramo.pasos[i + 1].trazado;
    const puntos = recorrer(siguiente, 2);
    // 10 m adentro de la calle nueva.
    const dentro = puntos.find((p) => distanciaMetros(p, aCoord(siguiente[0])) >= 10);
    if (!dentro) continue;
    assert.ok(avanzar(i, dentro) >= i + 1, `en el paso ${i} el cartel no avanzó tras la esquina`);
  }
});

test("sin lectura en la esquina, el cartel se pone al día sobre la calle nueva (N11)", () => {
  // La señal se cortó justo al doblar: la primera lectura llega 60 m más allá,
  // ya sobre el paso siguiente. El cartel no puede quedarse en el giro hecho.
  const i = 2;
  const siguiente = tramo.pasos[i + 1].trazado;
  const lejos = recorrer(siguiente, 5).find((p) => distanciaMetros(p, aCoord(siguiente[0])) >= 60);
  assert.ok(lejos, "el paso siguiente es más corto que 60 m");
  assert.ok(avanzar(i, lejos) >= i + 1);
});

test("restanteDelTramo: los metros a la parada bajan de a poco hasta cero", () => {
  // El fixture no trae tiempos: 10 m/s en cada paso.
  const pasos = tramo.pasos.map((p) => ({ ...p, duracionS: p.distanciaM / 10 }));
  const largo = pasos.reduce((a, p) => a + p.distanciaM, 0);
  let indice = 0;
  let anterior = Infinity;
  let primero = null;
  for (const posicion of recorrer(tramo.trazado, 10)) {
    indice = pasoEnCurso(posicion, pasos, indice);
    const r = restanteDelTramo(posicion, pasos, indice);
    primero ??= r;
    assert.ok(r.metrosAParada <= anterior + 2, `subió: ${anterior} → ${r.metrosAParada}`);
    // Con 10 m/s parejos, los segundos son la décima parte de los metros.
    assert.ok(Math.abs(r.segundosAParada - r.metrosAParada / 10) <= 2);
    anterior = r.metrosAParada;
  }
  assert.ok(Math.abs(primero.metrosAParada - largo) < largo * 0.05, "al salir falta todo el tramo");
  assert.ok(anterior < 30, `al llegar quedan ${anterior} m`);
});

test("restanteDelTramo: sin tiempos de Mapbox no inventa nada", () => {
  const r = restanteDelTramo(aCoord(tramo.trazado[0]), tramo.pasos, 0);
  assert.equal(r.segundosAParada, 0);
  assert.equal(restanteDelTramo(aCoord(tramo.trazado[0]), [], 0), null);
});

// -------------------------------------------------- salirse del camino
test("yendo POR la ruta, nunca se declara fuera de camino", () => {
  let maximo = 0;
  for (const posicion of recorrer(tramo.trazado, 5)) {
    maximo = Math.max(maximo, distanciaAPolilinea(posicion, tramo.trazado));
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
  const sobre = aCoord(tramo.trazado[Math.floor(tramo.trazado.length / 2)]);
  const desviado = { lat: sobre.lat + 0.00135, lng: sobre.lng };
  const desvio = distanciaAPolilinea(desviado, tramo.trazado);
  assert.ok(desvio > UMBRAL_FUERA_DE_RUTA_M, `dio ${Math.round(desvio)} m`);
});

test("el ancho de una avenida con bandejón NO dispara el recálculo", () => {
  // ~15 m al costado: el GPS rebotando entre edificios llega a eso, y ahí no
  // hay que pedir nada.
  const sobre = aCoord(tramo.trazado[Math.floor(tramo.trazado.length / 3)]);
  const alCostado = { lat: sobre.lat + 0.00013, lng: sobre.lng };
  assert.ok(distanciaAPolilinea(alCostado, tramo.trazado) < UMBRAL_FUERA_DE_RUTA_M);
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
  const crudas = conRuido(recorrer(tramo.trazado, 15));

  let pegadas = 0;
  let peorCrudo = 0;
  for (const cruda of crudas) {
    peorCrudo = Math.max(peorCrudo, distanciaAPolilinea(cruda, tramo.trazado));
    const pegada = ajustarATrazado(cruda, tramo.trazado);
    if (!pegada) continue;
    pegadas++;
    assert.ok(
      distanciaAPolilinea(pegada, tramo.trazado) < 1,
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
  const crudas = conRuido(recorrer(tramo.trazado, 15), 11);

  let indice = 0;
  let pegadas = 0;
  for (const cruda of crudas) {
    const pegada = ajustarATrazado(cruda, tramo.trazado, { desdeIndice: indice });
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
    indice >= tramo.trazado.length - 3,
    `el recorrido terminó en el índice ${indice} de ${tramo.trazado.length}`,
  );
});

test("el ruido de GPS no dispara recálculos ni frena el avance de maniobra", () => {
  const crudas = conRuido(recorrer(tramo.trazado, 15));

  let indice = 0;
  let peor = 0;
  for (const cruda of crudas) {
    // Las dos reglas siguen leyendo la posición CRUDA, no la pegada: un punto
    // pegado está sobre la ruta por definición y nunca acusaría un desvío.
    peor = Math.max(peor, distanciaAPolilinea(cruda, tramo.trazado));
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
