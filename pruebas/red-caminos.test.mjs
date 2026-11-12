// Spec 031: el motor de rutas propio, en redes de juguete. Lo que se prueba son las
// reglas de la calle: sentido único, dónde se puede dar la vuelta en U y dónde no,
// salir en reversa de un pasaje sin salida, restricciones de giro, barreras,
// portones y calles privadas; y que la matriz con rumbo mida saliendo y llegando
// en el sentido que dice.
//
// La grilla de 3 × 3 cruces (cuadras de ~105 m de oeste a este y ~111 m de norte a sur):
//
//     0 — 1 — 2
//     |   |   |
//     3 — 4 — 5
//     |   |   |
//     6 — 7 — 8
import test from "node:test";
import assert from "node:assert/strict";
import { arcoValido } from "@/lib/geo/red/grafo";
import { pegarALaRed } from "@/lib/geo/red/pegar";
import { matrizConRumbo } from "@/lib/geo/red/matriz-con-rumbo";
import { MANIOBRA_REVERSA_S, MANIOBRA_U_S, PORTON_S } from "@/lib/geo/red/tiempos";
import { CUADRA, en, grilla, PRIVADA, RESIDENCIAL, SECUNDARIA, SIN_PARADA, UN_SENTIDO } from "./red-de-juguete.mjs";

const H = 105.46; // una cuadra de oeste a este, en metros
const V = 111.19; // una cuadra de norte a sur
const cerca = (real, esperado, margen = 1.5) => assert.ok(Math.abs(real - esperado) <= margen, `${real.toFixed(1)} m y no ${esperado.toFixed(1)} m`);

/** Lo que mide la matriz de un estado a otro: lugar y sentido (0 hacia el nodo
 *  `hasta` de su arista, 1 hacia `desde`; sin sentido en un lugar libre). */
function medir(m, desde, hasta) {
  const estado = ([lugar, sentido]) => m.estadosDe[lugar].find((e) => sentido == null || m.sentidoDe[e] === sentido);
  const [a, b] = [estado(desde), estado(hasta)];
  return { metros: m.metros[a * m.n + b], segundos: m.segundos[a * m.n + b] };
}

test("pegarALaRed: la calle más cercana, en qué parte de ella, y nunca una donde no se para", () => {
  const { red, arista } = grilla(3, 3);
  // 11 m al norte de la mitad de la calle 3—4.
  const p = pegarALaRed(red, { lat: en(1, 0.5).lat + CUADRA / 10, lng: en(1, 0.5).lng });
  assert.equal(p.arista, arista(3, 4));
  cerca(p.fraccion * 100, 50, 1);
  cerca(p.metros, 11.1, 0.5);
  assert.equal(pegarALaRed(red, { lat: -18.6, lng: -70.3 }), null, "a 14 km de toda calle no hay dónde pegarse");

  const conEnlace = grilla(3, 3, { cambios: { "3-4": RESIDENCIAL | SIN_PARADA } });
  const q = pegarALaRed(conEnlace.red, { lat: en(1, 0.5).lat + CUADRA / 10, lng: en(1, 0.5).lng });
  assert.notEqual(q.arista, conEnlace.arista(3, 4), "un enlace no es lugar para detenerse");
});

test("sentido único: contra el tránsito no se pasa, y la matriz no es simétrica", () => {
  // La calle 1—4 solo se recorre de 1 a 4.
  const { red, arista } = grilla(3, 3, { cambios: { "1-4": RESIDENCIAL | UN_SENTIDO } });
  assert.equal(arcoValido(red, 2 * arista(1, 4)), true);
  assert.equal(arcoValido(red, 2 * arista(1, 4) + 1), false);
  const m = matrizConRumbo(red, [
    { arista: arista(3, 4), fraccion: 0.5, libre: true },
    { arista: arista(1, 2), fraccion: 0.5, libre: true },
  ]);
  // De 3—4 a 1—2 hay que dar la vuelta por 5 y 2; al volver se baja por 1—4.
  cerca(medir(m, [0], [1]).metros, H / 2 + H + V + H / 2);
  cerca(medir(m, [1], [0]).metros, H / 2 + V + H / 2);
  // Una parada en la calle de un sentido tiene un solo estado.
  const n = matrizConRumbo(red, [{ arista: arista(1, 4), fraccion: 0.5 }, { arista: arista(3, 4), fraccion: 0.5 }]);
  assert.deepEqual(n.estadosDe.map((e) => e.length), [1, 2]);
});

