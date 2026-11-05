// Hook PreToolUse de Claude Code: antes de un `git commit`, busca en lo que se va
// a commitear datos de destinatarios (AGENTS.md, "Nunca: datos reales de
// destinatarios en el repo"). Nació del commit que se bloqueó el 2026-10-28 con
// una dirección real en el mensaje y en un comentario (MEMORY.md).
//
// No bloquea: si encuentra algo, pide confirmación con la lista de hallazgos.
// Las direcciones no se pueden reconocer con un patrón (las pruebas usan calles
// reales con números inventados), así que esas siguen dependiendo de leer el diff.
//
// Los datos inventados de las pruebas (+56912345678, +56911111111…) no cuentan.

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_HALLAZGOS = 12;
const MAX_BYTES_ARCHIVO_NUEVO = 2 * 1024 * 1024;

function leerEntrada() {
  return new Promise((resolve) => {
    let texto = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (parte) => (texto += parte));
    process.stdin.on("end", () => resolve(texto));
  });
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

/** Un número es inventado si sus 8 dígitos son todos iguales, una escalera o tienen 0000. */
function telefonoInventado(ocho) {
  return /^(\d)\1{7}$/.test(ocho) || ocho.startsWith("1234") || ocho.includes("0000") || ocho === "87654321";
}

function rutInventado(cuerpo) {
  return /^(\d)\1+$/.test(cuerpo) || cuerpo.startsWith("12345");
}

const DOMINIOS_INOFENSIVOS = /(@|\.)(examples?\.(com|cl|org)|ejemplo\.(com|cl)|anthropic\.com|users\.noreply\.github\.com|test|invalid|localhost)$/i;

/** Dibujos vectoriales: sus coordenadas («-1.942.777-2») parecen RUT y no traen datos de nadie. */
const SIN_TEXTO = /\.svg$/i;

/** Tapa el medio para que el aviso no repita el dato completo en la conversación. */
function tapar(texto) {
  const limpio = texto.trim();
  if (limpio.length <= 6) return "***";
  return `${limpio.slice(0, 4)}…${limpio.slice(-2)}`;
}

function buscarEnTexto(texto, donde, hallazgos) {
  for (const m of texto.matchAll(/(?<!\d)\+?56[\s-]?9[\s-]?(\d{4})[\s-]?(\d{4})(?!\d)/g)) {
    if (!telefonoInventado(m[1] + m[2])) hallazgos.push(`${donde}: teléfono ${tapar(m[0])}`);
  }
  for (const m of texto.matchAll(/(?<![\d.-])(\d{1,2})\.(\d{3})\.(\d{3})-[\dkK](?![\dkK.])/g)) {
    if (!rutInventado(m[1] + m[2] + m[3])) hallazgos.push(`${donde}: RUT ${tapar(m[0])}`);
  }
  for (const m of texto.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    if (!DOMINIOS_INOFENSIVOS.test(m[0]) && !m[0].startsWith("git@")) {
      hallazgos.push(`${donde}: correo ${tapar(m[0])}`);
    }
  }
}

/** Archivos que nunca van al repo, aunque no traigan un patrón reconocible. */
function revisarNombres(rutas, hallazgos) {
  for (const ruta of rutas) {
    const nombre = ruta.split("/").pop() ?? ruta;
    if (/^\.env/.test(nombre) && nombre !== ".env.example") hallazgos.push(`${ruta}: archivo de variables de entorno`);
    if (/\.(keystore|jks)$/i.test(nombre)) hallazgos.push(`${ruta}: clave de firma de la APK`);
    if (nombre === "MEMORY.md") hallazgos.push(`${ruta}: la memoria no se versiona`);
    if (/^(pruebas|specs)\//.test(ruta) && /\.(jpe?g|png|webp|heic)$/i.test(nombre)) {
      hallazgos.push(`${ruta}: foto (¿guía o etiqueta real? spec 021, T002)`);
    }
  }
}

function responder(salida) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...salida } }));
}

async function main() {
  const entrada = JSON.parse((await leerEntrada()) || "{}");
  const comando = String(entrada.tool_input?.command ?? "");
  if (!/\bgit\b[^\n|;&]*\bcommit\b/.test(comando)) return;

  const cwd = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
  // El hook corre ANTES del comando: en `git add x && git commit` lo de x todavía
  // no está agregado, y `git commit -a` se lleva lo modificado sin agregar. En esos
  // casos se revisa todo lo que difiere de HEAD, más los archivos nuevos.
  const conAdd = /\bgit\b[^\n|;&]*\badd\b/.test(comando);
  const todo = conAdd || /\bcommit\b[^\n]*\s(-[a-zA-Z]*a[a-zA-Z]*|--all)\b/.test(comando);
  const base = todo ? ["diff", "HEAD"] : ["diff", "--cached"];

  const hallazgos = [];
  revisarNombres(git([...base, "--name-only", "--diff-filter=AM"], cwd).split("\n").filter(Boolean), hallazgos);

  if (conAdd) {
    const nuevos = git(["ls-files", "--others", "--exclude-standard", "-z"], cwd).split("\0").filter(Boolean);
    revisarNombres(nuevos, hallazgos);
    // Las skills de .claude/skills son enlaces a .agents/skills: el mismo archivo aparece dos veces.
    const vistos = new Set();
    for (const ruta of nuevos) {
      const completa = join(cwd, ruta);
      const info = statSync(completa, { throwIfNoEntry: false });
      if (!info?.isFile() || info.size > MAX_BYTES_ARCHIVO_NUEVO || SIN_TEXTO.test(ruta)) continue;
      const real = realpathSync(completa);
      if (vistos.has(real)) continue;
      vistos.add(real);
      const contenido = readFileSync(completa, "utf8");
      if (contenido.includes("\0")) continue;
      contenido.split("\n").forEach((texto, i) => buscarEnTexto(texto, `${ruta}:${i + 1}`, hallazgos));
    }
  }

  let archivo = "";
  let linea = 0;
  for (const fila of git([...base, "-U0", "--no-color", "--no-ext-diff"], cwd).split("\n")) {
    if (fila.startsWith("+++ ")) {
      archivo = fila.replace(/^\+\+\+ (b\/)?/, "");
    } else if (fila.startsWith("@@")) {
      linea = Number(/\+(\d+)/.exec(fila)?.[1] ?? 0);
    } else if (fila.startsWith("+")) {
      if (!SIN_TEXTO.test(archivo)) buscarEnTexto(fila.slice(1), `${archivo}:${linea}`, hallazgos);
      linea += 1;
    }
  }
  // El mensaje viaja dentro del comando (-m "…" o un heredoc).
  buscarEnTexto(comando, "mensaje del commit", hallazgos);

  if (hallazgos.length === 0) {
    responder({
      additionalContext:
        "revisar-commit: sin teléfonos, RUT ni correos reales. Las direcciones no se detectan solas: confirma que el diff y el mensaje no traen una dirección real.",
    });
    return;
  }
  const lista = hallazgos.slice(0, MAX_HALLAZGOS).map((h) => `- ${h}`);
  if (hallazgos.length > MAX_HALLAZGOS) lista.push(`- … y ${hallazgos.length - MAX_HALLAZGOS} más`);
  responder({
    permissionDecision: "ask",
    permissionDecisionReason: `Posibles datos de destinatarios en el commit (AGENTS.md: nunca al repo):\n${lista.join("\n")}\nSi son datos inventados, confirma; si no, sácalos antes de commitear.`,
  });
}

main().catch((error) => {
  // Un error del hook no frena el commit, pero se ve.
  process.stderr.write(`revisar-commit: ${error.message}\n`);
});
