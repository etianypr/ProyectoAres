// Genera los íconos de la PWA y de la APK a partir de public/dashund.svg.
//
// El ícono es el logo de Dashund —la empresa que desarrolla ARES—. Desde
// 2026-11-23 es «Estela» (dueño): un perro salchicha corriendo, de lado, en crema
// sobre una placa naranja de Dashund. Antes (2026-10-28) era la cara del perro,
// naranja sobre crema. La pantalla de carga de la APK sigue en crema con el perro
// naranja, como la de la app (src/app/(conductor)/loading.tsx).
//
// El logo es ancho (2,44 : 1): las `ocupacion` de abajo son del ANCHO del lado.
//
// Correr después de cambiar public/dashund.svg:
//   node scripts/generar-iconos.mjs            (web + Android)
//   node scripts/generar-iconos.mjs --android  (solo los íconos de la APK, spec 015)
// La APK toma los íconos nuevos recién al compilarla e instalarla de nuevo.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RAIZ = process.cwd();
const PUBLIC = path.join(RAIZ, "public");
const ORIGEN = path.join(PUBLIC, "dashund.svg");

/** El crema del tema (--background en tema-dashund.css). */
const CREMA = { r: 0xf4, g: 0xf0, b: 0xec, alpha: 1 };
/** El naranja de Dashund (--naranja-dashund en tema-dashund.css): el fondo del ícono. */
const NARANJA = { r: 0xd4, g: 0x53, b: 0x1a, alpha: 1 };
const NARANJA_HEX = "#D4531A";

if (!fs.existsSync(ORIGEN)) {
  console.error(`No existe ${ORIGEN}`);
  process.exit(1);
}

// El logo a buena resolución: se rasteriza una vez, grande, y se achica. Para el
// ícono va en crema (el mismo dibujo con otro relleno); para la pantalla de carga,
// en su naranja.
const svg = fs.readFileSync(ORIGEN, "utf8");
const rasterizar = (texto) => sharp(Buffer.from(texto), { density: 1200 }).png().toBuffer();
const marcaNaranja = await rasterizar(svg);
const marcaCrema = await rasterizar(svg.replaceAll('fill="#d4531a"', 'fill="#f4f0ec"'));

// El logo centrado en un rectángulo de `lado` × `lado` · `ocupacion`, sobre transparente.
async function escalar(marca, lado, ocupacion) {
  const interior = Math.round(lado * ocupacion);
  return sharp(marca)
    .resize(interior, interior, { fit: "contain", background: { ...CREMA, alpha: 0 } })
    .toBuffer();
}

// Compone el logo en crema centrado sobre un cuadrado naranja. `ocupacion` es la
// fracción del lado que ocupa a lo ancho: menos en el maskable y en el adaptativo,
// donde Android recorta hasta un círculo.
async function componer(lado, ocupacion) {
  const escalada = await escalar(marcaCrema, lado, ocupacion);
  const margen = Math.round((lado - Math.round(lado * ocupacion)) / 2);
  return sharp({ create: { width: lado, height: lado, channels: 4, background: NARANJA } })
    .composite([{ input: escalada, top: margen, left: margen }])
    .png()
    .toBuffer();
}

const salidas = [
  // Android / manifest
  ["icon-192.png", 192, 0.74],
  ["icon-512.png", 512, 0.74],
  // Android maskable: el logo se achica para sobrevivir el recorte circular (un
  // círculo del 80 % del lado). Ancho como es, al 0.66 sus puntas quedan adentro.
  ["icon-maskable-512.png", 512, 0.66],
  // iOS: se referencia desde src/app/(conductor)/layout.tsx; iOS redondea solo
  ["apple-icon.png", 180, 0.74],
];

const soloAndroid = process.argv.includes("--android");

for (const [nombre, lado, ocupacion] of soloAndroid ? [] : salidas) {
  await sharp(await componer(lado, ocupacion)).toFile(path.join(PUBLIC, nombre));
  console.log(`✓ public/${nombre} (${lado}×${lado})`);
}

// APK Android (spec 015). El ícono adaptativo muestra solo el centro (72 de 108 dp)
// y lo recorta hasta un círculo de 66 dp: el logo va al 0.56 del lado, el ancho
// máximo con que sus puntas caben en ese círculo. Los PNG cuadrado y redondo son el
// respaldo de los lanzadores viejos.
const RES = path.join(RAIZ, "android", "app", "src", "main", "res");
if (fs.existsSync(RES)) {
  const densidades = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [nombre, factor] of Object.entries(densidades)) {
    const dir = path.join(RES, `mipmap-${nombre}`);
    const lado = Math.round(48 * factor);
    const cuadrado = await componer(lado, 0.74);
    await sharp(cuadrado).toFile(path.join(dir, "ic_launcher.png"));
    const circulo = Buffer.from(
      `<svg width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2}"/></svg>`,
    );
    await sharp(cuadrado)
      .composite([{ input: circulo, blend: "dest-in" }])
      .png()
      .toFile(path.join(dir, "ic_launcher_round.png"));
    const frente = Math.round(108 * factor);
    await sharp(await componer(frente, 0.56)).toFile(path.join(dir, "ic_launcher_foreground.png"));
  }
  fs.writeFileSync(
    path.join(RES, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${NARANJA_HEX}</color>
</resources>
`,
  );
  // Pantalla de carga (Android 10 y 11; desde el 12 el sistema usa el ícono): el
  // logo naranja al 40 % del lado corto (de ancho) sobre el crema, respetando el
  // tamaño de cada archivo que trae la plantilla de Capacitor.
  for (const carpeta of fs.readdirSync(RES).filter((d) => d.startsWith("drawable"))) {
    const archivo = path.join(RES, carpeta, "splash.png");
    if (!fs.existsSync(archivo)) continue;
    const { width, height } = await sharp(archivo).metadata();
    const interior = Math.round(Math.min(width, height) * 0.4);
    const escalada = await escalar(marcaNaranja, Math.min(width, height), 0.4);
    const destino = await sharp({ create: { width, height, channels: 4, background: CREMA } })
      .composite([{ input: escalada, top: Math.round((height - interior) / 2), left: Math.round((width - interior) / 2) }])
      .png()
      .toBuffer();
    fs.writeFileSync(archivo, destino);
  }
  console.log("✓ android/app/src/main/res (íconos y pantalla de carga de la APK)");
}
