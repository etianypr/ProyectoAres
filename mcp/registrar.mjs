// Engancha el resolvedor de módulos antes de que se cargue el servidor. Se usa
// con --import, no con --loader:
//
//   node --import ./mcp/registrar.mjs mcp/servidor.ts
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