test("calle angosta: no se gira en U; para volver a la casa de atrás hay que dar la vuelta a la manzana", () => {
  const { red, arista } = grilla(3, 3);
  // P y Q en la misma cuadra 3—4: P más cerca de 4, Q más cerca de 3.
  const lugares = [
    { arista: arista(3, 4), fraccion: 0.75 },
    { arista: arista(3, 4), fraccion: 0.25 },
  ];
  const m = matrizConRumbo(red, lugares);
  // El auto pasó por P hacia 4. A Q llega de frente dando la vuelta por 1, 0 y 3…
  cerca(medir(m, [0, 0], [1, 0]).metros, H / 4 + V + H + V + H / 4);
  // …o, para llegar a Q mirando hacia 3, rodeando la otra manzana (4, 1, 2, 5, 4).
  cerca(medir(m, [0, 0], [1, 1]).metros, H / 4 + (V + H + V + H) + 0.75 * H);
  // Si pasó por P hacia 3, Q le queda adelante.
  cerca(medir(m, [0, 1], [1, 1]).metros, H / 2);
  // Como mide una matriz de ORS (sin rumbo): media cuadra para atrás, como si girara en U gratis.
  const libre = matrizConRumbo(red, lugares, { libre: true });
  cerca(medir(libre, [0], [1]).metros, H / 2);
});

test("calle ancha de doble sentido: se gira en U pagando la maniobra", () => {
  const { red, arista } = grilla(3, 3, { cambios: { "3-4": SECUNDARIA } });
  const m = matrizConRumbo(red, [
    { arista: arista(3, 4), fraccion: 0.75 },
    { arista: arista(3, 4), fraccion: 0.25 },
  ]);
  const vuelta = medir(m, [0, 0], [1, 1]);
  cerca(vuelta.metros, H / 2);
  assert.ok(vuelta.segundos >= MANIOBRA_U_S && vuelta.segundos < MANIOBRA_U_S + 8, `${vuelta.segundos} s`);
});

test("pasaje sin salida: se sale en reversa, pagando la maniobra", () => {
  // Un pasaje que cuelga del cruce 5 hacia el este y termina ahí (nodo 9).
  const { red, arista } = grilla(3, 3, { extra: { nodos: [en(1, 3)], aristas: [[5, 9]] } });
  assert.equal(red.sinSalida[arista(5, 9)], 1);
  assert.equal(red.sinSalida[arista(4, 5)], 0);
  const m = matrizConRumbo(red, [
    { arista: arista(5, 9), fraccion: 0.5 },
    { arista: arista(4, 5), fraccion: 0.5 },
  ]);
  // Entró al pasaje hacia el fondo y la parada siguiente queda afuera: media cuadra en reversa.
  const sale = medir(m, [0, 0], [1, 1]);
  cerca(sale.metros, H / 2 + H / 2);
  assert.ok(sale.segundos >= MANIOBRA_REVERSA_S, `${sale.segundos} s`);
});

