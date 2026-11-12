// Mide el armado de la ruta con la red de calles propia (spec 031), sin red y sin
// datos de nadie: los puntos son los del fixture (al azar sobre calles de Arica).
//
//   npm run medir          el día de 80 paradas
//   npm run medir -- 40    las primeras 40
//
// Dice los «km en el aire»: lo que creía medir el orden de antes (de punto a punto,
// girando en U gratis), lo que ese orden cuesta de verdad con rumbo, y lo que
// cuesta el orden buscado con rumbo. Para comparar un cambio: correrlo antes y después.
import { readFileSync } from "node:fs";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { matrizDeCosto, pesosDeManejar } from "@/lib/encomiendas/local/generar-ruta/pesos";
import { medirConRumbo, ordenarConRumboDelDia, prepararRedDelDia } from "@/lib/encomiendas/local/generar-ruta/red-del-dia";
import { rutaPorLaRed } from "@/lib/geo/ruta-por-calles";

const DIA = JSON.parse(readFileSync(new URL("../pruebas/fixtures/matriz-tiempo-arica.json", import.meta.url), "utf8"));
const cuantas = Math.min(DIA.puntos.length - 1, Number(process.argv[2] ?? DIA.puntos.length - 1));
const puntos = DIA.puntos.slice(0, cuantas + 1);
const reloj = () => performance.now();
const km = (m) => `${(m / 1000).toFixed(2)} km`;

let t = reloj();
const red = await prepararRedDelDia(puntos, false);
if (!red) throw new Error("no se pudo pegar algún punto a la red");
const msMatriz = reloj() - t;

// El orden de antes: a fondo, sobre la matriz de punto a punto.
const costo = matrizDeCosto(red.metros, red.segundos);
t = reloj();
const antes = ordenarParadas(puntos, costo, (i) => costo[i][0], true, { arranquePorMetros: { matriz: red.metros, vuelta: (i) => red.metros[i][0] } }).slice(1);
const msAntes = reloj() - t;
const creia = [0, ...antes, 0].reduce((s, p, k, o) => (k === 0 ? 0 : s + red.metros[o[k - 1]][p]), 0);
const antesConRumbo = medirConRumbo(red, antes);

t = reloj();
const rapido = ordenarParadas(puntos, costo, (i) => costo[i][0], false).slice(1);
const nuevo = await ordenarConRumboDelDia(red, rapido, puntos.map(() => 1));
const msNuevo = reloj() - t;
const nuevoConRumbo = medirConRumbo(red, nuevo);

t = reloj();
const ruta = await rutaPorLaRed([puntos[0], ...nuevo.map((i) => puntos[i]), puntos[0]], pesosDeManejar);
const msTrazado = reloj() - t;

console.log(`${cuantas} paradas`);
console.log(`orden de antes (sin rumbo, ${msAntes.toFixed(0)} ms): creía ${km(creia)}; con rumbo son ${km(antesConRumbo.metros)} ($${Math.round(antesConRumbo.pesos)})`);
console.log(`  en el aire: ${km(antesConRumbo.metros - creia)} (+${((antesConRumbo.metros / creia - 1) * 100).toFixed(1)} %)`);
console.log(`orden con rumbo (${msNuevo.toFixed(0)} ms): ${km(nuevoConRumbo.metros)} ($${Math.round(nuevoConRumbo.pesos)}), ${((1 - nuevoConRumbo.pesos / antesConRumbo.pesos) * 100).toFixed(2)} % menos plata que el de antes`);
console.log(`trazado propio: ${km(ruta.distanciaM)} en ${(ruta.duracionS / 60).toFixed(0)} min, ${ruta.trazado.length} puntos (${msTrazado.toFixed(0)} ms)`);
console.log(`armado entero: ${(msMatriz + msNuevo + msTrazado).toFixed(0)} ms (matriz ${msMatriz.toFixed(0)} ms)`);
