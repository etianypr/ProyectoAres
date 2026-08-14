// Genera los íconos de la PWA a partir de public/logo.png.
//
// El logo original es vertical (982×1200) e incluye el texto "TRANSPORTES
// PUCARANI" y márgenes blancos: sirve para documentos, pero como ícono de
// pantalla de inicio queda diminuto y con bordes muertos. Acá se recorta solo
// el isotipo "TP", se invierte azul<->blanco (conservando el amarillo) y se
// compone centrado sobre un cuadrado azul de marca.
//
// Correr después de cambiar public/logo.png:
//   node scripts/generar-iconos.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const RAIZ = process.cwd();
const PUBLIC = path.join(RAIZ, "public");
const ORIGEN = path.join(PUBLIC, "logo.png");

// Paleta real del logo (muestreada de public/logo.png). El azul coincide con
// --brand de src/app/globals.css.
const AZUL = [12, 63, 155];
const AMARILLO = [251, 196, 18];
const BLANCO = [255, 255, 255];
const FONDO = { r: AZUL[0], g: AZUL[1], b: AZUL[2], alpha: 1 };

// Recorta el isotipo: la mitad superior del logo (sin el texto), ajustada a
// sus bordes reales. Da un cuadrado exacto porque el isotipo es un círculo.
async function recortarIsotipo() {
  const meta = await sharp(ORIGEN).metadata();
  const superior = await sharp(ORIGEN)
    .extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * 0.68) })
    .toBuffer();
  return sharp(superior).trim({ threshold: 10 }).toBuffer();
}

// Invierte azul<->blanco y deja el amarillo intacto, para que la marca se lea
// sobre el fondo azul lleno del ícono.
async function invertir(entrada) {
  const { data, info } = await sharp(entrada)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (g - b > 60 && r > 150) {
      [data[i], data[i + 1], data[i + 2]] = AMARILLO;
      continue;
    }
    // El canal rojo separa limpio el azul (12) del blanco (255), así que sirve
    // de mezcla y conserva el antialias de los bordes.
    const t = Math.min(1, Math.max(0, (255 - r) / 243));
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.round(AZUL[c] + (BLANCO[c] - AZUL[c]) * t);
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

// Compone la marca centrada sobre un cuadrado azul.
// `ocupacion` es la fracción del lado que ocupa la marca: 0.62 para el ícono
// maskable, donde Android recorta hasta un círculo del 80% del lado.
async function componer(marca, lado, ocupacion) {
  const interior = Math.round(lado * ocupacion);
  const escalada = await sharp(marca)
    .resize(interior, interior, { fit: "contain", background: FONDO })
    .toBuffer();
  const margen = Math.round((lado - interior) / 2);

  return sharp({ create: { width: lado, height: lado, channels: 4, background: FONDO } })
    .composite([{ input: escalada, top: margen, left: margen }])
    .png()
    .toBuffer();
}

if (!fs.existsSync(ORIGEN)) {
  console.error(`No existe ${ORIGEN}`);
  process.exit(1);
}

const marca = await invertir(await recortarIsotipo());

const salidas = [
  // Android / manifest
  ["icon-192.png", 192, 0.78],
  ["icon-512.png", 512, 0.78],
  // Android maskable: la marca se achica para sobrevivir el recorte circular
  ["icon-maskable-512.png", 512, 0.62],
  // iOS: se referencia desde src/app/(conductor)/layout.tsx; iOS redondea solo
  ["apple-icon.png", 180, 0.78],
];

for (const [nombre, lado, ocupacion] of salidas) {
  const destino = path.join(PUBLIC, nombre);
  await sharp(await componer(marca, lado, ocupacion)).toFile(destino);
  console.log(`✓ public/${nombre} (${lado}×${lado})`);
}
