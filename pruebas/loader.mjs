// Deja que las pruebas importen los archivos REALES del proyecto —no una copia
// ni un puerto— con dos traducciones que TypeScript hace y Node no:
//
//   1. el alias "@/..." del tsconfig → src/...
//   2. los imports sin extensión → .ts / .tsx / index.ts
//
// Además cambia por un doble los módulos que en una prueba no pueden ser los de
// verdad: el cliente de Supabase (red) y next/headers (solo existe dentro del
// servidor de Next).
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

const DOBLES = {
  "@/lib/supabase/client": new URL("./dobles/supabase-client.mjs", import.meta.url).href,
  "next/headers": new URL("./dobles/next-headers.mjs", import.meta.url).href,
};

// Ojo: se comprueba que sea un ARCHIVO, no solo que exista. Con existsSync a
// secas, "pruebas/" (el directorio que le pasa --test a Node) daba positivo y
// el corredor terminaba intentando importar la carpeta.
function esArchivo(ruta) {
  try {
    return statSync(ruta).isFile();
  } catch {
    return false;
  }
}

function conExtension(base) {
  return [base, base + ".ts", base + ".tsx", base + "/index.ts"].find(esArchivo) ?? null;
}

export async function resolve(specifier, context, next) {
  if (DOBLES[specifier]) return { url: DOBLES[specifier], shortCircuit: true };

  if (specifier.startsWith("@/")) {
    const encontrado = conExtension(SRC + specifier.slice(2));
    if (encontrado) return { url: pathToFileURL(encontrado).href, shortCircuit: true };
  }

  // Import relativo sin extensión desde un .ts del proyecto.
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const abs = fileURLToPath(new URL(specifier, context.parentURL));
    const encontrado = conExtension(abs);
    if (encontrado) return { url: pathToFileURL(encontrado).href, shortCircuit: true };
  }

  return next(specifier, context);
}
