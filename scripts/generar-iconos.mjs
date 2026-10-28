// Genera los íconos de la PWA y de la APK a partir de public/dashund.svg.
//
// Desde 2026-10-28 el ícono es el logo de Dashund —la empresa que desarrolla
// ARES—: la cara de un perro salchicha, naranja, sobre el crema del tema de la
// app del conductor (src/app/(conductor)/tema-dashund.css). Antes era el
// isotipo "TP" de Transportes Pucarani, recortado de public/logo.png; ese
// archivo queda para documentos.
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
const CREMA_HEX = "#F4F0EC";

if (!fs.existsSync(ORIGEN)) {
  console.error(`No existe ${ORIGEN}`);
  process.exit(1);
}

// El logo a buena resolución: se rasteriza una vez, grande, y se achica.
const marca = await sharp(fs.readFileSync(ORIGEN), { density: 1200 }).png().toBuffer();

// Compone el logo centrado sobre un cuadrado crema. `ocupacion` es la fracción
// del lado que ocupa: menos en el maskable, donde Android recorta hasta un
// círculo del 80 % del lado.
async function componer(lado, ocupacion) {
  const interior = Math.round(lado * ocupacion);
  const escalada = await sharp(marca)
    .resize(interior, interior, { fit: "contain", background: { ...CREMA, alpha: 0 } })
    .toBuffer();
  const margen = Math.round((lado - interior) / 2);
  return sharp({ create: { width: lado, height: lado, channels: 4, background: CREMA } })
    .composite([{ input: escalada, top: margen, left: margen }])
    .png()
    .toBuffer();
}

const salidas = [
  // Android / manifest
  ["icon-192.png", 192, 0.74],
  ["icon-512.png", 512, 0.74],
  // Android maskable: el logo se achica para sobrevivir el recorte circular
  ["icon-maskable-512.png", 512, 0.58],
  // iOS: se referencia desde src/app/(conductor)/layout.tsx; iOS redondea solo
  ["apple-icon.png", 180, 0.74],
];

const soloAndroid = process.argv.includes("--android");

for (const [nombre, lado, ocupacion] of soloAndroid ? [] : salidas) {
  await sharp(await componer(lado, ocupacion)).toFile(path.join(PUBLIC, nombre));
  console.log(`✓ public/${nombre} (${lado}×${lado})`);
}

// APK Android (spec 015). El ícono adaptativo muestra solo el centro (72 de 108 dp):
// el logo va al 0.56 del lado, como en el maskable. Los PNG cuadrado y redondo son
// el respaldo de los lanzadores viejos.
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
    <color name="ic_launcher_background">${CREMA_HEX}</color>
</resources>
`,
  );
  // Pantalla de carga (Android 10 y 11; desde el 12 el sistema usa el ícono): el
  // logo al 30 % del lado corto sobre el crema, respetando el tamaño de cada
  // archivo que trae la plantilla de Capacitor.
  for (const carpeta of fs.readdirSync(RES).filter((d) => d.startsWith("drawable"))) {
    const archivo = path.join(RES, carpeta, "splash.png");
    if (!fs.existsSync(archivo)) continue;
    const { width, height } = await sharp(archivo).metadata();
    const interior = Math.round(Math.min(width, height) * 0.3);
    const escalada = await sharp(marca)
      .resize(interior, interior, { fit: "contain", background: { ...CREMA, alpha: 0 } })
      .toBuffer();
    const destino = await sharp({ create: { width, height, channels: 4, background: CREMA } })
      .composite([{ input: escalada, top: Math.round((height - interior) / 2), left: Math.round((width - interior) / 2) }])
      .png()
      .toBuffer();
    fs.writeFileSync(archivo, destino);
  }
  console.log("✓ android/app/src/main/res (íconos y pantalla de carga de la APK)");
}
