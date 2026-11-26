// Mide el armado de la ruta con la red de calles propia (spec 031), sin red y sin
// datos de nadie: los puntos son los del fixture (al azar sobre calles de Arica).
//
//   npm run medir                         el día de 80 paradas, 5 corridas
//   npm run medir -- 40                   las primeras 40 (de 3 a 80)
//   npm run medir -- 80 --corridas=3      menos corridas (también «--corridas 3»)
//   npm run medir -- --sin-escenarios     sin las estrategias (confirmados, horarios)
//
// Dice los «km en el aire»: lo que creía medir el orden de antes (de punto a punto,
// girando en U gratis), lo que ese orden cuesta de verdad con rumbo, y lo que
// cuesta el orden buscado con rumbo. Para comparar un cambio: correrlo antes y después.
//
// Spec 038 (tiempos): cada etapa da la mediana de N corridas (y el mínimo y el
// máximo), dice si es de CPU de un tirón (la pantalla queda quieta) o cedida
// (correrSinCongelar le devuelve el turno), y un hash corto (sha1) de lo que salió:
// el orden, los sentidos y el costo. Un cambio que promete la misma ruta tiene que
// dejar los hashes idénticos; solo bajan los ms. Los escenarios son los de la
// prueba dorada (pruebas/038-escenarios-ruta.mjs): 10 confirmados, 5 con bloque y
// un «Pidió otra hora».
import { createHash } from "node:crypto";
import { ordenarParadas } from "@/lib/rutas/orden-paradas";
import { mejoresEstados, tableroDe } from "@/lib/rutas/orden-paradas/con-rumbo";
import { buscarConRumbo } from "@/lib/rutas/orden-paradas/con-rumbo-busqueda";
import { adelantarBultosConRumbo } from "@/lib/rutas/orden-paradas/descarga-con-rumbo";
import { correrSinCongelar } from "@/lib/rutas/orden-paradas/sin-congelar";
import { matrizDeCosto, pesosDeManejar } from "@/lib/encomiendas/local/generar-ruta/pesos";
import { medirConRumbo, prepararRedDelDia } from "@/lib/encomiendas/local/generar-ruta/red-del-dia";
import { METROS_POR_PARADA, TOLERANCIA_DESCARGA } from "@/lib/encomiendas/local/generar-ruta/bultos";
import { cargarRed } from "@/lib/geo/red/grafo";
import { rutaPorLaRed } from "@/lib/geo/ruta-por-calles";
import { contarVueltasEnU } from "@/lib/geo/trazado";
import { bultosAlAzar, DIA, ESCENARIOS, estrategiasDelEscenario, pedidosDelEscenario } from "../pruebas/038-escenarios-ruta.mjs";

// Un argumento mal escrito no se adivina ni se ignora: una medición con otra
// cantidad de paradas o de corridas que la pedida compara peras con manzanas.
const MAXIMO = DIA.puntos.length - 1;
const USO = `uso: npm run medir [-- N] [--corridas=N] [--sin-escenarios]   (paradas de 3 a ${MAXIMO}; corridas, un entero desde 1)`;
function salirConUso(motivo) {
  console.error(`${motivo}\n${USO}`);
  process.exit(1);
}
const argumentos = process.argv.slice(2);
let numero = null;
let textoCorridas = null;
let conEscenarios = true;
for (let k = 0; k < argumentos.length; k++) {
  const a = argumentos[k];
  if (a === "--sin-escenarios") conEscenarios = false;
  else if (a.startsWith("--corridas=")) textoCorridas = a.slice("--corridas=".length);
  else if (a === "--corridas") textoCorridas = argumentos[++k] ?? "";
  else if (/^\d+$/.test(a) && numero == null) numero = a;
  else salirConUso(`no entiendo «${a}»`);
}
const cuantas = numero == null ? MAXIMO : Number(numero);
if (cuantas < 3 || cuantas > MAXIMO) salirConUso(`las paradas van de 3 a ${MAXIMO}, no ${numero}`);
if (textoCorridas != null && !/^[1-9]\d*$/.test(textoCorridas)) salirConUso(`las corridas son un entero desde 1, no «${textoCorridas}»`);
const corridas = textoCorridas == null ? 5 : Number(textoCorridas);
const puntos = DIA.puntos.slice(0, cuantas + 1);
const reloj = () => performance.now();
const km = (m) => `${(m / 1000).toFixed(2)} km`;

