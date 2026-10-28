// Prueba de arquitectura (spec 002): hace cumplir las reglas A1–A10 de
// specs/002-reestructuracion-codigo/contracts/estructura-modulos.md.
//
// Nace con las excepciones del estado actual: cada tarea que mueve o divide un
// archivo borra la suya. Una excepción que ya no hace falta también falla, para
// que la lista solo se achique.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(RAIZ, "src");

// ---------- Excepciones del estado actual (se vacían con las tareas de la 002) ----------

/** A1: lib que importa app/components. */
const EXC_A1 = [];
/** A2: components que importa app. */
const EXC_A2 = [];
/** A3: archivo de ui → importaciones fuera de lo permitido. */
const EXC_A3 = {
  "components/ui/*": [],
};
/** A5: los que deben llevar `import "server-only"`. */
const SERVER_ONLY = [
  "lib/supabase/server.ts", "lib/supabase/admin.ts", "lib/auth/sesion.ts", "lib/auth/api-conductor.ts",
  "lib/whatsapp/meta.ts", "lib/comun/periodo-servidor.ts", "lib/encomiendas/lectura/servidor.ts", "lib/encomiendas/lectura/vision.ts",
  "lib/geo/direccion-ia/servidor.ts",
];
/** A5: los que todavía no existen → tarea que los crea. */
const A5_POR_CREAR = {};
/** A6: archivos sueltos en el primer nivel de src/lib. */
const EXC_A6 = [];
/** A7: archivos de más de 400 líneas (spec 002, US3). */
const EXC_A7 = [
  "app/(conductor)/conductor/encomiendas/_mapa/ruta-mapa.tsx",
  "app/(conductor)/conductor/encomiendas/_componentes/pedido-form-local.tsx",
  "app/(conductor)/conductor/encomiendas/_hooks/use-dia-trabajo.ts",
  "app/(app)/encomiendas/actions.ts",
  "app/(app)/encomiendas/page.tsx",
  "app/(app)/encomiendas/agregar-dia.tsx",
  "app/(app)/encomiendas/actividad-dia.tsx",
  "app/(app)/conductores/conductor-panel.tsx",
  "components/direccion/direccion-input.tsx",
];
/** A9: ciclos entre carpetas de lib (como "a>b"). */
const EXC_A9 = [];
/** A10: host contactado → nombre con que figura en docs/PRIVACIDAD.md. */
const PROVEEDORES = {
  "api.mapbox.com": "Mapbox",
  "nominatim.openstreetmap.org": "Nominatim",
  "maps.googleapis.com": "Google Geocoding",
  "vision.googleapis.com": "Google Cloud Vision",
  "graph.facebook.com": "Meta WhatsApp",
  "api.openrouteservice.org": "OpenRouteService",
};
/** A10: hosts que aparecen en el código pero no se contactan. */
const HOSTS_NO_CONTACTADOS = ["www.w3.org"];

// ---------- Lectura del código ----------

const DOMINIOS_LIB = ["auth", "supabase", "geo", "rutas", "whatsapp", "encomiendas", "nativo", "conductores", "comun"];

function archivos(dir) {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? archivos(ruta) : /\.(ts|tsx)$/.test(n) ? [ruta] : [];
  });
}

/** Ruta relativa a src/ con "/" (p. ej. "lib/rutas.ts"). */
const rel = (abs) => relative(SRC, abs).split(sep).join("/");

