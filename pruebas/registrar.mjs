// Engancha el resolvedor de módulos (ver ./loader.mjs) antes de que se cargue
// ninguna prueba. Se usa con --import, no con --loader:
//
//   node --import ./pruebas/registrar.mjs --test pruebas/
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