test("restricción de giro: «no doblar a la izquierda» obliga a otro camino", () => {
  // Viniendo por 3—4 hacia 4 no se puede doblar a 4—1.
  const sin = grilla(3, 3);
  const con = grilla(3, 3, { extra: { giros: [[[3, 4], 4, [1, 4], 0]] } });
  const lugares = (g) => [
    { arista: g.arista(3, 4), fraccion: 0.5 },
    { arista: g.arista(1, 2), fraccion: 0.5 },
  ];
  cerca(medir(matrizConRumbo(sin.red, lugares(sin)), [0, 0], [1, 0]).metros, H / 2 + V + H / 2);
  // Con la restricción: sigue derecho a 5, sube a 2 y llega a 1—2 desde el este.
  cerca(medir(matrizConRumbo(con.red, lugares(con)), [0, 0], [1, 1]).metros, H / 2 + H + V + H / 2);
  // ORS no mira las restricciones en su matriz: en modo libre se dobla igual.
  cerca(medir(matrizConRumbo(con.red, lugares(con), { libre: true }), [0], [1]).metros, H / 2 + V + H / 2);
});

test("barrera: por el cruce cerrado no se pasa; por un portón privado sí, esperando", () => {
  const lugares = (g) => [
    { arista: g.arista(3, 4), fraccion: 0.5 },
    { arista: g.arista(4, 5), fraccion: 0.5 },
  ];
  const rodeo = H / 2 + V + H + H + V + H / 2;
  const cerrada = grilla(3, 3, { extra: { cerrados: [4] } });
  // Hacia el oeste rodea por 0, 1 y 2. Hacia la barrera, sale en reversa y rodea igual.
  cerca(medir(matrizConRumbo(cerrada.red, lugares(cerrada)), [0, 1], [1, 1]).metros, rodeo);
  const deFrente = medir(matrizConRumbo(cerrada.red, lugares(cerrada)), [0, 0], [1, 1]);
  cerca(deFrente.metros, rodeo);
  assert.ok(deFrente.segundos >= MANIOBRA_REVERSA_S);

  const porton = grilla(3, 3, { extra: { portones: [4] } });
  const pasa = medir(matrizConRumbo(porton.red, lugares(porton)), [0, 0], [1, 0]);
  cerca(pasa.metros, H);
  assert.ok(pasa.segundos >= PORTON_S, `${pasa.segundos} s`);
  // Para ORS un portón privado está cerrado.
  cerca(medir(matrizConRumbo(porton.red, lugares(porton), { libre: true }), [0], [1]).metros, rodeo);
});

test("calle privada: sirve para llegar a una parada, no para acortar camino", () => {
  const { red, arista } = grilla(3, 3, { cambios: { "4-5": RESIDENCIAL | PRIVADA } });
  const m = matrizConRumbo(red, [
    { arista: arista(3, 4), fraccion: 0.5 },
    { arista: arista(5, 8), fraccion: 0.5 },
    { arista: arista(4, 5), fraccion: 0.5 },
  ]);
  // De 3—4 a 5—8 no corta por la privada 4—5: baja a 7 y va por 8.
  cerca(medir(m, [0, 0], [1, 1]).metros, H / 2 + V + H + V / 2);
  // Pero a la parada que está en la privada sí entra.
  cerca(medir(m, [0, 0], [2, 0]).metros, H / 2 + H / 2);
});

test("matrizConRumbo: la central tiene un solo estado, y de un estado a sí mismo no hay camino que medir", () => {
  const { red, arista } = grilla(3, 3);
  const m = matrizConRumbo(red, [
    { arista: arista(0, 1), fraccion: 0.5, libre: true },
    { arista: arista(4, 5), fraccion: 0.5 },
  ]);
  assert.deepEqual(m.estadosDe, [[0], [1, 2]]);
  assert.deepEqual([...m.sentidoDe], [-1, 0, 1]);
  assert.equal(m.metros[0], 0);
  // De la central se sale hacia donde convenga, y a ella se llega igual.
  cerca(medir(m, [0], [1, 0]).metros, H / 2 + V + H / 2);
  // Volver a ella depende de hacia dónde quedó apuntando el auto en la parada:
  // mirando al oeste sube por 4 y 1; mirando al este tiene que rodear por 5 y 2.
  cerca(medir(m, [1, 1], [0]).metros, H / 2 + V + H / 2);
  cerca(medir(m, [1, 0], [0]).metros, H / 2 + V + H + H / 2);
});