/** sha1 corto de lo que salió: un número se escribe con todos sus bits. */
function huella(valor) {
  const texto = JSON.stringify(valor, (_, v) =>
    typeof v === "number" ? (Object.is(v, -0) ? "-0" : Number.isFinite(v) ? v : String(v)) : ArrayBuffer.isView(v) ? Array.from(v) : v,
  );
  return createHash("sha1").update(texto).digest("hex").slice(0, 10);
}

/** Las etapas en el orden en que aparecen: tiempos de cada corrida y su hash. */
const etapas = new Map();
async function etapa(nombre, tipo, fn, resumen = (x) => x) {
  const t = reloj();
  const valor = await fn();
  const ms = reloj() - t;
  const h = huella(resumen(valor));
  const e = etapas.get(nombre) ?? { tipo, ms: [], hash: h, distinto: false };
  e.ms.push(ms);
  if (e.hash !== h) e.distinto = true;
  etapas.set(nombre, e);
  return valor;
}
const mediana = (xs) => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};

// La primera carga de la red (importar y armar el grafo) va aparte: pasa una vez al día.
let t = reloj();
await cargarRed();
const msCargarRed = reloj() - t;

/** Lo de la última corrida, para las cifras de km y plata. */
let ultima = null;
for (let corrida = 0; corrida < corridas; corrida++) {
  const red = await etapa("matriz con rumbo", "cedida", () => prepararRedDelDia(puntos, false), (r) => {
    if (!r) throw new Error("no se pudo pegar algún punto a la red");
    return [r.dia.costo, r.metros];
  });
  const costo = matrizDeCosto(red.metros, red.segundos);
  const vuelta = (i) => costo[i][0];

  // El orden de antes: a fondo, sobre la matriz de punto a punto.
  const antes = await etapa("sin rumbo a fondo (orden de antes)", "CPU", () =>
    ordenarParadas(puntos, costo, vuelta, true, { arranquePorMetros: { matriz: red.metros, vuelta: (i) => red.metros[i][0] } }).slice(1),
  );
  // Lo que corre calcularRutaLocal: el arranque sin rumbo, la búsqueda y los bultos.
  const rapido = await etapa("sin rumbo rápido (arranque)", "CPU", () => ordenarParadas(puntos, costo, vuelta, false).slice(1));
  const ruta = await etapa("con rumbo: búsqueda", "cedida", () => correrSinCongelar(buscarConRumbo(red.dia, [rapido])));
  // La ruta entera (orden, sentidos y costo) va al hash; el trazado usa el orden.
  const conBultos = await etapa("con rumbo: bultos", "CPU", () =>
    adelantarBultosConRumbo(tableroDe(red.dia), ruta, {
      bultos: puntos.map(() => 1),
      metros: red.conRumbo.metros,
      tolerancia: TOLERANCIA_DESCARGA,
      metrosPorParada: METROS_POR_PARADA,
    }),
  );
  const nuevo = conBultos.orden;
  const trazado = await etapa(
    "trazado propio",
    "CPU",
    () => rutaPorLaRed([puntos[0], ...nuevo.map((i) => puntos[i]), puntos[0]], pesosDeManejar),
    (r) => [r.distanciaM, r.duracionS, r.trazado],
  );
  ultima = { red, antes, nuevo, trazado };

  if (conEscenarios) {
    // Lo mismo que diaConRed (cerrada), con lo ya calculado arriba.
    const dia = { cuantas, puntos, red, matriz: red.metros, costo, sinRumbo: rapido };
    for (const nombre of Object.keys(ESCENARIOS)) {
      // «5 con bloque» con bultos de 1 a 4 (como la prueba dorada); los otros sin escanear.
      const bultos = nombre === "5 con bloque" ? bultosAlAzar(cuantas + 1, 17) : null;
      // ordenarConRumboDelDia devuelve solo el orden; sus sentidos son los que la app
      // le saca después (mejoresEstados, como medirConRumbo) y van al hash con él.
      const resumen = (paso) => (o) =>
        paso === "corta con rumbo" ? mejoresEstados(tableroDe(red.dia), o) : Array.isArray(o) ? o.map((x) => x.id ?? x) : o;
      await estrategiasDelEscenario(dia, pedidosDelEscenario(nombre, cuantas, bultos), (paso, fn) =>
        etapa(`${nombre}: ${paso}`, paso.includes("rumbo") || paso.includes("con horarios") ? "cedida" : "CPU", fn, resumen(paso)),
      );
    }
  }
}