function esArchivo(ruta) {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

function resolver(especificador, desde) {
  let base;
  if (especificador.startsWith("@/")) base = join(SRC, especificador.slice(2));
  else if (especificador.startsWith(".")) base = join(dirname(desde), especificador);
  else return null;
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(esArchivo) ?? null;
}

const RE_IMPORT = /(?:^|[\s;])(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

const MODULOS = archivos(SRC).map((abs) => {
  const texto = readFileSync(abs, "utf8");
  const especificadores = [...texto.matchAll(RE_IMPORT)].map((m) => m[1] ?? m[2]);
  const internos = [];
  const externos = [];
  for (const e of especificadores) {
    const destino = resolver(e, abs);
    if (destino) internos.push(rel(destino));
    else if (!e.startsWith(".") && !e.startsWith("@/")) externos.push(e);
  }
  return {
    ruta: rel(abs),
    texto,
    lineas: texto.split("\n").length - (texto.endsWith("\n") ? 1 : 0),
    internos,
    externos,
  };
});
const POR_RUTA = new Map(MODULOS.map((m) => [m.ruta, m]));

const directiva = (m, d) => new RegExp(`^\\s*["']${d}["'];?`, "m").test(m.texto.split("\n").slice(0, 15).join("\n"));
const esCliente = (m) => directiva(m, "use client");
const esServidor = (m) =>
  /(^|\/)route\.ts$/.test(m.ruta) ||
  directiva(m, "use server") ||
  /(^|\/)(page|layout)\.tsx$/.test(m.ruta) && !esCliente(m) ||
  /import\s+["']server-only["']/.test(m.texto);

/** Falla si la lista tiene excepciones que ya no hacen falta. */
function sinSobrantes(nombre, excepciones, usadas) {
  const sobran = excepciones.filter((e) => !usadas.has(e));
  assert.deepEqual(sobran, [], `${nombre}: excepciones que ya no hacen falta (borrarlas)`);
}

// ---------- Reglas ----------

test("A1: src/lib no importa src/app ni src/components", () => {
  const malos = MODULOS.filter((m) => m.ruta.startsWith("lib/"))
    .filter((m) => m.internos.some((d) => d.startsWith("app/") || d.startsWith("components/")))
    .map((m) => m.ruta);
  const usadas = new Set(malos.filter((r) => EXC_A1.includes(r)));
  assert.deepEqual(malos.filter((r) => !EXC_A1.includes(r)), []);
  sinSobrantes("A1", EXC_A1, usadas);
});

test("A1b: @capacitor/* solo desde src/lib/nativo", () => {
  const malos = MODULOS.filter((m) => m.externos.some((e) => e.startsWith("@capacitor")))
    .map((m) => m.ruta)
    .filter((r) => !r.startsWith("lib/nativo/"));
  assert.deepEqual(malos, []);
});

test("A2: src/components no importa src/app", () => {
  const malos = MODULOS.filter((m) => m.ruta.startsWith("components/"))
    .filter((m) => m.internos.some((d) => d.startsWith("app/")))
    .map((m) => m.ruta);
  const usadas = new Set(malos.filter((r) => EXC_A2.includes(r)));
  assert.deepEqual(malos.filter((r) => !EXC_A2.includes(r)), []);
  sinSobrantes("A2", EXC_A2, usadas);
});

test("A3: components/ui solo importa react, lucide-react, next/*, lib/comun y ui", () => {
  const externoOk = (e) => ["react", "react-dom", "lucide-react"].includes(e) || e.startsWith("next/") || e.startsWith("react/");
  const internoOk = (d) => d.startsWith("components/ui/") || d.startsWith("lib/comun/");
  const malos = [];
  const usadas = new Set();
  for (const m of MODULOS.filter((x) => x.ruta.startsWith("components/ui/"))) {
    for (const e of m.externos.filter((e) => !externoOk(e))) malos.push(`${m.ruta} → ${e}`);
    for (const d of m.internos.filter((d) => !internoOk(d))) {
      const propia = EXC_A3[m.ruta]?.includes(d);
      const general = EXC_A3["components/ui/*"].includes(d);
      if (propia) usadas.add(`${m.ruta} → ${d}`);
      else if (general) usadas.add(`components/ui/* → ${d}`);
      else malos.push(`${m.ruta} → ${d}`);
    }
  }
  assert.deepEqual(malos, []);
  const todas = Object.entries(EXC_A3).flatMap(([a, ds]) => ds.map((d) => `${a} → ${d}`));
  sinSobrantes("A3", todas, usadas);
});

test("A4: nada del servidor llega a src/lib/encomiendas/local", () => {
  // Desde cada archivo de servidor se siguen sus importaciones hasta un "use client"
  // (ahí empieza el código del navegador).
  const malos = [];
  for (const raiz of MODULOS.filter(esServidor)) {
    const vistos = new Set([raiz.ruta]);
    const pila = [raiz.ruta];
    while (pila.length) {
      const m = POR_RUTA.get(pila.pop());
      for (const d of m?.internos ?? []) {
        if (vistos.has(d)) continue;
        vistos.add(d);
        if (d.startsWith("lib/encomiendas/local/")) {
          malos.push(`${raiz.ruta} → ${d}`);
          continue;
        }
        const dm = POR_RUTA.get(d);
        if (dm && !esCliente(dm)) pila.push(d);
      }
    }
  }
  assert.deepEqual(malos, []);
});

test("A5: llevan import \"server-only\" los módulos con secretos", () => {
  const faltan = [];
  for (const r of SERVER_ONLY) {
    const m = POR_RUTA.get(r);
    if (!m) {
      if (!A5_POR_CREAR[r]) faltan.push(`${r}: no existe`);
    } else if (!/import\s+["']server-only["']/.test(m.texto)) faltan.push(r);
  }
  assert.deepEqual(faltan, []);
  const creados = Object.keys(A5_POR_CREAR).filter((r) => POR_RUTA.has(r));
  assert.deepEqual(creados, [], "A5: ya existen (borrarlos de A5_POR_CREAR)");

  // Leer una variable que no es pública solo en el servidor.
  const secreto = /process\.env\.(?!NEXT_PUBLIC_|NODE_ENV\b)[A-Z_]+/;
  const clientes = MODULOS.filter((m) => secreto.test(m.texto) && (esCliente(m) || !esServidor(m) && !m.ruta.startsWith("lib/")))
    .map((m) => m.ruta);
  assert.deepEqual(clientes, [], "código del navegador que lee un secreto");
  // openrouteservice: solo lo usa el servidor MCP, que corre en Node fuera de Next
  // (ahí "server-only" lanzaría un error); ninguna pantalla lo importa.
  const SOLO_MCP = ["lib/geo/openrouteservice.ts"];
  const libSinGuarda = MODULOS.filter((m) => m.ruta.startsWith("lib/") && secreto.test(m.texto) && !/import\s+["']server-only["']/.test(m.texto))
    .map((m) => m.ruta)
    .filter((r) => !SOLO_MCP.includes(r));
  const pantallasConMcp = MODULOS.filter((m) => m.internos.some((d) => SOLO_MCP.includes(d))).map((m) => m.ruta);
  assert.deepEqual(pantallasConMcp, [], "un módulo solo de MCP terminó importado desde src/");
  assert.deepEqual(libSinGuarda, [], "módulo de lib que lee un secreto sin server-only");
});

test("A6: el primer nivel de src/lib son solo carpetas de dominio", () => {
  const entradas = readdirSync(join(SRC, "lib"));
  const malas = entradas.filter((n) => {
    const carpeta = statSync(join(SRC, "lib", n)).isDirectory();
    return carpeta ? !DOMINIOS_LIB.includes(n) : !EXC_A6.includes(n);
  });
  assert.deepEqual(malas, []);
  sinSobrantes("A6", EXC_A6, new Set(entradas));
});

test("A7: ningún archivo pasa de 400 líneas", () => {
  // Los datos generados por un script (el catálogo de calles, spec 016) no son
  // código: se reconocen por su primera línea.
  const largos = MODULOS.filter((m) => m.lineas > 400 && !m.texto.startsWith("// GENERADO")).map((m) => m.ruta);
  assert.deepEqual(largos.filter((r) => !EXC_A7.includes(r)), []);
  sinSobrantes("A7", EXC_A7, new Set(largos));
});

test("A8: \"chofer\" no aparece en src/, pruebas/ ni mcp/ (spec 002 US2, FR-012)", () => {
  // Excepciones permanentes: leer los eventos que quedaron en la cola del teléfono
  // con el nombre de antes de la migración 0006, y su prueba.
  const PERMITIDOS = ["src/lib/encomiendas/local/almacen/cola.ts", "pruebas/renombrado-conductor.test.mjs"];
  const todos = (dir) =>
    readdirSync(dir).flatMap((n) => {
      const ruta = join(dir, n);
      if (statSync(ruta).isDirectory()) return n === "node_modules" ? [] : todos(ruta);
      return /\.(ts|tsx|mjs|css)$/.test(n) ? [ruta] : [];
    });
  const conChofer = ["src", "pruebas", "mcp"]
    .flatMap((d) => todos(join(RAIZ, d)))
    .filter((f) => !f.endsWith("arquitectura.test.mjs") && /chofer/i.test(readFileSync(f, "utf8")))
    .map((f) => relative(RAIZ, f).split(sep).join("/"))
    .filter((f) => !PERMITIDOS.includes(f));
  assert.deepEqual(conChofer, []);
});

test("A9: sin ciclos entre carpetas de src/lib", () => {
  const dominio = (r) => r.slice("lib/".length).split("/")[0].replace(/\.tsx?$/, "");
  const aristas = new Map();
  for (const m of MODULOS.filter((x) => x.ruta.startsWith("lib/"))) {
    const a = dominio(m.ruta);
    for (const d of m.internos.filter((d) => d.startsWith("lib/"))) {
      const b = dominio(d);
      if (a !== b) aristas.set(a, new Set([...(aristas.get(a) ?? []), b]));
    }
  }
  // Un ciclo a ↔ … ↔ b: b llega de vuelta a a.
  const llega = (desde, hasta, vistos = new Set()) => {
    if (desde === hasta) return true;
    if (vistos.has(desde)) return false;
    vistos.add(desde);
    return [...(aristas.get(desde) ?? [])].some((s) => llega(s, hasta, vistos));
  };
  const ciclos = [];
  for (const [a, destinos] of aristas) for (const b of destinos) if (llega(b, a)) ciclos.push(`${a}>${b}`);
  assert.deepEqual(ciclos.filter((c) => !EXC_A9.includes(c)), []);
  sinSobrantes("A9", EXC_A9, new Set(ciclos));
});

test("A10: todo host contactado figura en docs/PRIVACIDAD.md", () => {
  const privacidad = readFileSync(join(RAIZ, "docs", "PRIVACIDAD.md"), "utf8");
  const sinComentarios = (t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/(^|\s)\/\/.*$/, "")).join("\n");
  const hosts = new Set(
    MODULOS.flatMap((m) => [...sinComentarios(m.texto).matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map((x) => x[1])),
  );
  const malos = [];
  for (const h of hosts) {
    if (HOSTS_NO_CONTACTADOS.includes(h)) continue;
    const proveedor = PROVEEDORES[h];
    if (!proveedor) malos.push(`${h}: agregarlo a PROVEEDORES y a docs/PRIVACIDAD.md`);
    else if (!privacidad.includes(proveedor)) malos.push(`${h}: "${proveedor}" no figura en docs/PRIVACIDAD.md`);
  }
  assert.deepEqual(malos, []);
});
