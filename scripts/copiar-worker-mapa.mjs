// Copia el worker de MapLibre a public/ (spec 019). MapLibre 6 lo busca al lado de
// su propio archivo, y al empaquetar Next.js ese "al lado" deja de existir: el
// mapa se quedaba gris. Desde public/ se sirve en /maplibre-gl-worker.mjs, que es
// lo que le dice ruta-mapa.tsx (setWorkerUrl).
//
// Corre solo antes de `npm run dev` y `npm run build` (predev / prebuild), así la
// copia siempre es la de la versión instalada. No va al repositorio (.gitignore).
import fs from "node:fs";
import path from "node:path";

const origen = path.join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const destino = path.join(process.cwd(), "public", "maplibre-gl-worker.mjs");

if (!fs.existsSync(origen)) {
  console.error(`No está ${origen}: falta npm install.`);
  process.exit(1);
}
fs.copyFileSync(origen, destino);
