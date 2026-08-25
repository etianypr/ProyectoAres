// Las dos traducciones que TypeScript hace y Node no:
//
//   1. el alias "@/..." del tsconfig → src/...
//   2. los imports sin extensión → .ts / .tsx / index.ts
//
// Vive acá suelto porque lo usan DOS puntos de entrada que corren los archivos
// reales de src/ fuera de Next: las pruebas (./loader.mjs, que además cambia por
// un doble lo que no puede ser real dentro de una prueba) y el servidor MCP
// (../mcp/loader.mjs, que no cambia nada por nada — ahí todo es de verdad).
//
// Antes esto estaba escrito una sola vez, adentro de loader.mjs. Se sacó cuando
// apareció el segundo consumidor y no antes.
import { statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

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

/** Arma el hook `resolve` de Node.
 *
 *  `dobles` es un mapa de especificador → URL del reemplazo. Las pruebas lo
 *  usan para el cliente de Supabase y next/headers; el servidor MCP lo deja
 *  vacío a propósito. */
export function crearResolve(dobles = {}) {
  return async function resolve(specifier, context, next) {
    if (dobles[specifier]) return { url: dobles[specifier], shortCircuit: true };

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
  };
}
