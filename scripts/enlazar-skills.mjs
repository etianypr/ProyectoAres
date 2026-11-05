// Enlaza cada skill de .agents/skills/ en .claude/skills/, donde la busca Claude Code.
// Git no guarda los enlaces de Windows (junctions): los vería como carpetas y subiría cada
// skill dos veces. Por eso en el repositorio está solo .agents/skills/, los enlaces van en
// .gitignore y este script los recrea en un clon nuevo (AGENTS.md, "Skills y hooks").
//
// En Windows crea junctions, que no piden permisos de administrador; en Linux y macOS, enlaces
// simbólicos relativos. No toca lo que ya existe en .claude/skills/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const origen = path.join(raiz, ".agents", "skills");
const destino = path.join(raiz, ".claude", "skills");

fs.mkdirSync(destino, { recursive: true });

let creados = 0;
for (const entrada of fs.readdirSync(origen, { withFileTypes: true })) {
  if (!entrada.isDirectory()) continue;
  const enlace = path.join(destino, entrada.name);
  if (fs.existsSync(enlace)) continue;
  // Relativo a .claude/skills/: Node lo vuelve absoluto solo en las junctions de Windows.
  fs.symlinkSync(path.join("..", "..", ".agents", "skills", entrada.name), enlace, "junction");
  console.log(`enlazada: ${entrada.name}`);
  creados++;
}
console.log(creados ? `${creados} skills enlazadas.` : "Todas las skills ya estaban enlazadas.");