const { red, antes, nuevo, trazado } = ultima;
const creia = [0, ...antes, 0].reduce((s, p, k, o) => (k === 0 ? 0 : s + red.metros[o[k - 1]][p]), 0);
const antesConRumbo = medirConRumbo(red, antes);
const nuevoConRumbo = medirConRumbo(red, nuevo);
const ms = (nombre) => mediana(etapas.get(nombre).ms);
const msNuevo = ms("sin rumbo rápido (arranque)") + ms("con rumbo: búsqueda") + ms("con rumbo: bultos");

console.log(`${cuantas} paradas, mediana de ${corridas} corrida${corridas === 1 ? "" : "s"}`);
console.log(`orden de antes (sin rumbo, ${ms("sin rumbo a fondo (orden de antes)").toFixed(0)} ms): creía ${km(creia)}; con rumbo son ${km(antesConRumbo.metros)} ($${Math.round(antesConRumbo.pesos)})`);
console.log(`  en el aire: ${km(antesConRumbo.metros - creia)} (+${((antesConRumbo.metros / creia - 1) * 100).toFixed(1)} %)`);
console.log(`orden con rumbo (${msNuevo.toFixed(0)} ms): ${km(nuevoConRumbo.metros)} ($${Math.round(nuevoConRumbo.pesos)}), ${((1 - nuevoConRumbo.pesos / antesConRumbo.pesos) * 100).toFixed(2)} % menos plata que el de antes`);
console.log(`trazado propio: ${km(trazado.distanciaM)} en ${(trazado.duracionS / 60).toFixed(0)} min, ${trazado.trazado.length} puntos, ${contarVueltasEnU(trazado.trazado)} vueltas en U (${ms("trazado propio").toFixed(0)} ms)`);
console.log(`armado entero: ${(ms("matriz con rumbo") + msNuevo + ms("trazado propio")).toFixed(0)} ms (matriz ${ms("matriz con rumbo").toFixed(0)} ms; cargar la red la 1ª vez, ${msCargarRed.toFixed(0)} ms aparte)`);
console.log("");
console.log("etapa".padEnd(48) + "tipo    " + "mediana".padStart(9) + "  mín–máx".padEnd(16) + "hash");
for (const [nombre, e] of etapas) {
  const rango = `${Math.min(...e.ms).toFixed(0)}–${Math.max(...e.ms).toFixed(0)}`;
  const aviso = e.distinto ? "  ¡distinto entre corridas!" : "";
  console.log(`${nombre.padEnd(48)}${e.tipo.padEnd(8)}${`${mediana(e.ms).toFixed(0)} ms`.padStart(9)}  ${rango.padEnd(14)}${e.hash}${aviso}`);
}
console.log(`hash de todo: ${huella([...etapas].map(([nombre, e]) => [nombre, e.hash]))}`);
